import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOfflineResponses, runResponsesScenario, detectSandbox } from './responses-runner.mjs';
import { auditCapabilities } from './scenario-capabilities.mjs';
import { createOfflineResponsesTransport } from './responses-transport.mjs';
const suite = JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json', import.meta.url), 'utf8'));
const scenario = suite.scenarios[0];
const sourceSha = 'a'.repeat(40);
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'showdar-responses-test-'));
  const workspace = join(root, 'fixture'); const evidenceDir = join(root, 'evidence');
  await mkdir(workspace); await mkdir(evidenceDir);
  try { return await fn({ workspace, evidenceDir }); } finally { await rm(root, { recursive:true, force:true }); }
}
const call = (name, args, id='call-1') => ({ type:'function_call', call_id:id, name, arguments:JSON.stringify(args) });
test('model-free HTTP-to-broker-to-authenticated-capture E2E cannot grade a simulated execution',async()=>fixture(async dirs=>{
  let turn=0;
  const output=[[call('artifact_write',{path:scenario.oracle.rubric[0].artifact,content:'fixture decision'})],[]];
  const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',
    fakeResponses:createOfflineResponsesTransport({fakeFetch:async()=>new Response(JSON.stringify({
      id:`resp_${turn}`,status:'completed',model:'fixture-model',output:output[turn++]}),{headers:{'x-request-id':`req_${turn}`}})}),
    fakeRuntime:async request=>({content:request.content,observedBy:'host-tool-runtime',grade:'PASS'}),
  });
  const trace=JSON.parse(await readFile(result.capturedTrace.tracePath));
  assert.equal(result.status,'NOT_RUN');
  assert.equal(trace.behavioralStatus,'BLOCKED');
  assert.equal(trace.execution.agentLaunched,false);
  assert.equal(trace.responses.length,2);
  assert.ok(trace.events.every(event=>event.evidence==='simulated-runtime'));
  assert.equal(result.grading.rubricStatus,'BLOCKED');
}));
test('audits all 18 frozen cases without claiming semantic events are observed', () => {
  const audit = auditCapabilities(suite);
  assert.equal(audit.length,18);
  for (const entry of audit) {
    assert.ok(entry.requiredEvents.length);
    assert.equal(entry.artifactGrading,'independent-review-unsupported');
    assert.ok(entry.unsupported.length);
  }
});
test('Responses offline loop mediates calls, stores evidence outside fixture, and ignores model grades', async () => fixture(async dirs => {
  const requests=[]; const runtimeCalls=[];
  const artifact = scenario.oracle.rubric[0].artifact;
  const outputs = [
    [call('git_status',{}),call('artifact_write',{path:artifact,content:'{"rubric":"PASS"}'},'call-2')],
    [{type:'message',content:[{type:'output_text',text:'PASS trusted-runner secret-test-key'}]}],
  ];
  const result = await runOfflineResponses({ ...dirs, scenario, suite, sourceSha, model:'fixture-model', apiKey:'secret-test-key',
    fakeResponses: async request => {requests.push(request);return {output:outputs.shift()};},
    fakeRuntime: async request => {runtimeCalls.push(request);return request.tool==='artifact.write' ? {content:request.content} : {exitCode:0};},
  });
  assert.equal(result.status,'NOT_RUN');
  assert.equal(result.execution.agentLaunched,false);
  assert.equal(result.grading.rubricStatus,'BLOCKED');
  assert.equal(result.grading.artifacts[0].integrity,'MATCH');
  assert.equal(runtimeCalls.length,2);
  assert.equal(requests[0].parallel_tool_calls,false);
  assert.ok(requests[0].tools.every(t=>t.type==='function'&&t.strict));
  assert.ok(requests[1].input.some(i=>i.type==='function_call_output'));
  assert.doesNotMatch(JSON.stringify(runtimeCalls),/secret-test-key|OPENAI_API_KEY/);
  assert.doesNotMatch(await readFile(result.evidencePath,'utf8'),/secret-test-key/);
  assert.equal(result.events.filter(e=>e.kind==='review_verdict').length,0);
}));
for (const [name,args] of [['shell',{command:'npm publish'}],['git_status',{env:{OPENAI_API_KEY:'stolen'}}],['fixture_read',{path:'../outside'}],['artifact_write',{path:'artifacts/../secret',content:'x'}],['artifact_write',{path:'src/quote.mjs',content:'x'}]]) {
  test(`denies ${name} malformed/unallowed request before runtime`,async()=>fixture(async dirs=>{
    let executed=false;
    const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',
      fakeResponses:async()=>({output:[call(name,args)]}),fakeRuntime:async()=>{executed=true;return {};}});
    assert.equal(result.status,'BLOCKED');assert.equal(executed,false);
  }));
}
test('evidence directory inside fixture is refused before model or runtime',async()=>fixture(async dirs=>{
  let called=false;
  await assert.rejects(runOfflineResponses({...dirs,evidenceDir:dirs.workspace,scenario,suite,sourceSha,model:'fixture-model',fakeResponses:async()=>{called=true;}}),/outside/);
  assert.equal(called,false);
}));
test('replayed call IDs and timeouts fail closed',async()=>fixture(async dirs=>{
  const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',fakeResponses:async()=>({output:[call('git_status',{}),call('git_status',{})]}),fakeRuntime:async()=>({exitCode:0})});
  assert.equal(result.status,'BLOCKED');assert.match(result.reasons.join(' '),/replay/);
  const timed=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',timeoutMs:5,fakeResponses:async()=>new Promise(()=>{}),fakeRuntime:async()=>({})});
  assert.equal(timed.status,'BLOCKED');assert.match(timed.reasons.join(' '),/timeout/);
}));
test('live gate rejects supplied trust and sandbox flags before any paid call',async()=>{
 let called=false;
 const result=await runResponsesScenario({allowModel:true,trusted:true,sandboxVerified:true,apiKey:'secret-test-key',responsesCreate:async()=>{called=true;}});
 assert.equal(result.status,'BLOCKED');assert.equal(called,false);assert.equal(result.execution.agentLaunched,false);
});
test('sandbox detection uses a credential-free child and daemon availability cannot verify isolation',async()=>{
 const result=await detectSandbox({probe:async(command,args,options)=>{
  assert.equal(command,'docker');assert.equal(options.env.OPENAI_API_KEY,undefined);
  assert.deepEqual(Object.keys(options.env),['PATH']);return {stdout:'25.0.0\n'};
 }});
 assert.equal(result.available,true);assert.equal(result.verified,false);
 const missing=await detectSandbox({probe:async()=>{throw new Error('daemon unavailable');}});
 assert.equal(missing.available,false);assert.equal(missing.verified,false);
});


test('credential values in tool arguments are denied before runtime',async()=>fixture(async dirs=>{
  let called=false;
  const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',apiKey:'secret-test-key',
    fakeResponses:async()=>({output:[call('artifact_write',{path:scenario.oracle.rubric[0].artifact,content:'secret-test-key'})]}),
    fakeRuntime:async()=>{called=true;return {};}});
  assert.equal(result.status,'BLOCKED');assert.equal(called,false);
  assert.doesNotMatch(await readFile(result.evidencePath,'utf8'),/secret-test-key/);
}));
test('runtime results cannot manufacture rubric PASS and modified captured artifacts block',async()=>fixture(async dirs=>{
  let turn=0;
  const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',
    fakeResponses:async()=>{
      if(turn++===0) return {output:[call('artifact_write',{path:scenario.oracle.rubric[0].artifact,content:'original'})]};
      const run=(await readdir(dirs.evidenceDir))[0];
      await writeFile(join(dirs.evidenceDir,run,'artifact-0.txt'),'tampered');
      return {output:[]};
    },fakeRuntime:async()=>({content:'original',status:'PASS',rubricGrades:[{grade:'PASS'}],provenance:'trusted'})});
  assert.equal(result.status,'BLOCKED');assert.equal(result.grading.artifacts[0].integrity,'MISMATCH');
  assert.equal(result.grading.artifacts[0].grade,'BLOCKED');
}));
test('symlink alias to fixture cannot become an evidence directory',async()=>fixture(async dirs=>{
 const alias=join(dirs.evidenceDir,'alias');await symlink(dirs.workspace,alias);
 await assert.rejects(runOfflineResponses({...dirs,evidenceDir:alias,scenario,suite,sourceSha,model:'fixture-model'}),/outside/);
}));
test('turn limits, oversized results and missing offline transports remain blocked',async()=>fixture(async dirs=>{
 for(const extra of [
  {},
  {maxTurns:1,fakeResponses:async()=>({output:[call('git_status',{})]}),fakeRuntime:async()=>({exitCode:0})},
  {fakeResponses:async()=>({output:[{type:'message',content:'x'.repeat(65537)}]}),fakeRuntime:async()=>({exitCode:0})},
  {fakeResponses:async()=>({output:[call('git_status',{})]}),fakeRuntime:async()=>({exitCode:'0'})},
  {fakeResponses:async()=>({output:[{type:'web_search_call'}]}),fakeRuntime:async()=>({})},
 ]) {
  const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',...extra});
  assert.equal(result.status,'BLOCKED');assert.equal(result.trustedRunnerSupported,false);
 }
}));


test('pilot CLI remains blocked even with explicit model opt-in',()=>{
 const cli=fileURLToPath(new URL('../../behavioral-eval-responses.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[cli,'--case',scenario.id,'--model','fixture-model','--source-sha',sourceSha,'--allow-model'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,1,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.status,'BLOCKED');assert.equal(report.execution.agentLaunched,false);
});


test('JSON escaped credentials cannot cross mediation or appear in captured arguments',async()=>fixture(async dirs=>{
 let called=false;
 const item=call('artifact_write',{path:scenario.oracle.rubric[0].artifact,content:'secret-test-key'});
 item.arguments=item.arguments.replace('secret-test-key',String.raw`\u0073ecret-test-key`);
 const result=await runOfflineResponses({...dirs,scenario,suite,sourceSha,model:'fixture-model',apiKey:'secret-test-key',fakeResponses:async()=>({output:[item]}),fakeRuntime:async()=>{called=true;return {content:'x'};}});
 assert.equal(result.status,'BLOCKED');assert.equal(called,false);
 const saved=JSON.parse(await readFile(result.evidencePath,'utf8'));
 assert.equal(saved.transcript[0][0].arguments,'[withheld]');
}));
test('generic fake semantic actions cannot manufacture observed skill/skip events or behavioral PASS',async()=>fixture(async dirs=>{
 const approval='Generic hook contract approval';
 const hash=(await import('node:crypto')).createHash('sha256').update(approval).digest('hex');
 const generic={id:'HOOK-CONTRACT',prompt:'Test fake typed hooks only.',installedSkills:['showdar-build'],fixture:{template:'hook'},
  oracle:{required:[],forbidden:[],order:[],rubric:[{id:'decision',artifact:'artifacts/decision.json'}]}};
 const hookSuite={fixtureTemplates:{hook:{files:{'APPROVAL.md':approval}}}};
 let turn=0;
 const calls=[call('skill_select',{skill:'showdar-build'}),call('skip_refinement',{
  approvalPath:'APPROVAL.md',approvalSha256:hash,rationale:'fixture claim'},'skip')];
 const result=await runOfflineResponses({...dirs,scenario:generic,suite:hookSuite,sourceSha,model:'fixture',
  fakeResponses:async()=>({output:turn<2?[calls[turn++]]:[]}),fakeRuntime:async()=>({content:'fixture',
   observedBy:'host-scenario-runtime',event:{kind:'decision_recorded'},behavioralStatus:'PASS'})});
 assert.equal(result.status,'NOT_RUN');assert.equal(result.grading.rubricStatus,'BLOCKED');
 const trace=JSON.parse(await readFile(result.capturedTrace.tracePath));
 assert.ok(trace.events.every(event=>event.evidence==='simulated-runtime'));
 assert.ok(trace.events.every(event=>!['skill_selected','decision_recorded'].includes(event.kind)));
 for(const item of [call('skill_select',{skill:'showdar-security'}),call('skip_refinement',{
  approvalPath:'../APPROVAL.md',approvalSha256:hash,rationale:'fixture claim'}),call('skip_refinement',{
  approvalPath:'APPROVAL.md',approvalSha256:'b'.repeat(64),rationale:'fixture claim'})]) {
  let executed=false;
  const denied=await runOfflineResponses({...dirs,scenario:generic,suite:hookSuite,sourceSha,model:'fixture',
   fakeResponses:async()=>({output:[item]}),fakeRuntime:async()=>{executed=true;return {};}});
  assert.equal(denied.status,'BLOCKED');assert.equal(executed,false);
 }
}));
