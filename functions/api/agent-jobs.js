
/*
 * JARVIS 0.9 – Auftragsmanager API
 *
 * GET  /api/agent-jobs
 * POST /api/agent-jobs
 * DELETE /api/agent-jobs?jobId=...&status=...
 *
 * Verwaltet KI-Aufträge in Cloudflare D1.
 * Führt noch keine Aufträge selbstständig aus.
 */

import { expiredReportSql } from "../_lib/run-report.js";
import { readReport } from "../_lib/report-data.js";
import { hasQueue, queueStatuses } from "../_lib/queue-status.js";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) {
    return reply({
      error: "Database unavailable"
    }, 503);
  }

  try {
    const params = request && new URL(request.url).searchParams;
    if (params?.has("jobId")) {
      const row = await env.DB.prepare(
        `SELECT j.title,j.result FROM agent_jobs j JOIN messages m ON m.id=j.id
         WHERE j.id=? AND m.chat_id=? AND m.role='assistant' AND j.status IN ('done','completed')`
      ).bind(params.get("jobId"),params.get("chatId") || "").first();
      if (!row) return reply({error:"Bericht nicht mehr verfügbar."},404);
      return reply({success:true, title:row.title, ...readReport(row.result)});
    }
    const result = await env.DB.prepare(
      `SELECT
         id,
         title,
         instruction,
         status,
         (${expiredReportSql}) AS expired,
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

    const queues = await queueStatuses(env.DB, result.results || []);
    return reply({
      success: true,
      jobs: (result.results || []).map(job => {
        const report = readReport(job.result);
        return {...job, result:report.text, sources:report.sources, queue:queues.get(job.id) || null};
      })
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

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) {
    return reply({ error: "Forbidden" }, 403);
  }
  if (!env.DB) return reply({ error: "Datenbank nicht verfügbar." }, 503);

  const id = url.searchParams.get("jobId");
  const status = url.searchParams.get("status");
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || "")) {
    return reply({ error: "Ungültige Auftrags-ID." }, 400);
  }
  if (!["completed", "done", "failed", "error"].includes(status)) {
    return reply({ error: "Nur abgeschlossene oder fehlgeschlagene Berichte lassen sich löschen." }, 409);
  }

  try {
    const queueGuard = await hasQueue(env.DB)
      ? " AND NOT EXISTS (SELECT 1 FROM report_queue WHERE job_id = agent_jobs.id)" : "";
    const skillTable=await env.DB.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='jarvis_skill_versions'").first();
    const skillGuard=skillTable ? " AND NOT EXISTS (SELECT 1 FROM jarvis_skill_versions WHERE job_id=agent_jobs.id)" : "";
    const deletion = await env.DB.prepare(
      `DELETE FROM agent_jobs WHERE id = ? AND status = ?
       AND NOT EXISTS (SELECT 1 FROM brain_entries WHERE source_job_id = agent_jobs.id)${queueGuard}${skillGuard}`
    ).bind(id, status).run();
    if (deletion.meta?.changes !== 1) {
      return reply({ error: "Der Eintrag wird noch bearbeitet, wurde geändert, bereits gelöscht oder dient als Quelle für Wissen oder Skills." }, 409);
    }
    return reply({ success: true });
  } catch {
    return reply({ error: "Der Bericht konnte nicht gelöscht werden." }, 500);
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
