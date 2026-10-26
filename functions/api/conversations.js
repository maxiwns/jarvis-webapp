
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


export async function onRequestPost() {
  return Response.json(
    {
      error: "Direct message writes disabled",
      message:
        "Use /api/conversation-turn for AI conversations."
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
