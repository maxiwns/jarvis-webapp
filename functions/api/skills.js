import {queueReport} from '../_lib/background.js';
import {runReport} from '../_lib/run-report.js';
import {readReport} from '../_lib/report-data.js';
import {hasQueue} from '../_lib/queue-status.js';

const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function schema(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS jarvis_skills(id TEXT PRIMARY KEY,title TEXT NOT NULL,goal TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,active_version INTEGER,paused INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jarvis_skill_versions(skill_id TEXT NOT NULL,version INTEGER NOT NULL,
      job_id TEXT NOT NULL UNIQUE,feedback TEXT NOT NULL,guide TEXT,approved_at TEXT,PRIMARY KEY(skill_id,version))`)
  ]);
}
export async function onRequestGet({env}){
  if(!env.DB)return reply({error:'Datenbank nicht verfügbar.'},503);
  try{
    await schema(env.DB);
    const rows=await env.DB.prepare(`SELECT s.*,v.job_id,v.feedback,v.guide,v.approved_at,
      j.status AS learning_status,j.error AS learning_error,j.result AS learning_result
      FROM jarvis_skills s LEFT JOIN jarvis_skill_versions v ON v.skill_id=s.id AND v.version=s.version
      LEFT JOIN agent_jobs j ON j.id=v.job_id ORDER BY s.created_at DESC,s.id LIMIT 100`).all();
    return reply({skills:rows.results.map(({learning_result,...s})=>({...s,material:readReport(learning_result)}))});
  }catch{return reply({error:'Skills konnten nicht geladen werden.'},503);}
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Forbidden'},403);
  if(!env.DB)return reply({error:'Datenbank nicht verfügbar.'},503);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return reply({error:'JSON required'},415);
  let body;
  try{const raw=await request.text();if(raw.length>5000)return reply({error:'Eingabe zu lang.'},413);body=JSON.parse(raw);}
  catch{return reply({error:'Ungültige Eingabe.'},400);}
  if(!body || typeof body!=='object' || Array.isArray(body))return reply({error:'Ungültige Eingabe.'},400);
  const valid=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.length<=max;
  try{
    await schema(env.DB);
    if(body.action==='create'){
      if(!valid(body.title,3,120)||!valid(body.goal,10,2000))return reply({error:'Titel (3–120 Zeichen) und Lernziel (10–2000 Zeichen) erforderlich.'},400);
      const id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO jarvis_skills(id,title,goal) VALUES(?,?,?)').bind(id,body.title.trim(),body.goal.trim()).run();
      return reply({success:true,id},201);
    }
    if(!valid(body.id,36,36))return reply({error:'Ungültige Skill-ID.'},400);
    const skill=await env.DB.prepare('SELECT * FROM jarvis_skills WHERE id=?').bind(body.id).first();
    if(!skill)return reply({error:'Skill nicht gefunden.'},404);
    if(body.action==='pause'){
      await env.DB.prepare('UPDATE jarvis_skills SET paused=1 WHERE id=?').bind(skill.id).run();
      return reply({success:true});
    }
    if(body.action==='approve'){
      if(body.version!==skill.version)return reply({error:'Die Version wurde inzwischen geändert. Bitte neu laden.'},409);
      const v=await env.DB.prepare(`SELECT v.*,j.result,j.status FROM jarvis_skill_versions v JOIN agent_jobs j ON j.id=v.job_id
        WHERE v.skill_id=? AND v.version=?`).bind(skill.id,skill.version).first();
      if(!v || !['done','completed'].includes(v.status) || !readReport(v.result).text?.trim())
        return reply({error:'Zuerst die fertige Arbeitsanleitung prüfen.'},409);
      const guide=readReport(v.result).text;
      await env.DB.batch([
        env.DB.prepare('UPDATE jarvis_skill_versions SET guide=?,approved_at=CURRENT_TIMESTAMP WHERE skill_id=? AND version=?').bind(guide,skill.id,skill.version),
        env.DB.prepare('UPDATE jarvis_skills SET active_version=?,paused=0 WHERE id=? AND version=?').bind(skill.version,skill.id,skill.version)
      ]);
      return reply({success:true});
    }
    if(!['learn','run'].includes(body.action))return reply({error:'Unbekannte Aktion.'},400);
    if(!env.JARVIS_BACKEND_API_KEY)return reply({error:'Berichtsdienst nicht verbunden.'},503);
    const profile=body.reportProfile||'standard';
    if(!['standard','quality','groq'].includes(profile))return reply({error:'Unbekanntes Modell.'},400);
    let instruction;
    const jobId=crypto.randomUUID();
    if(body.action==='learn'){
      const feedback=body.feedback||'';
      if(typeof feedback!=='string'||feedback.length>1200)return reply({error:'Feedback zu lang.'},400);
      if(body.version!==skill.version)return reply({error:'Version geändert. Bitte neu laden.'},409);
      const prior=await env.DB.prepare(`SELECT j.id,j.status,j.result FROM jarvis_skill_versions v JOIN agent_jobs j ON j.id=v.job_id WHERE v.skill_id=? AND v.version=?`)
        .bind(skill.id,skill.version).first();
      if(prior && await hasQueue(env.DB) && await env.DB.prepare('SELECT 1 FROM report_queue WHERE job_id=?').bind(prior.id).first())
        return reply({error:'Der vorherige Lernauftrag wird noch automatisch bearbeitet.'},409);
      if(prior&&!['done','completed','error','failed'].includes(prior.status))return reply({error:'Ein Lernauftrag ist bereits offen. Bitte in der Auftragszentrale prüfen.'},409);
      instruction=`Erstelle eine wiederverwendbare Arbeitsanleitung für einen JARVIS-Wissens-Skill. Lernziel: ${skill.goal}\nVerbesserungswunsch: ${feedback || 'Erste Version.'}\n`+
        'Gliedere in Voraussetzungen, Vorgehen, benötigte Eingaben, Prüfkriterien, drei Übungsaufgaben und Grenzen. Maximal 4500 Zeichen. '+
        'Keine erfundene Webrecherche, Testergebnisse oder vorhandenen Integrationen. Kennzeichne Wissenslücken. '+
        'Dies ist eine textuelle Anleitung, kein installierter Programmcode. Bei Finanzthemen nur Grundlagen, Risiken und Simulation; keine konkreten Kauf-/Verkaufsaufträge, Gewinnversprechen oder Echtgeld-Ausführung.'+
        (prior?.result ? '\nBisherige Anleitung (Auszug, maximal 2000 Zeichen): '+String(readReport(prior.result).text||'').slice(0,2000):'');
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO jarvis_skill_versions(skill_id,version,job_id,feedback) VALUES(?,?,?,?)`).bind(skill.id,skill.version+1,jobId,feedback),
        env.DB.prepare('UPDATE jarvis_skills SET version=version+1 WHERE id=? AND version=?').bind(skill.id,skill.version),
        env.DB.prepare(`INSERT INTO agent_jobs(id,title,instruction,status,source) VALUES(?,?,?,'open','skill-learning')`).bind(jobId,`Skill lernen: ${skill.title}`,instruction)
      ]);
    }else{
      if(skill.paused||!skill.active_version)return reply({error:'Skill zuerst prüfen und aktivieren.'},409);
      if(!valid(body.input,5,1500))return reply({error:'Eine Übungsaufgabe mit 5–1500 Zeichen eingeben.'},400);
      const v=await env.DB.prepare('SELECT guide FROM jarvis_skill_versions WHERE skill_id=? AND version=? AND approved_at IS NOT NULL')
        .bind(skill.id,skill.active_version).first();
      if(!v?.guide)return reply({error:'Freigegebene Anleitung fehlt.'},409);
      instruction='Bearbeite diese Übungsaufgabe als Textbericht mit der gespeicherten Arbeitsanleitung. '+
        'Führe keine externen Aktionen aus. Behaupte keine aktuellen Marktdaten, Handelsausführung oder Webrecherche. '+
        'Bei Finanzthemen nur hypothetische Beispiele und Grundlagen, keine konkreten Handelsentscheidungen.\n'+
        `Anleitung${v.guide.length>5000?' (auf 5000 Zeichen gekürzt)':''}: ${v.guide.slice(0,5000)}\nAufgabe: ${body.input}`;
      await env.DB.prepare(`INSERT INTO agent_jobs(id,title,instruction,status,source) VALUES(?,?,?,'open','skill-practice')`)
        .bind(jobId,`Skill anwenden v${skill.active_version}: ${skill.title}`,instruction).run();
    }
    const queued=await queueReport(env,jobId,false,profile);
    const response=queued||await runReport(env,jobId,false,profile);
    const result=await response.json();
    return reply({...result,jobId},response.status);
  }catch{return reply({error:'Aktion nicht bestätigt. Bitte Skills und Aufträge neu laden, bevor du erneut startest.'},503);}
}
