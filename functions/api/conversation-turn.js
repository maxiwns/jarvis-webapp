
// JARVIS 0.9 – Strukturierte KI-Gespräche mit D1-Speicherung

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // Zugriff nur von der eigenen Webseite.
  if (request.headers.get("Origin") !== url.origin) {
    return reply({ error: "Forbidden" }, 403);
  }

  if (!env.DB || !env.JARVIS_BACKEND_API_KEY) {
    return reply({ error: "Service not configured" }, 503);
  }

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

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

  // Nur bereits eingerichtete kostenlose Modelle.
  if (!["auto", "llama"].includes(model)) {
    return reply({ error: "Model not enabled" }, 403);
  }

  const currentMessage = message.trim();

  // Prüfen, ob der Chat existiert.
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

  // Die zehn letzten Nachrichten aus D1 lesen.
  let history;

  try {
    const result = await env.DB.prepare(
      `SELECT role, content
       FROM messages
       WHERE chat_id = ?
       ORDER BY rowid DESC
       LIMIT 10`
    ).bind(chatId).all();

    history = (result.results || []).reverse();

  } catch {
    return reply({
      error: "Conversation history unavailable"
    }, 503);
  }

  // Gesprächsverlauf als echte Modell-Nachrichten aufbauen.
  // Neuere Nachrichten haben Vorrang.
  const previousMessages = [];

  let availableCharacters = 12000 - currentMessage.length;

  for (const item of history.reverse()) {
    if (
      !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string"
    ) {
      continue;
    }

    const content = item.content.trim();

    if (!content) continue;

    // Pro Nachricht maximal 4000 Zeichen.
    const shortened = content.slice(0, 4000);

    if (shortened.length > availableCharacters) {
      break;
    }

    previousMessages.push({
      role: item.role,
      content: shortened
    });

    availableCharacters -= shortened.length;
  }

  previousMessages.reverse();

  // Die aktuelle Nachricht ist immer die letzte User-Nachricht.
  const messages = [
    ...previousMessages,
    {
      role: "user",
      content: currentMessage
    }
  ];

  let answer;

  // Neue Chat-API des Workers verwenden.
  try {
    const result = await fetch(
      BACKEND_URL + "/api/conversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            "Bearer " + env.JARVIS_BACKEND_API_KEY
        },
        body: JSON.stringify({ messages })
      }
    );

    if (!result.ok) {
      console.error("JARVIS backend returned", result.status);

      return reply({
        error: "AI backend failed",
        backendStatus: result.status
      }, 502);
    }

    const data = await result.json();

    answer = data.reply;

    if (
      typeof answer !== "string" ||
      !answer.trim() ||
      answer.length > 8000
    ) {
      return reply({
        error: "Invalid AI response"
      }, 502);
    }

    answer = answer.trim();

  } catch (error) {
    console.error("JARVIS backend connection failed", {
      name: error?.name || "Error"
    });

    return reply({
      error: "AI unavailable"
    }, 502);
  }

  // User-Nachricht und KI-Antwort gemeinsam in D1 speichern.
  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages
         (id, chat_id, role, content)
         VALUES (?, ?, 'user', ?)`
      ).bind(userId, chatId, currentMessage),

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

  } catch {
    return reply({
      error: "Conversation could not be saved"
    }, 500);
  }

  return reply({
    status: "success",
    saved: true,
    model: "llama-3.1",
    reply: answer
  });
}
