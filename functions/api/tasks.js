
// JARVIS 0.9 – Cloud-Aufgabenverwaltung (D1)
// Zugriffsschutz erfolgt über functions/_middleware.js

function respond(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function sameOrigin(request) {
  const url = new URL(request.url);
  return request.headers.get("Origin") === url.origin;
}

async function readBody(request) {
  const type = request.headers.get("Content-Type") || "";

  if (!type.toLowerCase().startsWith("application/json")) {
    return { error: "JSON required", status: 415 };
  }

  const raw = await request.text();

  if (raw.length > 2048) {
    return { error: "Request too large", status: 413 };
  }

  try {
    return { data: JSON.parse(raw) };
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
}

// Aufgaben laden
export async function onRequestGet({ env }) {
  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, title, area, priority,
              due, done, source,
              created_at, updated_at
       FROM tasks
       ORDER BY done ASC, created_at DESC
       LIMIT 200`
    ).all();

    return respond({
      success: true,
      tasks: result.results || []
    });

  } catch {
    return respond({ error: "Could not load tasks" }, 500);
  }
}

// Neue Aufgabe erstellen
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return respond({ error: "Forbidden" }, 403);
  }

  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  const parsed = await readBody(request);

  if (parsed.error) {
    return respond({ error: parsed.error }, parsed.status);
  }

  const body = parsed.data;

  if (!body || typeof body !== "object" ||
      Array.isArray(body)) {
    return respond({ error: "Invalid request" }, 400);
  }

  const title = body.title;
  const area = body.area ?? "Allgemein";
  const priority = body.priority ?? "normal";
  const due = body.due ?? "";
  const source = body.source ?? "manual";

  const areas = [
    "Business",
    "Projekte",
    "Privat",
    "Kirche & Gemeinde",
    "Allgemein"
  ];

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160 ||
    !areas.includes(area) ||
    !["normal", "high", "low"].includes(priority) ||
    typeof due !== "string" ||
    (due !== "" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
       !Number.isFinite(Date.parse(due)) ||
       new Date(due).toISOString().slice(0, 10) !== due)) ||
    !["manual", "chat"].includes(source)
  ) {
    return respond({ error: "Invalid task" }, 400);
  }

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO tasks
       (id, title, area, priority, due, done, source)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).bind(
      id,
      title.trim(),
      area,
      priority,
      due,
      source
    ).run();

    return respond({
      success: true,
      task: {
        id,
        title: title.trim(),
        area,
        priority,
        due,
        done: 0,
        source
      }
    }, 201);

  } catch {
    return respond({ error: "Could not create task" }, 500);
  }
}

// Aufgabe als erledigt oder offen markieren
export async function onRequestPatch({ request, env }) {
  if (!sameOrigin(request)) {
    return respond({ error: "Forbidden" }, 403);
  }

  if (!env.DB) {
    return respond({ error: "Database unavailable" }, 503);
  }

  const parsed = await readBody(request);

  if (parsed.error) {
    return respond({ error: parsed.error }, parsed.status);
  }

  const body = parsed.data;

  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(body.id) ||
    typeof body.done !== "boolean"
  ) {
    return respond({ error: "Invalid request" }, 400);
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE tasks
       SET done = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      body.done ? 1 : 0,
      body.id
    ).run();

    if (result.meta?.changes !== 1) {
      return respond({ error: "Task not found" }, 404);
    }

    return respond({
      success: true,
      id: body.id,
      done: body.done
    });

  } catch {
    return respond({ error: "Could not update task" }, 500);
  }
}
