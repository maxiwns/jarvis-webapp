
/* JARVIS 0.9 – Chat, persönliche Aufgaben und JARVIS-Aufträge */

const BACKEND_URL = "https://jarvis-backend.maxiwiens.workers.dev";

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
      Authorization: "Bearer " + env.JARVIS_BACKEND_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error("JARVIS AI endpoint failed", path, response.status);
    throw new Error("AI backend returned " + response.status);
  }

  return response.json();
}

/*
 * JARVIS – Second Brain im normalen Chat
 *
 * Erkennt ausdrückliche Fragen nach gespeichertem
 * Wissen, sucht in D1 und nutzt die Answer Engine.
 *
 * Gibt null zurück, wenn keine Wissensfrage vorliegt.
 */

async function maybeAnswerFromBrain(env, message) {
  
/*
 * Bei normalen Chatfragen prüfen wir,
 * ob im Second Brain passendes Wissen liegt.
 *
 * Die vorgeschaltete Intent-Erkennung verhindert,
 * dass Aufgaben und Aufträge hier landen.
 */
const isQuestion =
  /[?]$/.test(message.trim()) ||
  /^(was|wie|welche|welcher|welches|warum|wozu|erkläre|erzähl|erzähle|zeige|gib mir|kannst du mir)/i
    .test(message.trim());

if (!isQuestion) {
  return null;
}


  const stopwords = new Set([
    "was", "wissen", "haben", "hatten",
    "gespeichert", "festgehalten",
    "unserem", "unseren", "unserer",
    "meinem", "meinen", "deinem",
    "deinen", "second", "brain",
    "über", "dazu", "zum", "eine",
    "einen", "einem", "wurde",
    "wurden", "bereits", "schon",
    "bitte", "kannst", "können",
    "findest", "finden", "thema",
    "informationen", "welche",
    "erinnerst", "dich","alles", "sagen", "erzählen",
    "erzähle", "kann", "kannst",
    "geben", "zeige", "welcher",
    "welches", "darüber", "etwas",
    "bitte", "mir", "uns",
  ]);

  const words = [
    ...new Set(
      message.toLowerCase()
        .match(/[\p{L}\p{N}]{4,}/gu) || []
    )
  ]
    .filter(word => !stopwords.has(word))
    .slice(0, 6);

  if (words.length === 0) {
    return "Zu welchem Thema soll ich mein Second Brain durchsuchen?";
  }

  const patterns = words.map(word => {
    const escaped = word
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");

    return "%" + escaped + "%";
  });

  const clauses = patterns.map(() => `
    (
      title LIKE ? ESCAPE '\\'
      OR summary LIKE ? ESCAPE '\\'
      OR content LIKE ? ESCAPE '\\'
      OR tags LIKE ? ESCAPE '\\'
    )
  `);

  const params = patterns.flatMap(pattern => [
    pattern, pattern, pattern, pattern
  ]);

  const result = await env.DB.prepare(
    `SELECT
       id,
       title,
       summary,
       verification_status
     FROM brain_entries
     WHERE ${clauses.join(" OR ")}
     ORDER BY created_at DESC
     LIMIT 15`
  ).bind(...params).all();

  const entries = result.results || [];

  if (entries.length === 0) {
    return "Dazu habe ich noch keine passenden Informationen in meinem Second Brain gespeichert.";
  }

  const answerResult = await callAI(
    env,
    "/api/brain-answer",
    {
      question: message,
      entries
    }
  );

  if (
    answerResult.success !== true ||
    typeof answerResult.answer !== "string" ||
    !answerResult.answer.trim()
  ) {
    throw new Error("Invalid Second Brain answer");
  }

  return answerResult.answer.trim();
}

function validDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function safeIntent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const actions = ["create_task", "create_order", "sensitive_action", "chat"];
  if (!actions.includes(value.action)) return null;
  if (value.action === "chat") return { action: "chat" };
  if (typeof value.title !== "string") return null;

  const title = value.title.trim();
  if (title.length < 3 || title.length > 160) return null;

  const due = typeof value.due === "string" ? value.due : "";
  if (!validDate(due)) return null;

  const priority = ["low", "normal", "high"].includes(value.priority)
    ? value.priority : "normal";
  const area = typeof value.area === "string" &&
    value.area.trim().length <= 40
    ? value.area.trim() || "Allgemein" : "Allgemein";

  return { action: value.action, title, due, priority, area };
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

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

  if (typeof chatId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(chatId) ||
      typeof message !== "string" ||
      message.trim().length < 5 || message.length > 2000) {
    return reply({ error: "Invalid request" }, 400);
  }
  if (!["auto", "llama"].includes(model)) {
    return reply({ error: "Model not enabled" }, 403);
  }

  const currentMessage = message.trim();

  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id = ?"
    ).bind(chatId).first();
    if (!chat) return reply({ error: "Chat not found" }, 404);
  } catch {
    return reply({ error: "Database unavailable" }, 503);
  }

  let intent;
  try {
    const detected = await callAI(env, "/api/intent", {
      message: currentMessage
    });
    if (detected.success !== true || detected.executed !== false) {
      throw new Error("Invalid intent response");
    }
    intent = safeIntent(detected.intent);
    if (!intent) throw new Error("Unrecognized intent response");
  } catch {
    return reply({
      error: "Absicht konnte nicht sicher erkannt werden. Bitte erneut versuchen."
    }, 502);
  }

  let answer;
  let taskId = null;
  let jobId = null;
  let answerSource = "normal_chat"

  if (intent.action === "create_task") {
    taskId = crypto.randomUUID();
    answer = "Erledigt. Ich habe „" + intent.title +
      "“ auf deine Aufgabenliste gesetzt." +
      (intent.due ? " Fällig am " + intent.due + "." : "");
  } else if (intent.action === "create_order") {
    jobId = crypto.randomUUID();
    answer = "Ich habe deinen Auftrag „" + intent.title +
      "“ gespeichert. Status: offen. Die automatische Bearbeitung " +
      "ist noch nicht eingerichtet; ich habe die Arbeit noch nicht gestartet.";
  } else if (intent.action === "sensitive_action") {
    answer = "Du möchtest eine sensible Aktion durchführen: „" +
      intent.title + "“. Dafür ist eine Freigabe nötig. " +
      "Die dauerhafte Freigabeverwaltung ist noch nicht verbunden. " +
      "Ich habe nichts ausgeführt und keine Freigabe angelegt.";
  } else {
    let history;
    try {
      const result = await env.DB.prepare(
        `SELECT role, content FROM messages
         WHERE chat_id = ? ORDER BY rowid DESC LIMIT 10`
      ).bind(chatId).all();
      history = (result.results || []).reverse();
    } catch {
      return reply({ error: "Conversation history unavailable" }, 503);
    }

    const previousMessages = [];
    let availableCharacters = 12000 - currentMessage.length;
    for (const item of history.reverse()) {
      if (!["user", "assistant"].includes(item.role) ||
          typeof item.content !== "string") continue;
      const content = item.content.trim().slice(0, 4000);
      if (!content) continue;
      if (content.length > availableCharacters) break;
      previousMessages.push({ role: item.role, content });
      availableCharacters -= content.length;
    }
    previousMessages.reverse();

    
try {
  const brainReply = await maybeAnswerFromBrain(
    env,
    currentMessage
  );
  if (brainReply !== null) {
  answerSource = "second_brain";
}

  const data = brainReply !== null
    ? { reply: brainReply }
    : await callAI(env, "/api/conversation", {
        messages: [
          ...previousMessages,
          {
            role: "user",
            content: currentMessage
          }
        ]
      });

      if (typeof data.reply !== "string" ||
          !data.reply.trim() || data.reply.length > 8000) {
        return reply({ error: "Invalid AI response" }, 502);
      }
      answer = data.reply.trim();
    } catch {
      return reply({ error: "AI unavailable" }, 502);
    }
  }

  // Änderungen zusammen speichern. D1 batch führt die Statements
  // transaktional aus: Chat und Aktion werden gemeinsam geschrieben.
  const writes = [];

  if (taskId !== null) {
    writes.push(env.DB.prepare(
      `INSERT INTO tasks
       (id, title, area, priority, due, done, source)
       VALUES (?, ?, ?, ?, ?, 0, 'chat')`
    ).bind(taskId, intent.title, intent.area, intent.priority, intent.due));
  }

  if (jobId !== null) {
    writes.push(env.DB.prepare(
      `INSERT INTO agent_jobs
       (id, title, instruction, status, source)
       VALUES (?, ?, ?, 'open', 'chat')`
    ).bind(jobId, intent.title, currentMessage));
  }

  writes.push(
    env.DB.prepare(
      `INSERT INTO messages (id, chat_id, role, content)
       VALUES (?, ?, 'user', ?)`
    ).bind(crypto.randomUUID(), chatId, currentMessage),
    env.DB.prepare(
      `INSERT INTO messages (id, chat_id, role, content)
       VALUES (?, ?, 'assistant', ?)`
    ).bind(crypto.randomUUID(), chatId, answer),
    env.DB.prepare(
      `UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(chatId)
  );

  try {
    await env.DB.batch(writes);
  } catch (error) {
    console.error("JARVIS D1 save failed", error?.name || "Error");
    return reply({ error: "Action or conversation could not be saved" }, 500);
  }

  return reply({
    status: "success",
    saved: true,
    answerSource,
    model: "llama-3.1",
    action: intent.action,
    taskId,
    jobId,
    reply: answer
  });
}
