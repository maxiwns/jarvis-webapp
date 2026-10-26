
// JARVIS 0.9 – Nachrichten in Cloudflare D1

function respond(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  const chatId = new URL(request.url).searchParams.get("chatId");

  if (!chatId || chatId.length > 100) {
    return respond({ error: "Invalid chatId" }, 400);
  }

  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();

    if (!chat) {
      return respond({ error: "Chat not found" }, 404);
    }

    const result = await env.DB.prepare(
      `SELECT id, chat_id, role, content, created_at
       FROM messages
       WHERE chat_id = ?
       ORDER BY created_at ASC, rowid ASC
       LIMIT 200`
    ).bind(chatId).all();

    return respond({ messages: result.results });
  } catch {
    return respond({ error: "Database query failed" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  if (request.headers.get("Origin") !== url.origin) {
    return respond({ error: "Forbidden" }, 403);
  }

  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return respond({ error: "JSON required" }, 415);
  }

  const raw = await request.text();

  if (raw.length > 12000) {
    return respond({ error: "Request too large" }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }

  const { chatId, role, content } = body || {};

  if (
    typeof chatId !== "string" ||
    chatId.length < 1 ||
    chatId.length > 100 ||
    !["user", "assistant"].includes(role) ||
    typeof content !== "string" ||
    content.trim().length < 1 ||
    content.length > 8000
  ) {
    return respond({ error: "Invalid message data" }, 400);
  }

  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();

    if (!chat) {
      return respond({ error: "Chat not found" }, 404);
    }

    const id = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages (id, chat_id, role, content)
         VALUES (?, ?, ?, ?)`
      ).bind(id, chatId, role, content.trim()),
      env.DB.prepare(
        `UPDATE chats
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(chatId)
    ]);

    return respond({
      success: true,
      message: {
        id,
        chat_id: chatId,
        role,
        content: content.trim()
      }
    }, 201);
  } catch {
    return respond({ error: "Could not save message" }, 500);
  }
}
