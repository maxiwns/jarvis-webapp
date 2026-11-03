(() => {
  const anchor = document.getElementById("model-panel");
  if (!anchor) return;
  const panel = document.createElement("details");
  panel.className = "panel";
  panel.innerHTML = '<summary><strong>Berichtsmodell</strong></summary><div class="inner"><label>Modell für neue Berichte <select class="field"></select></label><p class="note" role="status"></p></div>';
  anchor.after(panel);
  const select = panel.querySelector("select");
  select.id = "report-profile-select";
  const note = panel.querySelector("p");
  const names = {standard:"Llama 3.1 8B · Cloudflare",quality:"Llama 3.3 70B · Cloudflare",groq:"GPT-OSS 120B · Groq"};
  let selected = "standard";
  window.jarvisReportProfile = () => selected;
  const key = "jarvis_report_profile";
  for (const [id,label] of Object.entries(names)) select.add(new Option(label,id));
  select.disabled = true;
  const describe = () => {
    window.dispatchEvent(new Event("jarvis:report-model"));
    note.textContent = selected === "groq" ? "Auftrag und Quellenmaterial werden für neue Berichte an Groq gesendet. Bei einem Anfragelimit übernimmt Cloudflare." :
      "Ausgegraute Modelle sind auf dem verbundenen Worker noch nicht freigeschaltet.";
  };
  async function refresh() {
    try {
      const response = await fetch("/api/report-models",{cache:"no-store"});
      if (!response.ok) throw new Error();
      const {profiles} = await response.json();
      for (const opt of select.options) opt.disabled = !profiles.includes(opt.value);
      let preferred = selected;
      try { preferred = localStorage.getItem(key) || selected; } catch {}
      selected = profiles.includes(preferred) ? preferred : "standard";
      select.value = selected;
      select.disabled = !profiles.length;
      describe();
    } catch { select.disabled=true; selected="standard"; select.value=selected; note.textContent="Modellstatus nicht erreichbar. Standard bleibt eingestellt."; }
  }
  select.onchange = () => {
    selected = select.value;
    try { localStorage.setItem(key,selected); } catch {}
    describe();
  };
  panel.ontoggle = () => { if (panel.open) refresh(); };
  refresh();
})();
