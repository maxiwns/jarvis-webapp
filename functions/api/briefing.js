import { briefing } from "../_lib/briefing.js";
export async function onRequestGet({env,request}) {
  const days = Number(new URL(request.url).searchParams.get("days") || 1);
  const respond=(data,status)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
  if (![1,3].includes(days)) return respond({error:"Ungültiger Zeitraum."},400);
  try { return respond(await briefing(env.DB,days),200); }
  catch { return respond({error:"Cloud-Briefing konnte nicht geladen werden."},503); }
}
