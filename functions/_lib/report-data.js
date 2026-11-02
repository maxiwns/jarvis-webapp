// Older D1 rows contain plain text. New rows keep reader metadata separate
// from the model output so that model-generated links are never promoted.
const marker = "JARVIS-REPORT/1\n";

export function storeReport(text, sources) {
  return marker + JSON.stringify({text, sources});
}

export function readReport(value) {
  if (typeof value === "string" && value.startsWith(marker)) {
    try {
      const record = JSON.parse(value.slice(marker.length));
      if (typeof record.text === "string" && Array.isArray(record.sources)) {
        const sources = record.sources.filter(item => {
          try {
            const url = new URL(item.url);
            return typeof item.title === "string" && url.protocol === "https:" &&
              !url.username && !url.password && !url.port &&
              ["de.wikipedia.org","developers.cloudflare.com","www.cloudflare.com","docs.github.com"].includes(url.hostname);
          } catch { return false; }
        });
        return {text:record.text, sources};
      }
    } catch { /* Display an unrecognized record as stored. */ }
  }
  return {text:value, sources:[]};
}
