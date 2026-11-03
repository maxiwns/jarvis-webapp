(() => {
  const box = document.getElementById("quota-values");
  const monitor = document.getElementById("monitor");
  const names = {standard:"Llama 3.1 8B",quality:"Llama 3.3 70B",groq:"GPT-OSS 120B"};
  const fmt = new Intl.NumberFormat("de-DE",{maximumFractionDigits:0});
  const num = value => Number.isFinite(value) ? fmt.format(value) : "unbekannt";
  const date = value => new Date(value).toLocaleString("de-DE");
  let generation = 0;
  function line(text,tag="p") {
    const el = document.createElement(tag);
    el.textContent=text;
    box.append(el);
  }
  async function load() {
    if (monitor.hidden) return;
    const ticket=++generation;
    const profile=window.jarvisReportProfile?.() || "standard";
    box.replaceChildren();
    line("Berichtsmodell · "+names[profile],"strong");
    const pending=document.createElement("p");
    pending.textContent="Kontingent wird abgefragt …";box.append(pending);
    try {
      const res=await fetch("/api/report-limits?profile="+encodeURIComponent(profile),{cache:"no-store"});
      const data=await res.json();
      if (ticket!==generation) return;
      pending.remove();
      if (!res.ok) throw new Error(data.error || "Verbrauch konnte nicht geladen werden.");
      if (profile==="groq") {
        const snap=data.snapshot;
        if (!snap) {line("Noch keine Messung aus einem Groq-Berichtsaufruf.");return;}
        line("Letzte Anbieterantwort: "+date(snap.measuredAt));
        line("Damals freie Anfragen im Tageslimit: "+num(snap["remaining-requests"])+" / "+num(snap["limit-requests"]));
        line("Damals freie Tokens im Minutenlimit: "+num(snap["remaining-tokens"])+" / "+num(snap["limit-tokens"]));
        line("Groq meldet hier keinen verbleibenden Tageswert für Tokens.");
      } else {
        line("Gemeinsames Cloudflare-Gratisbudget: "+num(data.limit)+" Neurons pro Tag.");
        if (data.remaining == null) line("Rest unbekannt. "+data.reason);
        else {
          line("Laut Kontoanalyse noch ca. "+num(data.remaining)+" Neurons frei.");
          line("Verbraucht: "+num(data.used)+" · Abfrage: "+date(data.measuredAt));
        }
        line("Nächster Tagesbeginn: "+date(data.resetAt));
      }
    } catch(error) {
      if(ticket===generation){pending.remove();line(error.message || "Kontingent nicht verfügbar.");}
    }
  }
  document.getElementById("quota-refresh").onclick=load;
  window.addEventListener("jarvis:limits-open",load);
  window.addEventListener("jarvis:report-model",load);
})();
