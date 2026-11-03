// The only network destination for these skills is the search provider.
// Result URLs are identifiers passed to extract, never direct Worker fetches.
export function publicLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(url.hostname) ||
        /\.(?:localhost|local|internal|lan|test|invalid|example|home|onion)$/i.test(url.hostname)) return null;
    url.hash = "";
    return url.href.length <= 1800 ? url.href : null;
  } catch { return null; }
}

export function webTopic(text) {
  return /^(?:webrecherche\s*:|(?:bitte\s+)?recherchiere\s+im\s+(?:web|internet)(?:\s+(?:zum thema|zu|über))?\s*:?)\s*([\p{L}\p{N}][\p{L}\p{N} ,()-]{1,179})[.!?]?$/iu.exec(text.trim())?.[1].trim() || null;
}

export function githubTopic(text) {
  return /^(?:github-recherche\s*:|suche\s+auf\s+github\s+nach)\s*([\p{L}\p{N}][\p{L}\p{N} -]{1,79})[.!?]?$/iu.exec(text.trim())?.[1].trim() || null;
}

export async function researchGithub(topic) {
  const headers={"User-Agent":"JARVIS/0.9","Accept":"application/vnd.github+json"};
  async function get(path,accept) {
    return fetch("https://api.github.com/"+path,{redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{...headers,Accept:accept || headers.Accept}});
  }
  const search=await get("search/repositories?"+new URLSearchParams({q:topic+" archived:false",per_page:"3"}));
  if(!search.ok) throw new Error("GitHub-Suche nicht verfügbar (HTTP "+search.status+").");
  const {items}=await search.json();
  const sources=[],texts=[];
  for(const repo of (items || []).slice(0,3)) {
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo.full_name) || repo.private !== false) continue;
    const page=await get("repos/"+repo.full_name+"/readme","application/vnd.github.raw+json");
    if(page.status===404) continue;
    if(!page.ok) throw new Error("GitHub-Dokumentation konnte nicht gelesen werden.");
    // Keep only a bounded prefix, even when a README is several MB long.
    const reader=page.body.getReader(), decoder=new TextDecoder();
    let text="";
    try {
      while(text.length<2800) {
        const chunk=await reader.read();
        if(chunk.done) break;
        text+=decoder.decode(chunk.value.subarray(0,12000),{stream:true});
      }
    } finally { await reader.cancel(); }
    if(!text.trim()) continue;
    const url="https://github.com/"+repo.full_name+"#readme";
    sources.push({title:repo.full_name,url,reader:"public-web"});
    texts.push(repo.full_name+"\n"+url+"\n"+text.slice(0,2800));
  }
  if(!sources.length) throw new Error("Keine lesbare öffentliche Projektdokumentation gefunden.");
  return {sources,sourceText:texts.join("\n\n"),sourceUrls:sources.map(s=>s.url),
    note:"\n\nGelesene GitHub-Quellen (README-Auszüge):\n"+sources.map(s=>s.url).join("\n")+"\nAbruf: "+new Date().toISOString()};
}

async function call(env, skill, body) {
  if (env.JARVIS_TAVILY_FREE !== "yes" || !env.TAVILY_API_KEY) {
    throw new Error("Die allgemeine Webrecherche ist noch nicht verbunden (Tavily Free).");
  }
  const response = await fetch("https://api.tavily.com/"+skill, {
    method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
    headers:{Authorization:"Bearer "+env.TAVILY_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Webrecherche nicht verfügbar (HTTP "+response.status+").");
  const data = await response.json();
  if (!Array.isArray(data.results)) throw new Error("Der Webdienst hat keine Ergebnisliste geliefert.");
  return data.results;
}

export async function researchWeb(env,{topic,url}) {
  const candidates = new Map();
  if (topic) {
    const hits = await call(env,"search",{query:topic,search_depth:"basic",auto_parameters:false,
      max_results:5,include_answer:false,include_raw_content:false});
    const hosts = new Set();
    for (const hit of hits) {
      const link = publicLink(hit.url);
      if (!link || hosts.has(new URL(link).hostname)) continue;
      hosts.add(new URL(link).hostname);
      candidates.set(link,String(hit.title || link).slice(0,200));
      if (candidates.size === 3) break;
    }
  } else {
    const link = publicLink(url);
    if (link) candidates.set(link,link);
  }
  if (!candidates.size) throw new Error("Keine geeignete öffentliche HTTPS-Seite gefunden.");
  const pages = await call(env,"extract",{urls:[...candidates.keys()],extract_depth:"basic",format:"text",chunks_per_source:2,
    ...(topic ? {query:topic} : {})});
  const sources=[], texts=[];
  for (const page of pages) {
    const link=publicLink(page.url);
    if (!candidates.has(link) || typeof page.raw_content !== "string" || !page.raw_content.trim()) continue;
    const title=candidates.get(link);
    candidates.delete(link);
    sources.push({title,url:link,reader:"public-web"});
    texts.push(title+"\n"+link+"\n"+page.raw_content.trim().slice(0,2800));
  }
  if (!sources.length) throw new Error("Keiner der gefundenen Seiten konnte lesbarer Inhalt entnommen werden.");
  return {sources, sourceText:texts.join("\n\n"),sourceUrls:sources.map(s=>s.url),
    note:"\n\nGelesene Webquellen (Textauszüge):\n"+sources.map(s=>s.title+" — "+s.url).join("\n")+"\nAbruf: "+new Date().toISOString()};
}
