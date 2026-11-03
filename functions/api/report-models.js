export async function onRequestGet() {
  try {
    const response = await fetch("https://jarvis-backend.maxiwiens.workers.dev/api/status", {
      signal:AbortSignal.timeout(5000), cache:"no-store"
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.status !== "online") throw new Error();
    const supported = data.reportProfiles ?? (data.aiConnected ? ["standard"] : []);
    return Response.json({profiles:["standard","quality","groq"].filter(p=>supported.includes(p))},
      {headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:"Worker-Status nicht erreichbar."},{status:503});
  }
}
