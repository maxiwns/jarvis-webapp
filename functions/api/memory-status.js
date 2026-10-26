
export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json(
      { status: "error", message: "D1 binding missing" },
      { status: 503 }
    );
  }

  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('chats', 'messages', 'memories') ORDER BY name"
    ).all();

    return Response.json({
      status: "connected",
      database: "jarvis-memory",
      tables: result.results.map(row => row.name)
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json(
      { status: "error", message: "Database query failed" },
      { status: 500 }
    );
  }
}
