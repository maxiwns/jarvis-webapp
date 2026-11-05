import {queueReport} from '../_lib/background.js';
import {runReport} from '../_lib/run-report.js';
import {readReport} from '../_lib/report-data.js';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function lab(env){
  const repo=env.JARVIS_DEV_REPO||'';
  if(!repoPattern.test(repo)||['maxiwns/jarvis-webapp','maxiwns/jarvis-backend'].includes(repo.toLowerCase()))
    throw Error('Ein separates Code-Labor-Repository ist noch nicht konfiguriert.');
  if(!env.JARVIS_GITHUB_TOKEN)throw Error('GitHub-Zugang für JARVIS fehlt.');
  return repo;
}
async function github(env,path,method='GET',body){
  const response=await fetch('https://api.github.com/repos/'+lab(env)+path,{
    method,headers:{Authorization:'Bearer '+env.JARVIS_GITHUB_TOKEN,Accept:'application/vnd.github+json',
      'User-Agent':'JARVIS-development','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok){const e=Error('GitHub-Anfrage fehlgeschlagen (HTTP '+response.status+').');e.status=response.status;throw e;}
  return response.json();
}
export function codeFiles(report){
  const text=readReport(report).text?.trim()||'';
  let data;try{data=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('Kein gültiger JSON-Codevorschlag. Auftrag bitte überarbeiten.');}
  const allowed=['src/skill.js','test/skill.test.mjs','README.md'];
  if(!data||!Array.isArray(data.files)||data.files.length!==3)throw Error('Genau drei Labor-Dateien erwartet.');
  const seen=new Set();
  for(const file of data.files){
    if(!file||!allowed.includes(file.path)||seen.has(file.path)||typeof file.content!=='string'||!file.content.trim()||file.content.length>12000)
      throw Error('Dateipfad oder Dateiinhalt ist für das Code-Labor nicht zulässig.');
    seen.add(file.path);
  }
  return data.files;
}
export async function onRequestGet({env,request}){
  const jobId=request&&new URL(request.url).searchParams.get('jobId');
  if(jobId){
    if(!env.DB)return reply({error:'Datenbank nicht verfügbar.'},503);
    try{const job=await env.DB.prepare("SELECT id,title,status,result,error FROM agent_jobs WHERE id=? AND source='development'").bind(jobId).first();
      if(!job)return reply({error:'Code-Labor-Auftrag nicht gefunden.'},404);
      return reply({...job,result:readReport(job.result).text});
    }catch{return reply({error:'Codevorschlag nicht erreichbar.'},503);}
  }
  const status={github:{connected:false},cloudflare:{connected:false},codeExecution:false};
  await Promise.all([
    (async()=>{try{const repository=await github(env,'');status.github={connected:true,repository:lab(env),defaultBranch:repository.default_branch};}
      catch(e){status.github={connected:false,reason:e.message};}})(),
    (async()=>{
      if(!env.JARVIS_CF_PAGES_TOKEN||!env.CF_ACCOUNT_ID||!env.JARVIS_CF_PROJECT){status.cloudflare.reason='Pages-Lesezugang noch nicht eingerichtet.';return;}
      if(!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID)||!/^[a-z0-9-]{1,58}$/.test(env.JARVIS_CF_PROJECT)){status.cloudflare.reason='Ungültige Projektkonfiguration.';return;}
      try{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.JARVIS_CF_PROJECT}`,{
        headers:{Authorization:'Bearer '+env.JARVIS_CF_PAGES_TOKEN},redirect:'error',signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw Error();const data=await r.json();if(data.success!==true)throw Error();
        status.cloudflare={connected:true,project:data.result.name};
      }catch{status.cloudflare.reason='Cloudflare-Projektzugriff nicht bestätigt.';}
    })()
  ]);
  return reply(status);
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Forbidden'},403);
  if(!env.DB)return reply({error:'Datenbank nicht verfügbar.'},503);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
  let body;try{const raw=await request.text();if(raw.length>3000)return reply({error:'Eingabe zu lang.'},413);body=JSON.parse(raw);}catch{return reply({error:'Ungültige Eingabe.'},400);}
  try{
    if(body?.action==='propose'){
      if(typeof body.task!=='string'||body.task.trim().length<10||body.task.length>1800)return reply({error:'Entwicklungsziel mit 10–1800 Zeichen eingeben.'},400);
      if(!env.JARVIS_BACKEND_API_KEY)return reply({error:'KI-Berichtsdienst nicht verbunden.'},503);
      const profile=body.reportProfile||'standard';if(!['standard','quality','groq'].includes(profile))return reply({error:'Unbekanntes Modell.'},400);
      const id=crypto.randomUUID();
      const instruction='Erstelle einen kleinen JavaScript-Code-Skill für ein isoliertes Code-Labor. Ziel: '+body.task+
        '\nAntworte ausschließlich als JSON {"files":[{"path":"src/skill.js","content":"..."},{"path":"test/skill.test.mjs","content":"..."},{"path":"README.md","content":"..."}]}. '+
        'src/skill.js exportiert eine reine synchrone Funktion run(input). Keine externen Pakete, Netzwerk-, Datei-, Prozesszugriffe oder Zugangsdaten. '+
        'Tests verwenden node:test und node:assert/strict und importieren ../src/skill.js. README beschreibt Eingaben, Grenzen und Beispiele. '+
        'Maximal 7000 Zeichen insgesamt. Behaupte keine ausgeführten Tests. Keine Handelsausführung. Keine weiteren Dateien.';
      await env.DB.prepare("INSERT INTO agent_jobs(id,title,instruction,status,source) VALUES(?,?,?,'open','development')")
        .bind(id,'Code-Labor: '+body.task.slice(0,100),instruction).run();
      const response=await queueReport(env,id,false,profile)||await runReport(env,id,false,profile);
      return reply({...await response.json(),jobId:id},response.status);
    }
    if(body?.action!=='publish')return reply({error:'Unbekannte Aktion.'},400);
    if(env.JARVIS_DEV_WRITES!=='yes')return reply({error:'GitHub-Schreibzugriff für das Code-Labor ist noch nicht freigegeben.'},409);
    const repo=lab(env);
    if(typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.jobId))return reply({error:'Ungültige Auftrags-ID.'},400);
    const job=await env.DB.prepare("SELECT title,result FROM agent_jobs WHERE id=? AND source='development' AND status IN ('done','completed')").bind(body.jobId).first();
    if(!job)return reply({error:'Fertigen Code-Labor-Auftrag auswählen.'},409);
    const files=codeFiles(job.result),branch='jarvis/code-'+body.jobId;
    const metadata=await github(env,'');
    const base=metadata.default_branch;
    if(typeof base!=='string'||!base||base.startsWith('jarvis/'))throw Error('Ungültiger Hauptbranch des Labors.');
    let existing;
    try{existing=await github(env,'/git/ref/heads/'+encodeURIComponent(branch));}
    catch(e){if(e.status!==404)throw e;}
    if(!existing){
      const head=await github(env,'/git/ref/heads/'+encodeURIComponent(base));
      const commit=await github(env,'/git/commits/'+head.object.sha);
      const tree=await github(env,'/git/trees','POST',{base_tree:commit.tree.sha,tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
      const next=await github(env,'/git/commits','POST',{message:job.title,tree:tree.sha,parents:[head.object.sha]});
      try{await github(env,'/git/refs','POST',{ref:'refs/heads/'+branch,sha:next.sha});}
      catch(e){if(e.status!==422)throw e;await github(env,'/git/ref/heads/'+encodeURIComponent(branch));}
    }
    const pulls=await github(env,'/pulls?state=all&head='+encodeURIComponent(repo.split('/')[0]+':'+branch));
    let pr=pulls[0];
    if(!pr){try{pr=await github(env,'/pulls','POST',{title:job.title,head:branch,base,draft:true,
      body:'JARVIS-Codevorschlag für das isolierte Labor. Enthält vom Modell vorgeschlagene Tests, noch keinen unabhängigen Qualitätsnachweis. Keine automatische Übernahme oder Veröffentlichung. Auftrags-ID: '+body.jobId});}
      catch(e){if(e.status!==422)throw e;pr=(await github(env,'/pulls?state=all&head='+encodeURIComponent(repo.split('/')[0]+':'+branch)))[0];if(!pr)throw e;}}
    return reply({success:true,branch,pullRequest:`https://github.com/${repo}/pull/${pr.number}`,tests:'Nicht von JARVIS verifiziert. GitHub-Prüfungen ansehen.'});
  }catch(e){return reply({error:e.message||'Entwicklungsaktion fehlgeschlagen.'},502);}
}
