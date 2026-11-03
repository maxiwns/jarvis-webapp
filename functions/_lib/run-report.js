import { wikipediaTopic, searchWikipedia } from "./wikipedia.js";
import { storeReport } from "./report-data.js";
import { researchWeb, webTopic, githubTopic, researchGithub } from "./web-skills.js";

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";
const REPORT_TIMEOUT_SECONDS = 90;

// Only this explicit single-page request starts a read. The backend reader
// enforces its HTTPS host allowlist and rejects credentials and redirects.
export function reportPage(instruction) {
  const match = /^(?:bitte\s+)?(?:erstelle?|schreibe?|verfasse?)\s+(?:mir\s+)?(?:bitte\s+)?einen\s+(?:kurzen\s+)?bericht\s+(?:aus|zu|über|anhand)\s+(?:(?:dieser?|folgender?|der)\s+)?(?:webseite|seite|quelle)\s*:\s*(https:\/\/[^\s<>]+)$/iu.exec(instruction.trim());
  if (!match) return null;
  try { return new URL(match[1]).href; } catch { return null; }
}

async function executeTool(env, tool, args) {
  const response = await fetch(BACKEND_URL + "/api/tool-execute", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.JARVIS_BACKEND_API_KEY },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout((tool === "web_read" ? 20 : REPORT_TIMEOUT_SECONDS) * 1000)
  });
  if (!response.ok) {
    throw new Error(tool === "web_read"
      ? "Die Seite konnte nicht gelesen werden. Prüfe Adresse und freigegebene Domain."
      : "Berichtswerkzeug meldet HTTP " + response.status);
  }
  const data = await response.json();
  if (data.success !== true || data.executed !== true || data.tool !== tool || !data.result) {
    throw new Error("Werkzeugausführung nicht bestätigt: " + tool);
  }
  return data.result;
}
// Allow time for the tool timeout and both D1 writes before offering recovery.
export const expiredReportSql =
  "status IN ('running','processing','in_progress') AND datetime(updated_at) < datetime('now','-3 minutes')";

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

export async function runReport(env, jobId, retry = false, profile = "standard") {
  if (!["standard","quality","groq"].includes(profile)) return reply({error:"Unbekanntes Berichtsmodell."},400);
  // Auftrag laden.
  let job;

  try {
    job = await env.DB.prepare(
      `SELECT id, title, instruction, status, updated_at, (${expiredReportSql}) AS expired
       FROM agent_jobs
       WHERE id = ?`
    ).bind(jobId).first();
  } catch {
    return reply({ error: "Database unavailable" }, 503);
  }

  if (!job) {
    return reply({ error: "Job not found" }, 404);
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
  const startedAt = new Date().toISOString();
  try {
    states = await jobStates(env.DB);
    if (!states.running || !states.completed || !states.failed) {
      return reply({ error: "Der Auftragsablauf passt nicht zu den Statuswerten in D1: " + states.allowed }, 500);
    }
    const expectedStatus = retry && job.expired ? states.running : retry ? states.failed : "open";
    if (job.status !== expectedStatus) {
      return reply({ error: "Der Auftragsstatus hat sich geändert.", status: job.status }, 409);
    }
    const claim = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = ?, error = '',
           updated_at = ?
       WHERE id = ? AND status = ? AND updated_at IS ?`
    ).bind(states.running, startedAt, jobId, expectedStatus, job.updated_at).run();

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
    const pageUrl = reportPage(job.instruction);
    const topic = wikipediaTopic(job.instruction);
    const search = webTopic(job.instruction);
    const github = githubTopic(job.instruction);
    const otherPage = env.JARVIS_TAVILY_FREE === "yes" && env.TAVILY_API_KEY && pageUrl &&
      !["developers.cloudflare.com","www.cloudflare.com","docs.github.com"].includes(new URL(pageUrl).hostname);
    const args = { instruction: job.instruction, reportProfile:profile };
    let sourceNote = "";
    let sources = [];
    if (topic || github || search || otherPage) {
      const material = topic ? await searchWikipedia(topic) : github ? await researchGithub(github) :
        await researchWeb(env,{topic:search,url:pageUrl});
      args.sourceText = material.sourceText;
      args.sourceUrls = material.sourceUrls;
      sourceNote = material.note;
      sources = material.sources;
    } else if (pageUrl) {
      const page = await executeTool(env, "web_read", { url: pageUrl });
      if (page.success !== true || page.url !== pageUrl ||
          typeof page.content !== "string" || !page.content.trim() ||
          !Number.isFinite(Date.parse(page.fetchedAt)) || typeof page.truncated !== "boolean") {
        throw new Error("Kein bestätigter Seiteninhalt verfügbar.");
      }
      args.sourceText = page.content.slice(0, 12000);
      args.sourceUrls = [page.url];
      sources = [{title: page.title || page.url, url:page.url}];
      const partial = page.truncated || page.content.length > args.sourceText.length;
      sourceNote = "\n\nGelesene Quelle: " + page.url + "\nAbruf: " + page.fetchedAt +
        (partial ? "\nFür den Bericht wurde ein Seitenausschnitt verwendet." : "");
    } else if (/wikipedia[- ]bericht/iu.test(job.instruction)) {
      throw new Error("Für die Wikipedia-Suche bitte einen Bericht mit einem einzelnen Suchthema anfordern.");
    } else if (/https?:\/\//i.test(job.instruction)) {
      throw new Error("Für einen Quellenbericht bitte genau eine Seite angeben: Erstelle einen Bericht aus dieser Webseite: https://…");
    }
    const result = await executeTool(env, "reports", args);
    if (profile === "groq" && result.quota?.measuredAt) {
      try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS report_quota (profile TEXT PRIMARY KEY, measured_at TEXT NOT NULL, snapshot TEXT NOT NULL)").run();
        await env.DB.prepare(`INSERT INTO report_quota VALUES ('groq',?,?)
          ON CONFLICT(profile) DO UPDATE SET measured_at=excluded.measured_at,snapshot=excluded.snapshot
          WHERE excluded.measured_at >= report_quota.measured_at`)
          .bind(result.quota.measuredAt,JSON.stringify(result.quota)).run();
      } catch { console.error("Groq quota snapshot unavailable"); }
    }
    if (profile !== "standard" && !result.model) throw new Error("Dieser Worker unterstützt die Modellauswahl noch nicht.");
    if (args.sourceUrls && (result.sourceBased !== true || !Array.isArray(result.sourceUrls) ||
        result.sourceUrls.length !== args.sourceUrls.length ||
        !args.sourceUrls.every((url, index) => result.sourceUrls[index] === url))) {
      throw new Error("Verarbeitung der gelesenen Quelle nicht bestätigt.");
    }
    if (typeof result.report !== "string" || !result.report.trim() || result.report.length > 30000) {
      throw new Error("Kein gültiger Bericht zurückgegeben.");
    }
    const report = result.report + sourceNote;

    // Fertiges Ergebnis dauerhaft sichern.
    const completed = await env.DB.prepare(
      `UPDATE agent_jobs
       SET status = ?,
           result = ?,
           error = '',
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ? AND updated_at = ?`
    ).bind(states.completed, storeReport(report, sources, result.model), jobId, states.running, startedAt).run();

    if (completed.meta?.changes !== 1) {
      throw new Error("Job completion could not be saved");
    }

    return reply({
      success: true,
      jobId,
      status: states.completed,
      tool: "reports",
      result: report,
      sourceBased: Boolean(args.sourceUrls),
      sourceUrls: args.sourceUrls || []
    });

  } catch (error) {
    const message =
      error?.name === "TimeoutError"
        ? "Die Zeit für den Werkzeugaufruf ist abgelaufen. Du kannst den Bericht erneut starten."
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
         WHERE id = ? AND status = ? AND updated_at = ?`
      ).bind(states.failed, message.slice(0, 500), jobId, states.running, startedAt).run();
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
    }, error?.name === "TimeoutError" ? 504 : 502);
  }
}
