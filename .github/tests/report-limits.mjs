import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../../functions/api/report-limits.js";
const get=async(profile,env)=> (await onRequestGet({request:new Request("https://local/?profile="+profile),env})).json();
test("No account access does not claim unused allowance",async()=>{
  assert.equal((await get("quality",{})).remaining,null);
});
test("Both Cloudflare profiles use the same UTC account sum",async t=>{
  t.mock.method(globalThis,"fetch",async(url,req)=>{
    assert.equal(url,"https://api.cloudflare.com/client/v4/graphql");
    const query=JSON.parse(req.body);
    assert.match(query.variables.start,/T00:00:00Z$/);
    assert.ok(!query.query.includes("modelId"));
    return Response.json({data:{viewer:{accounts:[{aiInferenceAdaptiveGroups:[{sum:{totalNeurons:349.8}}]}]}}});
  });
  const env={CF_ACCOUNT_ID:"test",CF_ANALYTICS_TOKEN:"fixture"};
  for(const profile of ["quality","standard"]) assert.equal((await get(profile,env)).remaining,9650);
});
test("Analytics failure never becomes zero consumption",async t=>{
  t.mock.method(globalThis,"fetch",async()=>Response.json({errors:[{}]}));
  assert.equal((await get("standard",{CF_ACCOUNT_ID:"test",CF_ANALYTICS_TOKEN:"test"})).remaining,null);
});
test("Groq response is a dated snapshot, not a live inference",async()=>{
  const snapshot={measuredAt:"2026-11-03T11:00:00Z","remaining-tokens":0};
  const DB={prepare:q=>({first:async()=>q.includes("sqlite_schema")?{}:{snapshot:JSON.stringify(snapshot)}})};
  assert.deepEqual((await get("groq",{DB})).snapshot,snapshot);
});
