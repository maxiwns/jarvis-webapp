import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codeFiles,onRequestGet,onRequestPost} from '../../functions/api/development.js';
const files=[{path:'src/skill.js',content:'export function run(x){return x}'},{path:'test/skill.test.mjs',content:'import {run} from "../src/skill.js";'},
  {path:'README.md',content:'Identity function, not yet verified.'}];
const id='12345678-1234-1234-1234-123456789abc';
const env=()=>({JARVIS_DEV_REPO:'owner/code-lab',JARVIS_GITHUB_TOKEN:'private-fixture',JARVIS_DEV_WRITES:'yes',
  DB:{prepare:()=>({bind:()=>({first:()=>({title:'Test',result:JSON.stringify({files})})})})}});
const post=(e,body={action:'publish',jobId:id},origin='https://local')=>onRequestPost({env:e,request:new Request('https://local/api/development',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})});
test('Code-Labor erlaubt nur die drei festen Dateien',()=>{
  assert.deepEqual(codeFiles(JSON.stringify({files})),files);
  for(const path of ['../worker.js','.github/workflows/write.yml','functions/api/login.js'])
    assert.throws(()=>codeFiles(JSON.stringify({files:[{...files[0],path},...files.slice(1)]})),/nicht zulässig/);
  assert.throws(()=>codeFiles(JSON.stringify({files:[files[0],files[0],files[2]]})),/nicht zulässig/);
});
test('Fehlende Zugänge werden nicht als verbunden gemeldet und lösen keine Requests aus',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('unexpected');});
  const r=await (await onRequestGet({env:{}})).json();
  assert.equal(r.github.connected,false);assert.equal(r.cloudflare.connected,false);assert.equal(r.codeExecution,false);assert.equal(calls,0);
});
test('Origin, Schreibfreigabe und Haupt-Repositories werden vor GitHub-Schreibaktionen geprüft',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('unexpected');});
  assert.equal((await post(env(),undefined,'https://foreign')).status,403);
  assert.equal((await post({...env(),JARVIS_DEV_WRITES:''})).status,409);
  assert.equal((await post({...env(),JARVIS_DEV_REPO:'maxiwns/jarvis-webapp'})).status,502);
  assert.equal(calls,0);
});
test('GitHub-Entwurf schreibt atomaren Commit auf eigenen Branch und dupliziert keine PRs',async t=>{
  let branch=false,pr=false;const mutations=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.ok(url.startsWith('https://api.github.com/repos/owner/code-lab'));
    assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer private-fixture');
    const path=url.slice('https://api.github.com/repos/owner/code-lab'.length);
    if(opts.method==='POST'){
      const data=JSON.parse(opts.body);mutations.push({path,data});
      if(path==='/git/trees'){assert.deepEqual(data.tree.map(x=>x.path),files.map(x=>x.path));return Response.json({sha:'tree'});}
      if(path==='/git/commits')return Response.json({sha:'new'});
      if(path==='/git/refs'){assert.equal(data.ref,'refs/heads/jarvis/code-'+id);branch=true;return Response.json({});}
      if(path==='/pulls'){assert.equal(data.draft,true);assert.equal(data.base,'main');pr=true;return Response.json({number:7});}
      throw Error('unexpected mutation');
    }
    if(path==='')return Response.json({default_branch:'main'});
    if(path.startsWith('/git/ref/heads/jarvis'))return branch?Response.json({object:{sha:'new'}}):new Response(null,{status:404});
    if(path==='/git/ref/heads/main')return Response.json({object:{sha:'base'}});
    if(path==='/git/commits/base')return Response.json({tree:{sha:'oldtree'}});
    if(path.startsWith('/pulls?'))return Response.json(pr?[{number:7}]:[]);
    throw Error('unexpected path '+path);
  });
  const r=await (await post(env())).json();assert.equal(r.pullRequest,'https://github.com/owner/code-lab/pull/7');
  const again=await (await post(env())).json();assert.equal(again.pullRequest,r.pullRequest);
  assert.equal(mutations.length,4);assert.ok(!JSON.stringify(r).includes('private-fixture'));
});
test('Cloudflare-Status gibt keine Projekt-Secrets an den Browser zurück',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,result:{name:'test-project',deployment_configs:{secret:'do-not-return'}}}));
  const result=await (await onRequestGet({env:{JARVIS_CF_PAGES_TOKEN:'secret',CF_ACCOUNT_ID:'a'.repeat(32),JARVIS_CF_PROJECT:'test-project'}})).json();
  assert.equal(result.cloudflare.connected,true);assert.ok(!JSON.stringify(result).includes('do-not-return'));
});
