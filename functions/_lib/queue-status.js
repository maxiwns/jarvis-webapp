// Read only the requested jobs. Older installations have no queue tables yet.
export async function hasQueue(db) {
  return Boolean(await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='report_queue'").first());
}

export async function queueStatuses(db, jobs) {
  const ids=[...new Set(jobs.map(j=>j.id).filter(Boolean))];
  const statuses=new Map();
  if (!ids.length || !await hasQueue(db)) return statuses;
  const health=await db.prepare("SELECT 1 FROM report_runner_health WHERE id=1 AND seen_at>=datetime('now','-4 minutes')").first();
  const rows=[];
  // Keep each query below D1's bound-parameter limit, including long chats.
  for (let offset=0;offset<ids.length;offset+=80) {
    const chunk=ids.slice(offset,offset+80);
    const result=await db.prepare(`SELECT job_id,attempts,lease_until,
      lease_until>CURRENT_TIMESTAMP AS waiting FROM report_queue
      WHERE job_id IN (${chunk.map(()=>"?").join(",")})`).bind(...chunk).all();
    rows.push(...result.results);
  }
  const byId=new Map(jobs.map(j=>[j.id,j]));
  for (const row of rows) {
    const job=byId.get(row.job_id);
    const running=["running","processing","in_progress"].includes(job.status) && !job.expired;
    const complete=["done","completed"].includes(job.status);
    const retry=["error","failed"].includes(job.status) && row.waiting;
    const state=complete ? "finishing" : running ? "running" : !health ? "paused" : retry ? "retry_wait" : "queued";
    const labels={finishing:"Bericht gespeichert · Abschluss wird bestätigt",running:"Wird im Hintergrund bearbeitet",
      paused:"Gespeichert · Hintergrunddienst derzeit nicht erreichbar",retry_wait:"Vorübergehender Fehler · automatische Wiederholung wartet",
      queued:"Zur Hintergrundbearbeitung gespeichert"};
    statuses.set(row.job_id,{state,label:labels[state],attempts:row.attempts,
      nextAttemptAt:state==="retry_wait" ? row.lease_until : null,runnerOnline:Boolean(health)});
  }
  return statuses;
}
