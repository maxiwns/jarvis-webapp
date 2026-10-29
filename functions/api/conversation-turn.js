
/*
 * JARVIS 0.9 – Chat und intelligente Aktionssteuerung
 * Persönliche Aufgaben werden direkt in D1 gespeichert.
 */

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function callAI(env, path, body) {
  const response = await fetch(BACKEND_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " + env.JARVIS_BACKEND_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error(
      "JARVIS AI endpoint failed",
      path,
      response.status
    );
    throw new Error(
      "AI backend returned " + response.status
    );
  }

  return response.json();
}

function safeIntent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const actions = [
    "create_task",
    "create_order",
    "sensitive_action",
    "chat"
  ];

  if (!actions.includes(value.action)) {
    return null;
  }

  if (value.action === "chat") {
    return { action: "chat" };
  }

  if (typeof value.title !== "string") {
    return null;
  }

  const title = value.title.trim();

  if (title.length < 3 || title.length > 160) {
    return null;
  }

  const due =
    typeof value.due === "string"
      ? value.due
      : "";

  if (
    due &&
    !/^\d{4}-\d{2}-\d{2}$/.test(due)
  ) {
    return null;
  }

  if (
    due &&
    Number.isNaN(
      Date.parse(due + "T12:00:00Z")
    )
  ) {
    return null;
  }

  const priority = [
    "low",
    "normal",
    "high"
  ].includes(value.priority)
    ? value.priority
    : "normal";

  const area =
    typeof value.area === "string" &&
    value.area.trim().length <= 40
      ? value.area.trim() || "Allgemein"
      : "Allgemein";

  return {
    action: value.action,
    title,
    due,
    priority,
    area
  };
}

export async function onRequestPost({
  request,
  env
}) {
  const url = new URL(request.url);

  if (
    request.headers.get("Origin") !==
    url.origin
  ) {
    return reply({
      error: "Forbidden"
    }, 403);
  }

  if (
    !env.DB ||
    !env.JARVIS_BACKEND_API_KEY
  ) {
    return reply({
      error: "Service not configured"
    }, 503);
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    !contentType.toLowerCase()
      .startsWith("application/json")
  ) {
    return reply({
      error: "JSON required"
    }, 415);
  }

  const raw = await request.text();

  if (raw.length > 4000) {
    return reply({
      error: "Request too large"
    }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return reply({
      error: "Invalid JSON"
    }, 400);
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
    return reply({
      error: "Invalid request"
    }, 400);
  }

  if (!["auto", "llama"].includes(model)) {
    return reply({
      error: "Model not enabled"
    }, 403);
  }

  const currentMessage = message.trim();

  // Prüfen, ob der Chat existiert.
  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();

    if (!chat) {
      return reply({
        error: "Chat not found"
      }, 404);
    }
  } catch {
    return reply({
      error: "Database unavailable"
    }, 503);
  }

  // Zuerst die Absicht erkennen.
  let intent;

  try {
    const detected = await callAI(
      env,
      "/api/intent",
      {
        message: currentMessage
      }
    );

    if (
      detected.success !== true ||
      detected.executed !== false
    ) {
      throw new Error(
        "Invalid intent response"
      );
    }

    intent = safeIntent(detected.intent);

    if (!intent) {
      throw new Error(
        "Unrecognized intent response"
      );
    }

  } catch {
    return reply({
      error:
        "Absicht konnte nicht sicher erkannt " +
        "werden. Bitte erneut versuchen."
    }, 502);
  }

  let answer;
  let taskId = null;

  if (intent.action === "create_task") {

    // Persönliche Aufgabe sofort speichern.
    // Kein zusätzlicher Freigabeklick.
    answer =
      "Erledigt. Ich habe „" +
      intent.title +
      "“ auf deine Aufgabenliste gesetzt." +
      (
        intent.due
          ? " Fällig am " + intent.due + "."
          : ""
      );

    taskId = crypto.randomUUID();

  } else if (
    intent.action === "create_order"
  ) {

    // Auftragsausführung folgt später.
    answer =
      "Ich habe verstanden, dass ich diesen " +
      "Auftrag für dich bearbeiten soll: „" +
      intent.title +
      "“. Die automatische Auftragsausführung " +
      "ist noch nicht eingerichtet. " +
      "Ich habe deshalb noch keinen Auftrag gestartet.";

  } else if (
    intent.action === "sensitive_action"
  ) {

    // Sensible Aktionen niemals direkt ausführen.
    answer =
      "Du möchtest eine sensible Aktion durchführen: „" +
      intent.title +
      "“. Dafür ist eine Freigabe nötig. " +
      "Die dauerhafte Freigabeverwaltung " +
      "ist noch nicht verbunden. " +
      "Ich habe nichts ausgeführt.";

  } else {

    // Normaler KI-Chat mit Gesprächsverlauf.
    let history;

    try {
      const result = await env.DB.prepare(
        `SELECT role, content
         FROM messages
         WHERE chat_id = ?
         ORDER BY rowid DESC
         LIMIT 10`
      ).bind(chatId).all();

      history =
        (result.results || []).reverse();

    } catch {
      return reply({
        error:
          "Conversation history unavailable"
      }, 503);
    }

    const previousMessages = [];

    let availableCharacters =
      12000 - currentMessage.length;

    for (const item of history.reverse()) {
      if (
        !["user", "assistant"]
          .includes(item.role) ||
        typeof item.content !== "string"
      ) {
        continue;
      }

      const content = item.content
        .trim()
        .slice(0, 4000);

      if (!content) continue;

      if (
        content.length >
        availableCharacters
      ) {
        break;
      }

      previousMessages.push({
        role: item.role,
        content
      });

      availableCharacters -= content.length;
    }

    previousMessages.reverse();

    try {
      const data = await callAI(
        env,
        "/api/conversation",
        {
          messages: [
            ...previousMessages,
            {
              role: "user",
              content: currentMessage
            }
          ]
        }
      );

      if (
        typeof data.reply !== "string" ||
        !data.reply.trim() ||
        data.reply.length > 8000
      ) {
        return reply({
          error: "Invalid AI response"
        }, 502);
      }

      answer = data.reply.trim();

    } catch {
      return reply({
        error: "AI unavailable"
      }, 502);
    }
  }

  /*
   * Aufgabe und Chatnachrichten zusammen
   * in Cloudflare D1 speichern.
   */
  const writes = [];

  if (taskId !== null) {
    writes.push(
      env.DB.prepare(
        `INSERT INTO tasks
         (
           id,
           title,
           area,
           priority,
           due,
           done,
           source
         )
         VALUES (?, ?, ?, ?, ?, 0, 'chat')`
      ).bind(
        taskId,
        intent.title,
        intent.area,
        intent.priority,
        intent.due
      )
    );
  }

  writes.push(
    env.DB.prepare(
      `INSERT INTO messages
       (id, chat_id, role, content)
       VALUES (?, ?, 'user', ?)`
    ).bind(
      crypto.randomUUID(),
      chatId,
      currentMessage
    ),

    env.DB.prepare(
      `INSERT INTO messages
       (id, chat_id, role, content)
       VALUES (?, ?, 'assistant', ?)`
    ).bind(
      crypto.randomUUID(),
      chatId,
      answer
    ),

    env.DB.prepare(
      `UPDATE chats
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(chatId)
  );

  try {
    await env.DB.batch(writes);
  } catch {
    return reply({
      error:
        "Action or conversation could not be saved"
    }, 500);
  }

  // Erst jetzt darf JARVIS Erfolg melden.
  return reply({
    status: "success",
    saved: true,
    model: "llama-3.1",
    action: intent.action,
    taskId,
    reply: answer
  });
}
