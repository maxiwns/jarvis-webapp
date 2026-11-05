(()=>{
  const host=document.querySelector('#skills .stack');if(!host)return;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const panel=el('details','','panel'),summary=el('summary','Code-Labor · GitHub & Cloudflare'),inner=el('div','','inner');
  panel.append(summary,inner);host.append(panel);
  inner.append(el('p','Hier erstellt JARVIS JavaScript-Codevorschläge. Nach Einrichtung eines getrennten Labor-Repositories kann es einen eigenen Branch und einen Pull-Request-Entwurf anlegen. Änderungen an der laufenden JARVIS-Version und automatische Deployments sind noch nicht aktiviert.'));
  const status=el('p','Verbindungen noch nicht geprüft.','note');status.setAttribute('role','status');
  const check=el('button','Verbindungen prüfen','btn');
  const goal=el('textarea','','field');goal.maxLength=1800;goal.placeholder='Zum Beispiel: Einen Text in eindeutige Stichwörter zerlegen.';goal.setAttribute('aria-label','Entwicklungsziel');
  const create=el('button','Codevorschlag erstellen','btn primary');
  const id=el('input','','field');id.placeholder='Code-Labor-Auftrags-ID';id.setAttribute('aria-label','Code-Labor-Auftrags-ID');
  try{id.value=localStorage.getItem('jarvis-code-job')||'';}catch{}
  const inspect=el('button','Codevorschlag laden','btn'),publish=el('button','Als GitHub-Entwurf ablegen','btn');
  const output=el('pre','','muted');output.style.whiteSpace='pre-wrap';output.style.overflowWrap='anywhere';
  const result=el('p','');
  async function api(body,query=''){
    const r=await fetch('/api/development'+query,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    const data=await r.json();if(!r.ok)throw Error(data.error||'Aktion fehlgeschlagen.');return data;
  }
  async function action(work){
    [check,create,inspect,publish].forEach(b=>b.disabled=true);status.textContent='Anfrage läuft …';
    try{await work();}catch(e){status.textContent=e.message;}
    finally{[check,create,inspect,publish].forEach(b=>b.disabled=false);}
  }
  async function preview(){
    const data=await api(null,'?jobId='+encodeURIComponent(id.value.trim()));
    output.textContent=data.result||data.error||'Noch kein fertiger Codevorschlag.';
    status.textContent='Codeauftrag: '+data.status+'. Code wurde hier nicht ausgeführt.';
  }
  check.onclick=()=>action(async()=>{const data=await api();status.textContent=
    'GitHub: '+(data.github.connected?'Labor-Repository lesbar ('+data.github.repository+')':data.github.reason)+
    '\nCloudflare: '+(data.cloudflare.connected?'Projekt lesbar ('+data.cloudflare.project+')':data.cloudflare.reason);
    status.style.whiteSpace='pre-wrap';});
  create.onclick=()=>action(async()=>{const data=await api({action:'propose',task:goal.value,reportProfile:window.jarvisReportProfile?.()||'standard'});
    id.value=data.jobId;try{localStorage.setItem('jarvis-code-job',id.value);}catch{}
    await preview();});
  inspect.onclick=()=>action(preview);
  publish.onclick=()=>{
    if(!confirm('Diesen Codevorschlag in einem eigenen Branch des konfigurierten Labor-Repositories als GitHub-Entwurf ablegen?'))return;
    action(async()=>{const data=await api({action:'publish',jobId:id.value.trim()});
      const link=el('a','GitHub-Entwurf öffnen');link.href=data.pullRequest;link.target='_blank';link.rel='noopener noreferrer';result.replaceChildren(link);
      status.textContent=data.tests;});
  };
  inner.append(check,status,el('label','Was soll der Code können?'),goal,create,id,inspect,output,publish,result,
    el('p','Zugänge nur als serverseitige Secrets einrichten. Der aktuelle Laborumfang sind reine JavaScript-Funktionen; keine Pakete, Kontozugriffe, Handelsausführung oder Selbständerung des JARVIS-Backends.','note'));
})();
