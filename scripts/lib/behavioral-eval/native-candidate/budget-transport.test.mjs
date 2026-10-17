import test,{after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBrainActions} from './brain-actions.mjs';
import {createCommitFence} from './commit-fence.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import {createCliSemanticAdapter} from './adapter.mjs';
const sourceSha='99fc3f98e01c1a6d6f2549cc36b21af6f5eede04';
const repository=fileURLToPath(new URL('../../../../',import.meta.url));
const sourceDirectory=await mkdtemp(path.join(os.tmpdir(),'task002-pinned-source-'));
const sourceRoot=path.join(sourceDirectory,'source');
const gitEnv={PATH:'/usr/bin:/bin',HOME:sourceDirectory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
try{
 execFileSync('/usr/bin/git',['clone','--quiet','--no-hardlinks','--no-checkout',repository,sourceRoot],{env:gitEnv,timeout:15000,stdio:'pipe'});
 execFileSync('/usr/bin/git',['-C',sourceRoot,'checkout','--quiet','--detach',sourceSha],{env:gitEnv,timeout:15000,stdio:'pipe'});
}catch(error){await rm(sourceDirectory,{recursive:true,force:true});throw Error('Pinned source prerequisite unavailable; CI must fetch source history',{cause:error});}
after(()=>rm(sourceDirectory,{recursive:true,force:true}));
async function fixture(fn,gate){
 const dir=await mkdtemp(path.join(os.tmpdir(),'task002-budget-')),workspace=path.join(dir,'workspace'),evidenceDir=path.join(dir,'evidence');await mkdir(workspace);await mkdir(evidenceDir);
 const suite=JSON.parse(await readFile(new URL('./adopted-v2/scenarios.json',import.meta.url)));const scenario=suite.scenarios.find(x=>x.id==='BRAIN-002');
 for(const [name,bytes]of Object.entries(suite.fixtureTemplates[scenario.fixture.template].files)){const f=path.join(workspace,name);await mkdir(path.dirname(f),{recursive:true});await writeFile(f,bytes);}
 await mkdir(path.join(workspace,'artifacts'));let authorizations=0;const adapter=await createCliSemanticAdapter({datasetVersion:'v2',sourceRoot,sourceSha,workspace,evidenceDir,scenarioId:scenario.id,installedSkills:scenario.installedSkills,authoritativeUserTurn:scenario.prompt,authorizeAction:async()=>{authorizations++;await gate?.();}});const c=await adapter.listen();const post=async(body,headers={})=>{const r=await fetch(c.url,{method:'POST',headers:{authorization:'Bearer '+c.token,'content-type':'application/json',...headers},body});return {status:r.status,value:await r.json()};};
 try{await fn({adapter,post,connection:c,evidenceDir,workspace,scenario,sourceRoot,sourceSha,get authorizations(){return authorizations;}});}finally{await adapter.close();await rm(dir,{recursive:true,force:true});}
}
const ping=i=>JSON.stringify({jsonrpc:'2.0',id:String(i),method:'ping'});
const denied=r=>r.status>=400||r.value?.error||r.value?.result?.isError;
test('16 authenticated requests fit; request 17 is denied and finish cannot mint success',()=>fixture(async({post,adapter})=>{for(let i=1;i<=16;i++)assert.equal(denied(await post(ping(i))),undefined);assert.ok(denied(await post(ping(17))));await assert.rejects(adapter.finish());}));
test('malformed UTF-8 is rejected rather than replacement-decoded into a valid request',()=>fixture(async({post})=>{const b=Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":"'),Buffer.from([0xff]),Buffer.from('","method":"ping"}')]);assert.ok(denied(await post(b)));}));
test('compressed encoding header is denied even when bytes contain valid JSON',()=>fixture(async({post})=>{assert.ok(denied(await post(ping(1),{'content-encoding':'gzip'})));}));
test('duplicate critical keys cannot select the final method silently',()=>fixture(async({post})=>{assert.ok(denied(await post('{"jsonrpc":"2.0","id":1,"method":"not-allowed","method":"ping"}')));}));
test('argument admission rejects >16384 bytes before upstream authorization',()=>fixture(async f=>{await f.post(JSON.stringify({jsonrpc:'2.0',id:'large',method:'tools/call',params:{name:'material_question',arguments:{message:'x'.repeat(16385)}}}));assert.equal(f.authorizations,0);}));
test('schema-rejected action attempts still consume all eight slots; ninth cannot dispatch',()=>fixture(async f=>{for(let i=0;i<9;i++)await f.post(JSON.stringify({jsonrpc:'2.0',id:'bad-'+i,method:'tools/call',params:{name:'material_question',arguments:{}}}));assert.equal(f.authorizations,8);await assert.rejects(f.adapter.finish());}));

for(const n of [65536,65537])test('actual wire body '+n+' bytes enforces the request ceiling',()=>fixture(async f=>{const b=Buffer.from(ping('wire'));const bytes=Buffer.concat([b,Buffer.alloc(n-b.length,32)]);const r=await f.post(bytes);if(n===65536)assert.equal(denied(r),undefined);else assert.ok(denied(r));assert.equal(f.authorizations,0);}));
for(const delta of [0,1])test('actual valid HTTP requests reach aggregate 262144+'+delta,()=>fixture(async f=>{const last=Buffer.from(ping('last'));for(let i=0;i<4;i++){const v=Buffer.from(ping(i));const size=i===3?65536-last.length+delta:65536;assert.equal(denied(await f.post(Buffer.concat([v,Buffer.alloc(size-v.length,32)]))),undefined);}const r=await f.post(last);if(delta===0)assert.equal(denied(r),undefined);else assert.ok(denied(r));assert.equal(f.authorizations,0);}));

test('replayed authenticated tool attempts consume action accounting before replay validation',()=>fixture(async f=>{const request=JSON.stringify({jsonrpc:'2.0',id:'same',method:'tools/call',params:{name:'material_question',arguments:{}}});for(let i=0;i<8;i++)await f.post(request);assert.equal(f.adapter.budgetSnapshot().used.actions,8);assert.ok(denied(await f.post(request)));assert.equal(f.adapter.budgetSnapshot().observed.actions,9);}));

function rawHttp(connection,body,declared){return new Promise((resolve,reject)=>{const u=new URL(connection.url),s=net.connect({host:u.hostname,port:u.port});let output='';const timer=setTimeout(()=>{s.destroy();reject(Error('Bounded HTTP fixture timeout'));},3000);s.on('data',c=>output+=c);s.on('error',()=>{});s.on('close',()=>{clearTimeout(timer);resolve(output);});s.on('connect',()=>s.end('POST /mcp HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer '+connection.token+'\r\nContent-Type: application/json\r\nContent-Length: '+declared+'\r\nConnection: close\r\n\r\n'+body));});}
test('declared larger body than actual fails closed without upstream dispatch',()=>fixture(async f=>{const b=JSON.stringify({jsonrpc:'2.0',id:'short',method:'tools/call',params:{name:'material_question',arguments:{}}});const response=await rawHttp(f.connection,b,Buffer.byteLength(b)+1);assert.ok(!response.includes('200 OK'));assert.equal(f.authorizations,0);}));
test('chunked delivery counts octets across chunk boundaries before dispatch',()=>fixture(async f=>{const u=new URL(f.connection.url),body=ping('chunked');const response=await new Promise((resolve,reject)=>{const r=http.request(u,{method:'POST',headers:{authorization:'Bearer '+f.connection.token,'content-type':'application/json','transfer-encoding':'chunked'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(text)}));});r.on('error',reject);for(const c of Buffer.from(body))r.write(Buffer.from([c]));r.end();});assert.equal(denied(response),undefined);assert.equal(f.adapter.budgetSnapshot().used.ingressBytes,Buffer.byteLength(body));}));
test('unauthenticated requests cannot consume the invocation budget',()=>fixture(async f=>{const r=await fetch(f.connection.url,{method:'POST',headers:{authorization:'Bearer PUBLIC_WRONG_TOKEN','content-type':'application/json'},body:ping(1)});assert.equal(r.status,401);assert.equal(f.adapter.budgetSnapshot().used.requests,0);assert.equal(denied(await f.post(ping(2))),undefined);}));

test('authenticated wrong-path bodies still consume measured ingress octets',()=>fixture(async f=>{const body=ping('bad-path');const r=await fetch(f.connection.url+'-unsupported',{method:'POST',headers:{authorization:'Bearer '+f.connection.token,'content-type':'application/json'},body});assert.equal(r.status,400);assert.equal(f.adapter.budgetSnapshot().used.requests,1);assert.equal(f.adapter.budgetSnapshot().used.ingressBytes,Buffer.byteLength(body));}));

test('real concurrent HTTP actions revoke before a held upstream authorization can commit',async()=>{let release;const gate=new Promise(r=>release=r);await fixture(async f=>{const listed=await f.post(JSON.stringify({jsonrpc:'2.0',id:'list',method:'tools/list'}));const props=listed.value.result.tools[0].inputSchema.properties.sourceDraft.properties;const sourceDraft=Object.fromEntries(Object.entries(props).map(([k,v])=>[k,v.const]));const args={topic:'missing-seat-count',sourceDraft,message:'PUBLIC_CONCURRENT_ADMISSION'};const request=id=>JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'material_question',arguments:args}});const first=f.post(request('first'));try{const until=Date.now()+2000;while(f.authorizations===0&&Date.now()<until)await new Promise(r=>setTimeout(r,5));assert.equal(f.authorizations,1);assert.ok(denied(await f.post(request('second'))));}finally{release();}assert.ok(denied(await first));assert.equal(f.authorizations,1);assert.equal((await readdir(f.evidenceDir)).filter(n=>n.startsWith('receipt-')).length,0);await assert.rejects(f.adapter.finish());},()=>gate);});

test('missing raw argument representation poisons the invocation instead of inventing null bytes',()=>fixture(async f=>{assert.ok(denied(await f.post(JSON.stringify({jsonrpc:'2.0',id:'missing-args',method:'tools/call',params:{name:'material_question'}}))));assert.equal(f.authorizations,0);assert.equal(f.adapter.budgetSnapshot().used.rawArgumentBytes,0);assert.equal(f.adapter.budgetSnapshot().violation,true);await assert.rejects(f.adapter.finish());}));

test('legacy BRAIN-002 cannot write a trusted action receipt after effective revocation',()=>fixture(async f=>{const fence=createCommitFence();const brain=await createBrainActions({sourceRoot:f.sourceRoot,sourceSha:f.sourceSha,workspace:f.workspace,evidenceDir:f.evidenceDir,scenarioId:'BRAIN-002',installedSkills:f.scenario.installedSkills,draftSha256:JSON.parse(await readFile(path.join(f.evidenceDir,'mcp-contract.json'))).tools[0].inputSchema.properties.sourceDraft.properties.sha256.const,commitFence:fence});fence.revoke('PUBLIC_BEFORE_LEGACY_DISPATCH');let rejected=false;try{await brain.materialQuestion({topic:'missing-seat-count',draftSha256:JSON.parse(await readFile(path.join(f.evidenceDir,'mcp-contract.json'))).tools[0].inputSchema.properties.sourceDraft.properties.sha256.const,message:'PUBLIC_VALID_QUESTION_AFTER_REVOKE'});}catch{rejected=true;}assert.equal((await readdir(f.evidenceDir)).filter(n=>n.startsWith('brain-action-')).length,0,'No legacy receipt may be published after revocation');assert.equal(rejected,true);}));
