
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
    const title = typeof body?.title === "string"
      ? body.title.replace(/\s+/g, " ").trim()
      : "";

    if (
      typeof chatId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId) ||
      !title ||
      title.length > 80
    ) {
      return Response.json(
        { error: "Ungültige Chat-ID oder Titel" },
        { status: 400 }
      );
    }

    const result = await env.DB.prepare(
      `UPDATE chats
       SET title = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND title = 'Neuer Chat'`
    ).bind(title, chatId).run();

    return Response.json({
      status: "success",
      renamed: result.meta?.changes === 1
    });

  } catch (error) {
    console.error("Chat rename failed", error);
    return Response.json(
      { error: "Chat konnte nicht umbenannt werden" },
      { status: 500 }
    );
  }
}
