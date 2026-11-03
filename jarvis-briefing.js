(() => {
  const panel = document.getElementById("brief-panel");
  const output = document.getElementById("brief-live");
  const periods = [[1,"brief-one"],[3,"brief-three"]];
  let selected = 1, version = 0;
  async function load(days=selected) {
    selected=days;
    const ticket=++version;
    for (const [value,id] of periods) document.getElementById(id).setAttribute("aria-pressed",String(value===days));
    output.textContent="Cloud-Briefing wird geladen …";
    try {
      const response=await fetch("/api/briefing?days="+days,{cache:"no-store"});
      const data=await response.json();
      if (!response.ok || typeof data.text!=="string") throw new Error(data.error || "Briefing nicht verfügbar.");
      if (ticket===version) output.textContent=data.text;
    } catch (error) {
      if (ticket===version) output.textContent="Briefing nicht verfügbar. Tippe zum erneuten Laden auf den Zeitraum.";
    }
  }
  for (const [value,id] of periods) document.getElementById(id).onclick=()=>load(value);
  panel.addEventListener("toggle",()=>{if(panel.open) load();});
  window.addEventListener("jarvis:tasks-updated",()=>{if(panel.open) load();});
  if(panel.open) load();
})();
