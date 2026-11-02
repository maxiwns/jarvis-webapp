// Only the explicitly named topic is sent to the public search endpoint.
export function wikipediaTopic(instruction) {
  const match = /^(?:bitte\s+)?(?:erstelle?|schreibe?|verfasse?)\s+(?:mir\s+)?(?:bitte\s+)?einen\s+(?:kurzen\s+)?wikipedia[- ]bericht\s+(?:über|zu|zum thema)\s+([\p{L}\p{N}][\p{L}\p{N} -]{1,119})[.!]?$/iu.exec(instruction.trim());
  return match?.[1].trim() || null;
}

export async function searchWikipedia(topic) {
  const url = new URL("https://de.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search",
    gsrsearch: topic, gsrlimit: "3", gsrnamespace: "0", prop: "extracts|info",
    exintro: "1", explaintext: "1", exchars: "2000", exlimit: "3"
  });
  const response = await fetch(url, {
    redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", "User-Agent": "JARVIS/0.9 (https://github.com/maxiwns/jarvis-webapp)" }
  });
  if (!response.ok) throw new Error("Wikipedia-Suche nicht verfügbar (HTTP " + response.status + ").");
  const data = await response.json();
  if (data.error) throw new Error("Wikipedia konnte die Suchanfrage nicht bearbeiten.");
  const sources = (data.query?.pages || []).slice(0, 3)
    .filter(p => p.ns === 0 && Number.isSafeInteger(p.lastrevid) && p.lastrevid > 0 &&
      typeof p.title === "string" && typeof p.extract === "string" && p.extract.trim())
    .sort((a,b) => a.index - b.index)
    .map(p => ({
      title: p.title.slice(0, 250), text: p.extract.trim().slice(0, 2000),
      url: "https://de.wikipedia.org/w/index.php?oldid=" + p.lastrevid
    }));
  if (!sources.length) throw new Error("Wikipedia hat keine lesbaren Artikeleinleitungen zu diesem Thema geliefert.");
  return {
    sourceUrls: sources.map(s => s.url),
    sourceText: sources.map(s => s.title + "\n" + s.url + "\n" + s.text).join("\n\n"),
    note: "\n\nGelesene Quellen (Artikeleinleitungen der deutschsprachigen Wikipedia):\n" +
      sources.map(s => s.title + " — " + s.url).join("\n") + "\nAbruf: " + new Date().toISOString()
  };
}
