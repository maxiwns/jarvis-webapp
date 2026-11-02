// Run from the project workspace with Node 24: node --test webapp/.github/tests/report-round.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as chat } from "../../functions/api/conversation-turn.js";
import { onRequestPost as start } from "../../functions/api/agent-run.js";
import { onRequestGet as list } from "../../functions/api/agent-jobs.js";
import worker from "../../../backend/worker.js";

function fixture(t, { action = "create_order", tools = ["reports"], report } = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE chats(id PRIMARY KEY, updated_at);
    CREATE TABLE messages(id PRIMARY KEY, chat_id, role, content);
    CREATE TABLE tasks(id PRIMARY KEY, title, area, priority, due, done, source);
    CREATE TABLE agent_jobs(id PRIMARY KEY, title, instruction, status TEXT CHECK
      (status IN ('open','in_progress','done','error')), result, error TEXT NOT NULL DEFAULT '',
      source, created_at DEFAULT CURRENT_TIMESTAMP, updated_at DEFAULT CURRENT_TIMESTAMP, completed_at);`);
  const chatId = crypto.randomUUID();
  db.prepare("INSERT INTO chats(id) VALUES (?)").run(chatId);
  function statement(sql, args = []) {
    const q = db.prepare(sql);
    return {bind: (...v) => statement(sql,v), first: () => q.get(...args),
      all: () => ({results:q.all(...args)}), run: () => ({meta:q.run(...args)})};
  }
  const env = { JARVIS_BACKEND_API_KEY:"local", DB:{prepare:statement, batch(writes) {
    db.exec("BEGIN");
    try { for (const w of writes) w.run(); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  }}};
  const paths = [];
  t.mock.method(globalThis,"fetch",async (url,opts) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return worker.fetch(new Request(url,opts),{JARVIS_API_KEY:"local", AI:{async run() {
      if (path === "/api/intent") return {response:JSON.stringify({action,title:"Checklisten"})};
      if (path === "/api/tool-plan") return {response:JSON.stringify({tools})};
      return {response: report ? await report() : "Checklisten machen Abläufe wiederholbar."};
    }}});
  });
  const post = (handler,path,body) => handler({env, request:new Request("https://local"+path,{
    method:"POST",headers:{Origin:"https://local","Content-Type":"application/json"},body:JSON.stringify(body)})});
  const turnId = crypto.randomUUID();
  return {db, paths, turn:(message="Erstelle einen Bericht über Checklisten.") => post(chat,"/api/conversation-turn",{
    chatId,turnId,message}).then(r=>r.json()),
    start:(retry=false)=>post(start,"/api/agent-run",{jobId:turnId,retry}),
    list:async()=> (await (await list({env})).json()).jobs, turnId};
}

test("Allgemeiner Vergleichsbericht verwendet den festen Berichtsplan", async t => {
  const f = fixture(t,{tools:["jobs","reports"]});
  const result = await f.turn("Erstelle einen kurzen Bericht über die Vor- und Nachteile von Checklisten.");
  assert.match(result.reply,/fertig/);
  assert.deepEqual(f.paths,["/api/intent","/api/tool-execute"]);
  assert.equal((await f.list())[0].status,"done");
});

test("Zusatzauftrag mit Recherche bleibt in der regulären Planung", async t => {
  const f = fixture(t,{tools:["web_search","reports"]});
  const result = await f.turn("Erstelle einen kurzen Bericht über die Vor- und Nachteile von Checklisten. Recherchiere aktuelle Zahlen.");
  assert.match(result.reply,/offen.*Websuche/);
  assert.deepEqual(f.paths,["/api/intent","/api/tool-plan"]);
});

test("Chat → Worker-Plan → Tool → gespeicherter Bericht und bestätigte Chatantwort",async t=>{
  const f=fixture(t);
  const answer=await f.turn();
  assert.equal(answer.saved,true);
  assert.match(answer.reply,/fertig/);
  const [job]=await f.list();
  assert.equal(job.status,"done");
  assert.ok(job.completed_at);
  assert.equal(job.result,"Checklisten machen Abläufe wiederholbar.");
  assert.equal(f.db.prepare("SELECT content FROM messages WHERE role='assistant'").get().content,answer.reply);
  assert.equal((await f.turn()).reply,answer.reply);
  assert.deepEqual(f.paths,["/api/intent","/api/tool-plan","/api/tool-execute"]);
});

for (const tools of [["web_search","reports"],["email","reports"],[],["unknown_tool"]]) {
  test("Kein Autostart mit Plan "+JSON.stringify(tools),async t=>{
    const f=fixture(t,{tools});
    assert.match((await f.turn()).reply,/offen/);
    assert.equal((await f.list())[0].status,"open");
    assert.equal(f.paths.includes("/api/tool-execute"),false);
  });
}

for (const action of ["sensitive_action","create_task","chat"]) {
  test("Bestehendes Routing: "+action,async t=>{
    const f=fixture(t,{action});
    assert.equal((await f.turn()).action,action);
    assert.equal((await f.list()).length,0);
    assert.equal(f.paths.includes("/api/tool-plan"),false);
  });
}

test("Leerer Bericht bleibt fehlgeschlagen und kann gezielt wiederholt werden",async t=>{
  let attempts=0;
  const f=fixture(t,{report:()=>++attempts===1?"":"Gespeichert"});
  assert.doesNotMatch((await f.turn()).reply,/fertig/);
  assert.equal((await f.list())[0].status,"error");
  assert.equal((await f.start(true)).status,200);
  assert.equal((await f.list())[0].result,"Gespeichert");
});

test("Paralleler Start blockiert; alter Lauf kann nach Wiederaufnahme nichts überschreiben",async t=>{
  let release,started;
  const active=new Promise(resolve=>{started=resolve});
  let calls=0;
  const f=fixture(t,{report:async()=>{
    if (++calls===1) { started(); return new Promise(resolve=>{release=resolve}); }
    return "Neues Ergebnis";
  }});
  const turn=f.turn();
  await active;
  assert.equal((await f.start(true)).status,409);
  f.db.exec("UPDATE agent_jobs SET updated_at=datetime('now','-4 minutes')");
  assert.equal((await f.list())[0].expired,1);
  assert.equal((await f.start(true)).status,200);
  release("Verspätetes Ergebnis");
  await turn;
  assert.equal((await f.list())[0].result,"Neues Ergebnis");
});
