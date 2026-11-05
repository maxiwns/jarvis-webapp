(()=>{
  const page=document.getElementById('skills');if(!page)return;
  const list=page.querySelector('#skills-list'),status=page.querySelector('#skills-status');
  const element=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  async function api(body){
    const response=await fetch('/api/skills',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Aktion fehlgeschlagen.');return data;
  }
  async function act(body){
    page.querySelectorAll('button').forEach(b=>b.disabled=true);
    status.textContent='Wird gespeichert. Bei einem Lernauftrag bitte auf die Bestätigung warten …';
    try{
      const result=await api({...body,reportProfile:window.jarvisReportProfile?.()||'standard'});
      await load();status.textContent=result.queued?'Auftrag zur Hintergrundbearbeitung gespeichert.':result.jobId?'Ergebnis in der Auftragszentrale gespeichert.':'Gespeichert.';
      return true;
    }catch(e){status.textContent=e.message;return false;}
    finally{page.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function load(){
    try{
      const data=await api();list.replaceChildren();
      if(!data.skills.length)list.append(element('p','Noch keine eigenen Skills. Lege dein erstes Lernziel an.','muted'));
      for(const skill of data.skills){
        const card=element('article','','order-box');
        card.append(element('h3',skill.title),element('p',skill.goal),element('p',
          `Version ${skill.version} · ${skill.paused?'Pausiert':skill.active_version?'Aktiv: Version '+skill.active_version:'Noch nicht aktiviert'} · Nur Textberichte`,'pill'));
        if(skill.learning_status)card.append(element('p','Lernauftrag: '+skill.learning_status,'note'));
        if(skill.learning_error)card.append(element('p',skill.learning_error,'bad'));
        if(skill.material?.text){const details=element('details','');details.append(element('summary','Arbeitsanleitung prüfen'));
          const text=element('p',skill.material.text);text.style.whiteSpace='pre-wrap';details.append(text);card.append(details);}
        const feedback=element('textarea','');feedback.className='field';feedback.maxLength=1200;feedback.placeholder='Was soll die nächste Version besser können?';feedback.setAttribute('aria-label','Verbesserungswunsch für '+skill.title);
        const learn=element('button',skill.version?'Neue Version lernen':'Lernanleitung erstellen','btn');
        learn.onclick=()=>act({action:'learn',id:skill.id,version:skill.version,feedback:feedback.value});card.append(feedback,learn);
        if(['done','completed'].includes(skill.learning_status)){
          const approve=element('button','Geprüfte Version aktivieren','btn');
          approve.onclick=()=>{if(confirm('Diese Arbeitsanleitung als Text-Skill aktivieren? Das bestätigt deine Prüfung, keine automatische Qualitätsprüfung.'))act({action:'approve',id:skill.id,version:skill.version});};card.append(approve);
        }
        if(skill.active_version&&!skill.paused){
          const input=element('textarea','');input.className='field';input.maxLength=1500;input.placeholder='Eine konkrete Übungsaufgabe';input.setAttribute('aria-label','Übungsaufgabe für '+skill.title);
          const run=element('button','Skill auf Übungsaufgabe anwenden','btn primary');run.onclick=()=>act({action:'run',id:skill.id,input:input.value});
          const pause=element('button','Skill pausieren','btn quiet');pause.onclick=()=>act({action:'pause',id:skill.id});card.append(input,run,pause);
        }
        list.append(card);
      }
    }catch(e){status.textContent=e.message;}
  }
  page.querySelector('#skill-create').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;
    if(await act({action:'create',title:form.elements.title.value,goal:form.elements.goal.value}))form.reset();};
  page.querySelector('#skills-refresh').onclick=()=>load();
  page.querySelector('#skill-trading').onclick=()=>{
    const form=page.querySelector('#skill-create');form.elements.title.value='Daytrading verstehen und simulieren';
    form.elements.goal.value='Grundlagen des Daytradings erklären: Ordertypen, Spread, Gebühren, Slippage, Verlustbegrenzung und typische Denkfehler. Einen Lernplan und ein Journal für hypothetische Übungen erstellen. Keine Echtgeld-Trades, keine Gewinnversprechen und keine erfundenen aktuellen Kurse.';
    form.elements.goal.focus();
  };
  new MutationObserver(()=>{if(!page.hidden)load();}).observe(page,{attributes:true,attributeFilter:['hidden']});
})();
