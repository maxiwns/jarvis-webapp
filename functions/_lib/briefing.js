import { expiredReportSql } from "./run-report.js";

export function briefingDays(message) {
  const text = message.trim().replace(/^(?:hey\s+)?jarvis[,!:\s]+/i,"").replace(/[.!?]+$/,"").trim();
  if (/^(?:was steht heute an|was steht heute bei mir an|(?:zeig mir |gib mir )?(?:mein |das )?(?:tagesbriefing|morgenbriefing|tagesplan))$/i.test(text)) return 1;
  if (/^(?:plane|plan|zeige?)(?: mir)? (?:die |meine )?nächsten (?:drei|3) tage$/i.test(text)) return 3;
  return 0;
}

export async function briefing(db, days, now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin"}).format(now);
  const groups = [];
  function tasks(label,filter,params=[]) {
    const stmt=db.prepare(`SELECT title,due,priority FROM tasks WHERE done=0 AND ${filter}
      ORDER BY due, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, title,id LIMIT 6`);
    groups.push({label,stmt:params.length ? stmt.bind(...params) : stmt});
  }
  tasks("Überfällig","due <> '' AND due < ?",[today]);
  for (let i=0; i<days; i++) {
    const date = new Date(Date.parse(today+"T12:00:00Z")+i*86400000);
    tasks(i===0?"Heute fällig":date.toLocaleDateString("de-DE",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long"}),
      "due = ?",[date.toISOString().slice(0,10)]);
  }
  tasks("Wichtig ohne Termin","priority='high' AND coalesce(due,'')=''");
  groups.push({label:"Aufträge mit Handlungsbedarf",stmt:db.prepare(
    `SELECT title,status FROM agent_jobs WHERE status IN ('failed','error') OR (${expiredReportSql})
     ORDER BY updated_at DESC,id LIMIT 6`)});
  groups.push({label:"Berichte der letzten 24 Stunden",stmt:db.prepare(
    `SELECT title,status FROM agent_jobs WHERE status IN ('completed','done')
     AND datetime(completed_at) BETWEEN datetime(?) AND datetime(?) ORDER BY completed_at DESC,id LIMIT 6`
  ).bind(new Date(now.getTime()-86400000).toISOString(),now.toISOString())});
  const results = await db.batch(groups.map(g=>g.stmt));
  const sections = groups.map(({label},index)=>{
    const rows=results[index].results;
    return {label,items:rows.slice(0,5).map(row=>row.title + (row.due && row.due < today ? " · "+row.due : "")),
      more:rows.length>5};
  });
  const visible = sections.filter(group=>group.items.length);
  const first = [sections[0],sections[1],sections[days+1]].find(g=>g.items.length);
  const text = (days===3?"Dein Dreitagesplan":"Dein Tagesbriefing") + " · " + now.toLocaleDateString("de-DE",{timeZone:"Europe/Berlin"}) +
    (first ? "\n\nAls Erstes vorgeschlagen: "+first.items[0] : "") +
    "\n\n" + (visible.length ? visible.map(g=>g.label+"\n"+g.items.map(t=>"• "+t).join("\n")+
        (g.more?"\n• Weitere Einträge vorhanden.":"")).join("\n\n") :
      "Keine fälligen oder undatierten wichtigen Aufgaben, offenen Fehler oder neuen Berichte für diesen Überblick.") +
    "\n\nGrundlage: Cloud-Aufgaben und Berichte. Kalendereinträge sind nicht verbunden.";
  return {today,days,text};
}
