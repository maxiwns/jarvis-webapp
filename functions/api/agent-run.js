
/*
 * JARVIS 0.9 – Erste echte Auftragsausführung
 *
 * POST /api/agent-run
 * Body: { "jobId": "..." }
 *
 * Vorerst nur das freigegebene Werkzeug "reports".
 */

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

// Some installations restrict job states with a SQLite CHECK. Use the
// names declared by that table for all three writes, including completion.
async function jobStates(db) {
  const row = await db.prepare(
    "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'agent_jobs'"
  ).first();
  const match = /\bCHECK\s*\(\s*["`\[]?status["`\]]?\s+IN\s*\(([^()]+)\)/i.exec(row?.sql || "");
  const allowed = match && new Set(
    Array.from(match[1].matchAll(/['"]([a-z_]+)['"]/gi), token => token[1])
  );
  const choose = (...names) => allowed ? names.find(name => allowed.has(name)) : names[0];
  return {
    allowed: allowed ? [...allowed].slice(0, 15).join(", ").slice(0, 180) : "",
    running: choose("running", "in_progress", "processing"),
    completed: choose("completed", "done"),
    failed: choose("failed", "error")
  };
}

function startError(error) {
  const reason = [error?.message, error?.cause?.message].join(" ");
  if (/CHECK constraint/i.test(reason)) return "D1 lehnt den Statuswechsel durch eine Tabellenregel ab.";
  if (/NOT NULL constraint/i.test(reason)) return "D1 verlangt beim Start einen Wert für ein Pflichtfeld.";
  if (/no such column/i.test(reason)) return "In der Auftragstabelle fehlt eine benötigte Spalte.";
  return "D1 konnte den Auftrag nicht zur Bearbeitung reservieren.";
}

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;

  if (request.headers.get("Origin") !== origin) {
    return reply({ error: "Forbidden" }, 403);
  }

  if (!env.DB || !env.JARVIS_BACKEND_API_KEY) {
    return reply({ error: "Service not configured" }, 503);
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 2000) {
      return reply({ error: "Request too large" }, 413);
    }

    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const jobId = body?.jobId;

  if (
    typeof jobId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(jobId)
  ) {
    return reply({ error: "Invalid jobId" }, 400);
  }

  // Auftrag laden.
  let job;

  try {
    job = await env.DB.prepare(
      `SELECT id, title, instruction, status
       FROM agent_jobs
       WHERE id = ?`
    ).bind(jobId).first();
  } catch {
    return reply({ error: "Database unavailable" }, 503);
  }

  if (!job) {
    return reply({ error: "Job not found" }, 404);
  }

  if (job.status !== "open") {
    return reply({
      error: "Job is not open",
      status: job.status
    }, 409);
  }

  if (
    typeof job.instruction !== "string" ||
    !job.instruction.trim() ||
    job.instruction.length > 8000
  ) {
    return reply({ error: "Invalid job instruction" }, 400);
  }

  // Auftrag atomar reservieren.
  // Verhindert parallele Ausführung desselben Auftrags.
  let states;
  try {
    states = await jobStates(env.DB);
    if (!states.running || !states.completed || !states.failed) {
      return reply({ error: "Der Auftragsablauf passt nicht zu den Statuswerten in D1: " + states.allowed }, 500);
    }
    const claim = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'open'`
    ).bind(states.running, jobId).run();

    if (claim.meta?.changes !== 1) {
      return reply({
        error: "Job was already claimed"
      }, 409);
    }
  } catch (error) {
    const reason = startError(error);
    console.error("JARVIS job claim failed", reason);
    return reply({ error: reason }, 500);
  }

  try {
    // Erste sichere Agentenfähigkeit:
    // Einen Bericht tatsächlich durch Workers AI erzeugen.
    const response = await fetch(
      BACKEND_URL + "/api/tool-execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + env.JARVIS_BACKEND_API_KEY
        },
        body: JSON.stringify({
          // The backend router accepts `tool`, not the executor's
          // internal parameter name `toolId`.
          tool: "reports",
          args: {
            instruction: job.instruction
          }
        }),
        signal: AbortSignal.timeout(25000)
      }
    );

    if (!response.ok) {
      throw new Error(
        "Backend execution failed: HTTP " + response.status
      );
    }

    const data = await response.json();

    if (data.success !== true || data.executed !== true) {
      throw new Error(
        typeof data.error === "string"
          ? data.error.slice(0, 300)
          : "Tool did not execute successfully"
      );
    }

    const report = data.result?.report;

    if (typeof report !== "string" || !report.trim()) {
      throw new Error("No report returned");
    }

    // Fertiges Ergebnis dauerhaft sichern.
    const completed = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = ?,
           result = ?,
           error = '',
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ?`
    ).bind(states.completed, report.slice(0, 30000), jobId, states.running).run();

    if (completed.meta?.changes !== 1) {
      throw new Error("Job completion could not be saved");
    }

    return reply({
      success: true,
      jobId,
      status: states.completed,
      tool: "reports",
      result: report,
      sourceBased: data.result?.sourceBased === true,
      sourceUrls: Array.isArray(data.result?.sourceUrls)
        ? data.result.sourceUrls
        : []
    });

  } catch (error) {
    const message =
      error?.name === "TimeoutError"
        ? "Execution timed out"
        : (error?.message || "Execution failed");

    console.error(
      "JARVIS agent execution failed",
      error?.name || "Error"
    );

    // Auch fehlgeschlagene Aufträge nachvollziehbar speichern.
    try {
      const failure = await env.DB.prepare(
        `UPDATE agent_jobs
         SET status = ?,
             error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ?`
      ).bind(states.failed, message.slice(0, 500), jobId, states.running).run();
      if (failure.meta?.changes !== 1) throw new Error("Job state changed");
    } catch {
      console.error("Could not persist job failure");
      return reply({ success: false, jobId, error: "Der Abschlussstatus konnte nicht in D1 gespeichert werden." }, 503);
    }

    return reply({
      success: false,
      jobId,
      status: states.failed,
      error: message
    }, 502);
  }
}
