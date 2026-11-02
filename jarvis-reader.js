// Report workspace. Contents always come from the signed-in chat.
window.createJarvisReader = function (panel, back, api) {
  const make = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const bar = make("header", "", "jr-bar");
  const close = make("button", "← Gespräch", "chip jr-back");
  close.onclick = back;
  bar.append(make("span","Arbeitsfläche","jr-label"), close);
  const paper = make("article","","jr-paper");
  const heading = make("h2");
  const body = make("div","","jr-text");
  const links = make("div","","jr-links");
  paper.append(heading,body,links);
  const footer = make("div","","jr-footer");
  const speak = make("button","Vorlesen","chip");
  const archive = make("button","Ins Second Brain","chip");
  const settings = make("details");
  settings.append(make("summary","Lesestimme"));
  const voice = make("select"), rate = make("select");
  const preference = key => { try { return localStorage.getItem("jr-"+key); } catch { return null; } };
  const remember = (key,value) => { try { localStorage.setItem("jr-"+key,value); } catch {} };
  const row = (caption,control) => {
    const label = make("label",caption); label.append(control); settings.append(label);
  };
  row("Stimme",voice); row("Tempo",rate);
  for (const speed of ["0.85","1","1.15","1.35"]) rate.add(new Option(speed.replace(".",",")+" ×",speed));
  rate.value = preference("rate") || "1";
  const info = make("span","","jr-info");
  info.setAttribute("role","status");
  const saved = make("span","","jr-info");
  saved.setAttribute("role","status");
  footer.append(archive,speak,settings,info,saved);
  panel.append(bar,paper,footer);

  let version = 0, speechId = 0, speaking = false, report = null, currentUtterance;
  const synth = window.speechSynthesis;
  function stop() {
    speechId++;
    if (speaking) synth?.cancel();
    speaking = false;
    currentUtterance = null;
    speak.textContent = "Vorlesen";
  }
  function voices() {
    const selected = voice.value || preference("voice");
    const choices = (synth?.getVoices() || []).filter(v=>v.localService && /^de(?:[-_]|$)/i.test(v.lang));
    voice.replaceChildren(...choices.map(v=>new Option(v.name,v.voiceURI)));
    if (choices.some(v=>v.voiceURI===selected)) voice.value = selected;
    speak.disabled = !report || !choices.length || !window.SpeechSynthesisUtterance;
    voice.disabled = !choices.length;
    info.textContent = !choices.length ? "Keine lokale deutsche Stimme verfügbar." : "";
  }
  synth?.addEventListener("voiceschanged",voices);
  archive.onclick = async () => {
    if (!report) return;
    const ticket = version;
    archive.disabled = true; saved.textContent = "Bericht wird eingeordnet …";
    try {
      const receipt = await api("/api/brain-save",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jobId:report.jobId})});
      if (receipt.saved !== true) throw new Error("Speicherung nicht bestätigt.");
      window.dispatchEvent(new Event("jarvis:knowledge-saved"));
      if (ticket === version) saved.textContent = (receipt.duplicate ? "Bereits im Wissen: " : "Gespeichert: ") + receipt.title;
    } catch (error) {
      if (ticket === version) { archive.disabled = false; saved.textContent = error.message; }
    }
  };
  voice.onchange = () => { stop(); remember("voice",voice.value); };
  rate.onchange = () => { stop(); remember("rate",rate.value); };
  speak.onclick = () => {
    if (speaking) { stop(); return; }
    const chosen = synth?.getVoices().find(v=>v.localService && v.voiceURI===voice.value);
    if (!chosen || !report) return;
    const token = ++speechId;
    const chunks = report.text.match(/[\s\S]{1,180}(?:\s|$)|[\s\S]{1,180}/g) || [];
    speaking = true;
    speak.textContent = "Vorlesen stoppen";
    let index = 0;
    function next() {
      if (token !== speechId) return;
      if (index === chunks.length) { stop(); return; }
      const u = new SpeechSynthesisUtterance(chunks[index++]);
      currentUtterance = u;
      u.voice = chosen; u.lang = chosen.lang; u.rate = Number(rate.value) || 1;
      u.onend = next;
      u.onerror = () => {
        if (token !== speechId) return;
        stop(); info.textContent = "Vorlesen wurde unterbrochen.";
      };
      synth.speak(currentUtterance);
    }
    next();
  };
  function blank(title, text) {
    version++;
    stop();
    report = null;
    heading.textContent = title; body.textContent = text; links.replaceChildren();
    footer.hidden = true; paper.scrollTop = 0;
    saved.textContent = ""; archive.disabled = false;
  }
  function reset() {
    blank("Deine Berichte", "Öffne einen fertigen Bericht im Gespräch. Hier kannst du ihn lesen und seine Quellen aufrufen.");
  }
  async function open(chatId,jobId,title) {
    blank(title,"Bericht wird geladen …");
    const ticket = version;
    try {
      const data = await api("/api/agent-jobs?"+new URLSearchParams({chatId,jobId}));
      if (ticket !== version) return;
      if (!data.success || typeof data.text !== "string") throw new Error("Bericht konnte nicht geladen werden.");
      report = {...data,jobId}; heading.textContent = data.title; body.textContent = data.text;
      if (data.sources?.length) {
        links.append(make("h3","Originalquellen"));
        for (const source of data.sources) {
          const link = make("a",source.title);
          link.href = source.url; link.target="_blank"; link.rel="noopener noreferrer";
          links.append(link);
        }
      }
      footer.hidden = false; voices();
    } catch (error) {
      if (ticket === version) blank(title,error.message);
    }
  }
  window.addEventListener("pagehide",stop);
  reset();
  return {open,reset,stop};
};
