
// JARVIS 0.9 – Geschützte Chatverwaltung (D1)

function respond(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, title, include_in_memory,
              created_at, updated_at
       FROM chats
       ORDER BY updated_at DESC
       LIMIT 100`
    ).all();

    return respond({ chats: result.results });
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

  if (raw.length > 2048) {
    return respond({ error: "Request too large" }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }

  const title = body?.title;

  if (
    typeof title !== "string" ||
    title.trim().length < 1 ||
    title.length > 80
  ) {
    return respond({ error: "Invalid title" }, 400);
  }

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO chats (id, title)
       VALUES (?, ?)`
    ).bind(id, title.trim()).run();

    return respond({
      success: true,
      chat: {
        id,
        title: title.trim()
      }
    }, 201);
  } catch {
    return respond({ error: "Could not create chat" }, 500);
  }
}
