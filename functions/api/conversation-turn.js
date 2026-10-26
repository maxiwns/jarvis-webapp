
// JARVIS 0.9 – KI-Antworten sicher in D1 speichern

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // Nur Anfragen unserer eigenen Webseite erlauben.
  if (request.headers.get("Origin") !== url.origin) {
    return reply({ error: "Forbidden" }, 403);
  }

  if (!env.DB || !env.JARVIS_BACKEND_API_KEY) {
    return reply({ error: "Service not configured" }, 503);
  }

  const type = request.headers.get("Content-Type") || "";

  if (!type.toLowerCase().startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

  // Begrenzte Anfragegröße.
  const raw = await request.text();

  if (raw.length > 4000) {
    return reply({ error: "Request too large" }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const chatId = body?.chatId;
  const message = body?.message;
  const model = body?.model || "auto";

  if (
    typeof chatId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(chatId) ||
    typeof message !== "string" ||
    message.trim().length < 5 ||
    message.length > 2000
  ) {
    return reply({ error: "Invalid request" }, 400);
  }

  // Kostenpflichtige Modelle bleiben deaktiviert.
  if (!["auto", "llama"].includes(model)) {
    return reply({ error: "Model not enabled" }, 403);
  }

  // Nur vorhandene Chats verwenden.
  let chat;

  try {
    chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();
  } catch {
    return reply({ error: "Database unavailable" }, 503);
  }

  if (!chat) {
    return reply({ error: "Chat not found" }, 404);
  }

  let answer;

  // Vorhandenes Llama-Backend verwenden.
  try {
    const result = await fetch(
      BACKEND_URL + "/api/plan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            "Bearer " + env.JARVIS_BACKEND_API_KEY
        },
        body: JSON.stringify({
          auftrag: message.trim()
        })
      }
    );

    if (!result.ok) {
      return reply({
        error: "AI backend failed",
        backendStatus: result.status
      }, 502);
    }

    const data = await result.json();

    answer = data.plan;

    if (
      typeof answer !== "string" ||
      answer.length === 0 ||
      answer.length > 8000
    ) {
      return reply({ error: "Invalid AI response" }, 502);
    }
  } catch {
    return reply({ error: "AI unavailable" }, 502);
  }

  // Beide Nachrichten gemeinsam speichern.
  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages
         (id, chat_id, role, content)
         VALUES (?, ?, 'user', ?)`
      ).bind(userId, chatId, message.trim()),

      env.DB.prepare(
        `INSERT INTO messages
         (id, chat_id, role, content)
         VALUES (?, ?, 'assistant', ?)`
      ).bind(assistantId, chatId, answer),

      env.DB.prepare(
        `UPDATE chats
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(chatId)
    ]);

    return reply({
      status: "success",
      saved: true,
      model: "llama-3.1",
      reply: answer
    });

  } catch {
    return reply({
      error: "Conversation could not be saved"
    }, 500);
  }
}
