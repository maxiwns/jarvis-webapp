
/*
 * JARVIS 0.9 – Erste echte Auftragsausführung
 *
 * POST /api/agent-run
 * Body: { "jobId": "..." }
 *
 * Vorerst nur das freigegebene Werkzeug "reports".
 */

import { runReport } from '../_lib/run-report.js';

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

  return runReport(env, jobId, body.retry === true);
}
