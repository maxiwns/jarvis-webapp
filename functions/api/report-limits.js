const freeNeurons = 10000;
const reply = (data,status=200) => Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});

export async function onRequestGet({env,request}) {
  const profile = new URL(request.url).searchParams.get("profile") || "standard";
  if (!["standard","quality","groq"].includes(profile)) return reply({error:"Unbekanntes Profil."},400);
  if (profile === "groq") {
    try {
      const exists = await env.DB.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='report_quota'").first();
      const row = exists && await env.DB.prepare("SELECT snapshot FROM report_quota WHERE profile='groq'").first();
      return reply({provider:"Groq",snapshot:row ? JSON.parse(row.snapshot) : null});
    } catch { return reply({error:"Letzter Groq-Messwert nicht verfügbar."},503); }
  }
  const now = new Date();
  const start = now.toISOString().slice(0,10)+"T00:00:00Z";
  const base = {provider:"Cloudflare",limit:freeNeurons,resetAt:new Date(Date.parse(start)+86400000).toISOString()};
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return reply({...base,remaining:null,reason:"Kontoverbrauch noch nicht verbunden."});
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method:"POST", redirect:"error",signal:AbortSignal.timeout(7000),
      headers:{Authorization:"Bearer "+env.CF_ANALYTICS_TOKEN,"Content-Type":"application/json"},
      body:JSON.stringify({query:`query($account:String!,$start:Time!,$end:Time!){
        viewer{accounts(filter:{accountTag:$account}){
          aiInferenceAdaptiveGroups(limit:1,filter:{datetime_geq:$start,datetime_leq:$end}){sum{totalNeurons}}
        }} }`,variables:{account:env.CF_ACCOUNT_ID,start,end:now.toISOString()}})
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const groups = data.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups;
    if (data.errors?.length || !Array.isArray(groups)) throw new Error();
    const used = groups[0]?.sum?.totalNeurons;
    if (!Number.isFinite(used) || used < 0) throw new Error();
    return reply({...base,used,remaining:Math.max(0,Math.floor(freeNeurons-used)),measuredAt:now.toISOString()});
  } catch {return reply({...base,remaining:null,reason:"Analytics liefert derzeit keinen bestätigten Verbrauch."});}
}
