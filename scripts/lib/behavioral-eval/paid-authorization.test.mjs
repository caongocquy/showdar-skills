import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as producer from './live-producer.mjs';
import {digest} from './github-provenance.mjs';
import {createLiveResponsesTransport} from './responses-transport.mjs';
import {getPaidCaptureAuthorization,consumePaidResponse,verifyPaidCaptureEvidence} from './paid-authorization.mjs';
const revision='a'.repeat(40),source='b'.repeat(40);
const scenario=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url))).scenarios.find(s=>s.id==='BRAIN-001');
const request=()=>({model:'gpt-6-luna',max_output_tokens:2048,input:[{role:'developer',content:JSON.stringify({sourceSha:source,scenarioId:'BRAIN-001'})},{role:'user',content:scenario.prompt}]});
const environment={id:42,name:'showdar-paid-capture',can_admins_bypass:false,
 protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{login:'caongocquy',id:50620260,type:'User'}}]}],
 deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
const policies={total_count:1,branch_policies:[{name:'main',type:'branch'}]};
const image={kind:'github-attested-image',imageId:'sha256:'+'c'.repeat(64),archiveSha256:'d'.repeat(64),manifestSha256:'e'.repeat(64),runnerRevision:revision,runId:'99',runAttempt:1};
const readiness={runnerRevision:revision,sourceSha:source,scenarioId:'BRAIN-001',scenarioSha256:digest(JSON.stringify(scenario)),plannedModelIdentity:'gpt-6-luna',modelIdentity:'gpt-6-luna',runId:'98',runAttempt:1,pullRequest:23,image,
 evidenceSha256:'1'.repeat(64),traceSha256:'2'.repeat(64),artifactSha256:'3'.repeat(64)};
const options={runnerRevision:revision,sourceSha:source,scenarioId:'BRAIN-001',model:'gpt-6-luna',runId:'123',runAttempt:1,pullRequest:23,readiness,image};
const run={id:123,run_attempt:1,head_sha:revision,head_branch:'main',event:'workflow_dispatch',status:'in_progress',path:'.github/workflows/behavioral-live-capture.yml',repository:{full_name:'caongocquy/showdar-skills'},head_repository:{full_name:'caongocquy/showdar-skills'}};
function binding(){return producer.createPaidCaptureBinding(options,environment);}
function approval(b=binding()){return {state:'approved',user:{login:'caongocquy',id:50620260,type:'User'},environments:[{id:42,name:environment.name}],comment:'SHOWDAR-CAPTURE-AUTH/2\n'+digest(JSON.stringify(b))};}
test('owner environment approval is feasible for the PR author and binds exact capture context',()=>{
 const b=binding();producer.assertPaidCaptureApproval({environment,policies,run,approvals:[approval(b)]},b);
 assert.equal(b.environment.id,42);assert.equal(b.budget.maxOutputTokens,2048);assert.equal(b.budget.maxTurns,8);assert.equal(b.budget.timeoutMs,120000);
 for(const delta of [{sourceSha:revision},{runnerRevision:source},{modelIdentity:'wrong'},{runId:'124'},{runAttempt:2},{image:{}},{readiness:{}},{budget:{timeoutMs:1}}]){
  assert.throws(()=>producer.assertPaidCaptureApproval({environment,policies,run,approvals:[approval()]},{...b,...delta}));
 }
});
test('missing, forged, rejected and ambiguous approvals never authorize execution',()=>{
 for(const approvals of [[],null,[{...approval(),state:'rejected'}],[{...approval(),user:{login:'caongocquy',id:1,type:'User'}}],
  [{...approval(),user:{login:'caongocquy',id:50620260,type:'Bot'}}],[{...approval(),comment:'SHOWDAR-CAPTURE-AUTH/2\n'+'0'.repeat(64)}],
  [{...approval(),environments:[{id:43,name:environment.name}]}],[approval(),approval()]])assert.throws(()=>producer.assertPaidCaptureApproval({environment,policies,run,approvals},binding()));
});
test('missing or weakened environment policy, fork, stale runner and rerun fail closed',()=>{
 for(const e of [null,{...environment,can_admins_bypass:true},{...environment,can_admins_bypass:undefined},{...environment,protection_rules:[]},
  {...environment,protection_rules:[{...environment.protection_rules[0],prevent_self_review:true}]},
  {...environment,protection_rules:[{...environment.protection_rules[0],reviewers:[{type:'Team',reviewer:{login:'caongocquy',id:50620260}}]}]},
  {...environment,deployment_branch_policy:null}])assert.throws(()=>producer.assertPaidCaptureApproval({environment:e,policies,run,approvals:[approval()]},binding()));
 for(const p of [null,{total_count:0,branch_policies:[]},{total_count:1,branch_policies:[{name:'*',type:'branch'}]},
  {total_count:1,branch_policies:[{name:'main',type:'tag'}]},{total_count:2,branch_policies:[{name:'main',type:'branch'}]}])assert.throws(()=>producer.assertPaidCaptureApproval({environment,policies:p,run,approvals:[approval()]},binding()));
 for(const delta of [{run_attempt:2},{head_sha:source},{head_branch:'feature'},{event:'pull_request'},{status:'completed'},{head_repository:{full_name:'evil/fork'}}])
  assert.throws(()=>producer.assertPaidCaptureApproval({environment,policies,run:{...run,...delta},approvals:[approval()]},binding()));
 assert.throws(()=>producer.createPaidCaptureBinding({...options,runAttempt:2},environment));
 for(const key of ['sourceSha','runnerRevision','plannedModelIdentity','scenarioId','image','evidenceSha256'])assert.throws(()=>producer.createPaidCaptureBinding({...options,readiness:{...readiness,[key]:'forged'}},environment));
});
test('native authorization authenticates GitHub records and atomically rejects same-run process replay',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'paid-authorization-'));
 const context={GITHUB_REPOSITORY:'caongocquy/showdar-skills',GITHUB_REF:'refs/heads/main',GITHUB_SHA:revision,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:directory};
 const previous=Object.fromEntries(Object.keys(context).map(k=>[k,process.env[k]]));Object.assign(process.env,context);
 const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(init.headers.Authorization,'Bearer fixture-token');calls.push(url);
  const data=url.endsWith('/approvals')?[approval()]:url.endsWith('/deployment-branch-policies')?policies:url.endsWith('/showdar-paid-capture')?environment:run;
  return new Response(JSON.stringify(data));
 });
 try{
  const verdict=await producer.verifyPaidCaptureAuthorization({...options,token:'fixture-token'},{context});
  assert.equal(verdict.binding.modelIdentity,'gpt-6-luna');assert.ok(calls.some(u=>u.endsWith('/approvals')));assert.ok(calls.every(u=>!u.includes('/reviews')));
  const results=await Promise.allSettled([producer.reservePaidCaptureAuthorization({...options,token:'fixture-token'}),producer.reservePaidCaptureAuthorization({...options,token:'fixture-token'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const cap=results.find(r=>r.status==='fulfilled').value;assert.equal(getPaidCaptureAuthorization(cap).binding.runId,'123');
  for(const forged of [{},structuredClone(cap),{approved:true}])assert.throws(()=>consumePaidResponse(forged,request()),/denied/);
  assert.throws(()=>consumePaidResponse(cap,{...request(),model:'wrong'}),/denied/);
  assert.throws(()=>consumePaidResponse(cap,{...request(),input:[{role:'developer',content:JSON.stringify({sourceSha:revision,scenarioId:'BRAIN-001'})},{role:'user',content:scenario.prompt}]}),/denied/);
  assert.throws(()=>consumePaidResponse(cap,{...request(),input:[request().input[0],{role:'user',content:'different scenario'}]}),/denied/);
  assert.throws(()=>consumePaidResponse(cap,{...request(),max_output_tokens:4096}),/denied/);
  const now=Date.now;const clock=t.mock.method(Date,'now',()=>now()+120001);assert.throws(()=>consumePaidResponse(cap,request()),/denied/);clock.mock.restore();
  const remaining=consumePaidResponse(cap,request());assert.ok(remaining>0 && remaining<=120000);
  for(let i=0;i<7;i++)consumePaidResponse(cap,request());
  assert.throws(()=>consumePaidResponse(cap,request()),/denied/);
  const receiptCopy=getPaidCaptureAuthorization(cap);receiptCopy.binding.modelIdentity='forged';assert.equal(getPaidCaptureAuthorization(cap).binding.modelIdentity,'gpt-6-luna');
  const receipt=JSON.parse(await readFile(path.join(directory,'paid-capture-123-1.json')));assert.equal(receipt.binding.runAttempt,1);
  await assert.rejects(producer.verifyPaidCaptureAuthorization({...options,token:'fixture-token'},{context:{...context,GITHUB_RUN_ATTEMPT:'2'}}));
 }finally{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await rm(directory,{recursive:true,force:true});}
});
test('caller approval flags, missing metadata and credential getters cannot bypass the disabled live gate',async()=>{
 let accessed=false;const args={...options,model:options.model,allowModel:true,verified:true,authorization:{approved:true},get apiKey(){accessed=true;throw new Error('credential read');}};
 await assert.rejects(producer.produceLiveCapture(args),/Live Responses disabled/);assert.equal(accessed,false);
});

test('authorization metadata outage or missing environment cannot mint a reservation',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:404}));
 const directory=await mkdtemp(path.join(tmpdir(),'paid-denied-'));
 const context={GITHUB_REPOSITORY:'caongocquy/showdar-skills',GITHUB_REF:'refs/heads/main',GITHUB_SHA:revision,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:directory};
 try{await assert.rejects(producer.verifyPaidCaptureAuthorization({...options,token:'fixture-token'},{context}),/lookup unavailable/);}finally{await rm(directory,{recursive:true,force:true});}
});

test('deployment proposal stays disabled and releases the credential only after native authorization verification',async()=>{
 const workflow=await readFile(new URL('../../../.github/workflows/behavioral-live-capture.yml',import.meta.url),'utf8');
 const paid=workflow.slice(workflow.indexOf('  paid-capture:'),workflow.indexOf('  attest-paid-capture:'));
 assert.match(paid,/if: \$\{\{ false &&/);assert.match(paid,/environment:\n\s+name: showdar-paid-capture/);
 const verify=paid.indexOf('node scripts/behavioral-eval-producer.mjs --verify-paid');
 const credential=paid.indexOf('OPENAI_API_KEY:');assert.ok(verify>=0 && credential>verify);
 assert.match(paid,/ref: \$\{\{ github.sha \}\}/);assert.match(paid,/persist-credentials: false/);
 assert.doesNotMatch(paid,/id-token: write/);
 assert.match(workflow,/paid_capture:[\s\S]+default: false[\s\S]+type: boolean/);assert.match(paid,/false && inputs.paid_capture &&/);
 assert.match(workflow,/prepare-paid-capture:[\s\S]+if: \$\{\{ false &&/);
});
test('completed capture provenance verifies owner authorization independently before rubric review',()=>{
 const b=binding();producer.assertPaidCaptureApproval({environment,policies,run:{...run,status:'completed',conclusion:'success'},approvals:[approval()]},b,{completed:true});
 assert.throws(()=>producer.assertPaidCaptureApproval({environment,policies,run:{...run,status:'completed',conclusion:'failure'},approvals:[approval()]},b,{completed:true}));
});

test('signed live evidence rechecks authenticated environment approval; it never substitutes for rubric review',async t=>{
 const b=binding(),proof={kind:'github-environment-owner-approval',binding:b,bindingSha256:digest(JSON.stringify(b)),owner:{login:'caongocquy',id:50620260,type:'User'}};
 const observed=[];let reviews=[approval()];
 t.mock.method(globalThis,'fetch',async(url)=>{observed.push(url);return new Response(JSON.stringify(url.endsWith('/approvals')?reviews:url.endsWith('/deployment-branch-policies')?policies:environment));});
 await verifyPaidCaptureEvidence(proof,{...run,status:'completed',conclusion:'success'},'fixture-token');
 assert.ok(observed.some(url=>url.endsWith('/approvals')));assert.ok(observed.every(url=>!url.includes('/reviews')));
 reviews=[{...approval(),user:{login:'forged',id:50620260,type:'User'}}];await assert.rejects(verifyPaidCaptureEvidence(proof,{...run,status:'completed',conclusion:'success'},'fixture-token'),/approval/);
});

test('direct live transport never reads a credential getter before its safety and authorization gates',async()=>{
 let read=false;const send=createLiveResponsesTransport({allowModel:true,get apiKey(){read=true;throw new Error('credential accessed');}});
 assert.equal(read,false);await assert.rejects(send(request()),/Live Responses disabled/);assert.equal(read,false);
});
