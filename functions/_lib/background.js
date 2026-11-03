import {expiredReportSql, jobStates, runReport} from "./run-report.js";

// The scheduled worker installs these tables in the same D1 as Pages.
// Nothing is queued until a real scheduled invocation has sent a heartbeat.
export async function runnerOnline(db) {
  try {
    return Boolean(await db.prepare(
      "SELECT 1 FROM report_runner_health WHERE id=1 AND seen_at>=datetime('now','-4 minutes')"
    ).first());
  } catch { return false; }
}

export async function tick(env) {
  if (!env.DB || !env.JARVIS_BACKEND_API_KEY) throw new Error("Runner bindings missing");
  const db=env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS report_runner_health(id INTEGER PRIMARY KEY,seen_at TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS report_queue(job_id TEXT PRIMARY KEY, profile TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  ]);
  await db.prepare("INSERT OR REPLACE INTO report_runner_health VALUES(1,CURRENT_TIMESTAMP)").run();
  const rows=await db.prepare(`SELECT q.job_id,q.profile FROM report_queue q
    LEFT JOIN agent_jobs j ON j.id=q.job_id
    WHERE (q.lease_until IS NULL OR q.lease_until<=CURRENT_TIMESTAMP)
      AND (j.id IS NULL OR j.status NOT IN ('running','in_progress','processing') OR (${expiredReportSql}))
    ORDER BY q.created_at,q.job_id LIMIT 3`).all();
  for (const row of rows.results) await advance(env,row);
}

async function advance(env,{job_id:id,profile}) {
  const db=env.DB, lease=crypto.randomUUID();
  const claim=await db.prepare(`UPDATE report_queue SET lease=?, lease_until=datetime('now','+4 minutes'),
    attempts=attempts+1 WHERE job_id=? AND (lease_until IS NULL OR lease_until<=CURRENT_TIMESTAMP)`)
    .bind(lease,id).run();
  if (claim.meta?.changes!==1) return;
  const load=()=>db.prepare("SELECT status,error FROM agent_jobs WHERE id=?").bind(id).first();
  let job=await load();
  const queue=await db.prepare("SELECT attempts FROM report_queue WHERE job_id=? AND lease=?").bind(id,lease).first();
  if (!queue) return;
  let exhausted=false;
  function transientFailure(value) {
    return value && ["failed","error"].includes(value.status) &&
      /^(?:Die Zeit für den Werkzeugaufruf ist abgelaufen\.|Berichtswerkzeug meldet HTTP (?:429|502|503|504)$)/.test(value.error);
  }
  if (job && (!["completed","done","failed","error"].includes(job.status) || transientFailure(job))) {
    if (queue.attempts<=3) {
      await runReport(env,id,job.status!=="open",profile);
      job=await load();
      if (transientFailure(job) && queue.attempts<3) {
        await db.prepare("UPDATE report_queue SET lease_until=datetime('now','+2 minutes') WHERE job_id=? AND lease=?")
          .bind(id,lease).run();
        return;
      }
      if (job && !["completed","done","failed","error"].includes(job.status)) return;
    } else {
      if (!transientFailure(job) && !await stopInterrupted(env,id,lease)) return;
      exhausted=true;
    }
  }
  const done = job && ["completed","done"].includes(job.status);
  const answer=done ? "Dein Bericht ist fertig und in der Auftragszentrale gespeichert." :
    exhausted ? "Die Hintergrundbearbeitung wurde mehrfach unterbrochen. Du kannst den Auftrag erneut starten." :
    "Dein Bericht konnte nicht fertiggestellt werden. Den Fehler findest du beim Auftrag.";
  const writes=[];
  if (job) writes.push(db.prepare(`UPDATE messages SET content=? WHERE id=? AND role='assistant'
    AND EXISTS(SELECT 1 FROM report_queue WHERE job_id=? AND lease=?)`).bind(answer,id,id,lease));
  writes.push(db.prepare("DELETE FROM report_queue WHERE job_id=? AND lease=?").bind(id,lease));
  await db.batch(writes);
}

async function stopInterrupted(env,id,lease) {
  const states=await jobStates(env.DB);
  if (!states.failed) throw new Error("Unsupported failure state");
  const result=await env.DB.prepare(`UPDATE agent_jobs SET status=?,error=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND (status='open' OR (${expiredReportSql}))
    AND EXISTS(SELECT 1 FROM report_queue WHERE job_id=? AND lease=?)`)
    .bind(states.failed,"Hintergrundlauf mehrfach unterbrochen.",id,id,lease).run();
  return result.meta?.changes===1;
}
