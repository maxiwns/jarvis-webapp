
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
  try {
    const claim = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = 'running',
           error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'open'`
    ).bind(jobId).run();

    if (claim.meta?.changes !== 1) {
      return reply({
        error: "Job was already claimed"
      }, 409);
    }
  } catch {
    return reply({ error: "Could not start job" }, 500);
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
          toolId: "reports",
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

    const report =
      data.result?.report ??
      data.result?.result?.report;

    if (typeof report !== "string" || !report.trim()) {
      throw new Error("No report returned");
    }

    // Fertiges Ergebnis dauerhaft sichern.
    const completed = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = 'completed',
           result = ?,
           error = NULL,
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'running'`
    ).bind(report.slice(0, 30000), jobId).run();

    if (completed.meta?.changes !== 1) {
      throw new Error("Job completion could not be saved");
    }

    return reply({
      success: true,
      jobId,
      status: "completed",
      tool: "reports",
      result: report,
      sourceBased: false
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
      await env.DB.prepare(
        `UPDATE agent_jobs
         SET status = 'failed',
             error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'running'`
      ).bind(message.slice(0, 500), jobId).run();
    } catch {
      console.error("Could not persist job failure");
    }

    return reply({
      success: false,
      jobId,
      status: "failed",
      error: message
    }, 502);
  }
}
