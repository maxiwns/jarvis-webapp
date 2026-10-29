
/*
 * JARVIS 0.9 – Auftragsmanager API
 *
 * GET  /api/agent-jobs
 * POST /api/agent-jobs
 *
 * Verwaltet KI-Aufträge in Cloudflare D1.
 * Führt noch keine Aufträge selbstständig aus.
 */

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return reply({
      error: "Database unavailable"
    }, 503);
  }

  try {
    const result = await env.DB.prepare(
      `SELECT
         id,
         title,
         instruction,
         status,
         result,
         error,
         source,
         created_at,
         updated_at,
         completed_at
       FROM agent_jobs
       ORDER BY created_at DESC, rowid DESC
       LIMIT 100`
    ).all();

    return reply({
      success: true,
      jobs: result.results || []
    });

  } catch (error) {
    console.error(
      "JARVIS agent jobs GET failed",
      error?.name || "Error"
    );

    return reply({
      error: "Could not load jobs"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // Nur Anfragen der eigenen Webseite akzeptieren.
  if (
    request.headers.get("Origin") !==
    url.origin
  ) {
    return reply({
      error: "Forbidden"
    }, 403);
  }

  if (!env.DB) {
    return reply({
      error: "Database unavailable"
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

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 10000) {
      return reply({
        error: "Request too large"
      }, 413);
    }

    body = JSON.parse(raw);

  } catch {
    return reply({
      error: "Invalid JSON"
    }, 400);
  }

  const title = body?.title;
  const instruction = body?.instruction;

  if (
    typeof title !== "string" ||
    title.trim().length < 3 ||
    title.length > 160 ||
    typeof instruction !== "string" ||
    instruction.trim().length < 5 ||
    instruction.length > 8000
  ) {
    return reply({
      error: "Invalid job"
    }, 400);
  }

  const id = crypto.randomUUID();

  // Anlegen heißt noch nicht Ausführen.
  const status = "open";
  const source = "manual";

  try {
    await env.DB.prepare(
      `INSERT INTO agent_jobs
       (
         id,
         title,
         instruction,
         status,
         source
       )
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      id,
      title.trim(),
      instruction.trim(),
      status,
      source
    ).run();

    const job = await env.DB.prepare(
      `SELECT *
       FROM agent_jobs
       WHERE id = ?`
    ).bind(id).first();

    if (!job) {
      return reply({
        error: "Job could not be verified"
      }, 500);
    }

    return reply({
      success: true,
      job
    }, 201);

  } catch (error) {
    console.error(
      "JARVIS agent jobs POST failed",
      error?.name || "Error"
    );

    return reply({
      error: "Could not create job"
    }, 500);
  }
}
