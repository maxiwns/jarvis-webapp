
export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Datenbank nicht verbunden" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const chatId = body?.chatId;

    if (
      typeof chatId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId)
    ) {
      return Response.json(
        { error: "Ungültige Chat-ID" },
        { status: 400 }
      );
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();

    if (!existing) {
      return Response.json(
        { error: "Chat nicht gefunden" },
        { status: 404 }
      );
    }

    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM memories WHERE source_chat_id = ?"
      ).bind(chatId),

      env.DB.prepare(
        "DELETE FROM messages WHERE chat_id = ?"
      ).bind(chatId),

      env.DB.prepare(
        "DELETE FROM chats WHERE id = ?"
      ).bind(chatId)
    ]);

    return Response.json({
      status: "success",
      deleted: true
    });

  } catch (error) {
    console.error("Chat deletion failed", error);

    return Response.json(
      { error: "Chat konnte nicht gelöscht werden" },
      { status: 500 }
    );
  }
}
