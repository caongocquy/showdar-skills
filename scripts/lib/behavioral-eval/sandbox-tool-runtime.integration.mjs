import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareBrokerCommand } from './typed-command-broker.mjs';
import { runSandboxedTool, getSandboxObservation } from './sandbox-tool-runtime.mjs';
import { runOfflineResponses } from './responses-runner.mjs';
import { createOfflineResponsesTransport } from './responses-transport.mjs';
import { createScenarioActions, getScenarioActionObservation } from './scenario-actions.mjs';
import { approveModelFreeToolImage, requireToolImage } from './tool-image-provenance.mjs';
import { createRunnerCapture } from './runner-capture.mjs';
import { createProducerRuntime, sealCapture } from './live-producer.mjs';
import { assertCaptureBundle, verifyPilotGates } from './pilot-gates.mjs';
import { digest } from './github-provenance.mjs';

const git = (cwd,args) => execFileSync('git',['-C',cwd,...args],{encoding:'utf8'});
const image = execFileSync('/usr/bin/docker',['image','inspect','--format','{{.Id}}','showdar-eval-tools:ci'],{encoding:'utf8'}).trim();
assert.match(image,/^sha256:[a-f0-9]{64}$/);
const imageApproval=await approveModelFreeToolImage(image);
const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url),'utf8'));
const scenario=suite.scenarios[0];
const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));

test('real image approval cannot be forged, cloned, used for another image or promoted to live authority',async()=>withFixture(async dirs=>{
  assert.throws(()=>requireToolImage(imageApproval,image,{live:true}),/provenance/);
  const request={tool:'fixture.read',path:'README.md'};
  for (const approval of [undefined,{},structuredClone(imageApproval),{kind:'github-attested-image',imageId:image}]) {
    await assert.rejects(runSandboxedTool({...dirs,request,imageId:image,imageApproval:approval,readPaths:['README.md']}),/provenance/);
  }
  await assert.rejects(runSandboxedTool({...dirs,request,imageId:'sha256:'+'0'.repeat(64),imageApproval,readPaths:['README.md']}),/provenance/);
}));

async function withFixture(fn) {
  const root=await mkdtemp(path.join(tmpdir(),'showdar-container-tools-'));
  const workspace=path.join(root,'fixture'), evidenceDir=path.join(root,'evidence');
  await mkdir(workspace,{mode:0o777});
  await chmod(workspace,0o777);
  await mkdir(evidenceDir,{mode:0o700});
  // Fixture parent stays host-owned so CI can clean up files written by UID 65534.
  await mkdir(path.join(workspace,'artifacts'),{mode:0o777});
  await chmod(path.join(workspace,'artifacts'),0o777);
  await writeFile(path.join(workspace,'README.md'),'fixture content',{mode:0o644});
  git(workspace,['init','--quiet']);
  git(workspace,['add','README.md']);
  git(workspace,['-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--quiet','-m','fixture']);
  const sourceSha=git(sourceRoot,['rev-parse','HEAD']).trim();
  try {await fn({workspace,evidenceDir,sourceRoot,sourceSha});} finally {await rm(root,{recursive:true,force:true});}
}

test('actual Docker runtime executes only typed Git, fixture read and artifact write with host evidence', {timeout:90_000},async()=>withFixture(async dirs=>{
  const {workspace,evidenceDir,sourceSha}=dirs;
  const readPaths=['README.md'];
  const writePaths=['artifacts/decision.json'];
  const run=request=>runSandboxedTool({request,workspace,sourceRoot,evidenceDir,imageId:image,imageApproval,sourceSha,readPaths,writePaths});
  const status=await run(prepareBrokerCommand({tool:'git.status'},{workspace}));
  assert.equal(status.exitCode,0);
  assert.match(status.stdout,/## /);
  assert.equal(status.behavioralStatus,'NOT_RUN');
  const diff=await run(prepareBrokerCommand({tool:'git.diff-check'},{workspace}));
  assert.equal(diff.exitCode,0);
  const read=await run({tool:'fixture.read',path:'README.md'});
  assert.equal(read.content,'fixture content');
  assert.equal(getSandboxObservation(read).sourceSha,sourceSha);
  const capture=createRunnerCapture({directory:evidenceDir,scenarioId:'TOOL-CONTRACT',sourceSha,modelIdentity:'none'});
  assert.throws(()=>capture.observeTool({tool:'fixture.read',path:'other.md'},read),/binding/);
  capture.observeTool({tool:'fixture.read',path:'README.md'},read);
  assert.throws(()=>capture.observeTool({tool:'fixture.read',path:'README.md'},read),/replay/);
  read.content='tampered';
  assert.throws(()=>getSandboxObservation(read),/modified/);
  const written=await run({tool:'artifact.write',path:'artifacts/decision.json',content:'{"decision":"fixture"}'});
  assert.equal(written.content,'{"decision":"fixture"}');
  assert.equal(await readFile(path.join(workspace,'artifacts/decision.json'),'utf8'),written.content);
  const saved=JSON.parse(await readFile(written.evidenceFile,'utf8'));
  assert.equal(saved.kind,'sandbox-tool-observation');
  assert.equal(saved.behavioralGrade,'NOT_EVALUATED');
  assert.equal(saved.imageId,image);
  assert.equal(saved.sourceSha,sourceSha);
  assert.equal(saved.tool,'artifact.write');
  assert.equal(written.observedBy,'host-tool-runtime');
}));

test('generic model-free skill/skip hooks perform real pinned reads and lifecycle persistence without live provenance', {timeout:90_000},async()=>withFixture(async dirs=>{
  const approval='Generic preapproved scope; this is a hook contract, not a behavioral pilot.';
  const approvalSha256=createHash('sha256').update(approval).digest('hex');
  await writeFile(path.join(dirs.workspace,'APPROVAL.md'),approval,{mode:0o644});
  const hookScenario={id:'HOOK-CONTRACT',prompt:'Test only the typed hook contract.',installedSkills:['showdar-build'],
    fixture:{template:'hook'},oracle:{required:[],forbidden:[],order:[],rubric:[{id:'hook-artifact',artifact:'artifacts/decision.json'}]}};
  const hookSuite={fixtureTemplates:{hook:{files:{'APPROVAL.md':approval}}}};
  const actions=await createScenarioActions({...dirs,imageId:image,imageApproval,installedSkills:['showdar-build'],approvalFiles:{'APPROVAL.md':approvalSha256}});
  const skip={approvalPath:'APPROVAL.md',approvalSha256,rationale:'The exact supplied approval defines this generic test scope.'};
  let turn=0;const observed=[];
  const calls=[{name:'skill_select',arguments:JSON.stringify({skill:'showdar-build'})},
    {name:'skip_refinement',arguments:JSON.stringify(skip)}];
  const result=await runOfflineResponses({...dirs,scenario:hookScenario,suite:hookSuite,model:'offline-hook-fixture',timeoutMs:60_000,
    fakeResponses:async()=>({output:turn<2?[{type:'function_call',call_id:'hook-'+turn,...calls[turn++]}]:[]}),
    fakeRuntime:async request=>{
      const {tool,...args}=request;
      const output=tool==='skill.select'?await actions.selectSkill(args):await actions.skipRefinement(args);
      observed.push(output);return output;
    },
  });
  assert.equal(result.status,'NOT_RUN',JSON.stringify(result.reasons));
  assert.equal(result.execution.agentLaunched,false);
  assert.equal(result.grading.rubricStatus,'BLOCKED');
  assert.equal(result.grading.artifacts[0].integrity,'MATCH');
  const receipt=getScenarioActionObservation(observed[1]);
  const decision=JSON.parse(observed[1].content);
  assert.equal(receipt.sourceSha,dirs.sourceSha);
  assert.equal(receipt.approvalSource.sha256,approvalSha256);
  assert.equal(decision.workflow.skippedStages[0].stage,'showdar-requirements');
  assert.equal(decision.workflow.revision,1);
  assert.equal(decision.claims.requiresIndependentHumanReview,true);
  assert.equal(createHash('sha256').update(await readFile(receipt.artifact.snapshotFile)).digest('hex'),receipt.artifact.sha256);
  await assert.rejects(actions.skipRefinement(skip),/already accounted/);
  const trace=JSON.parse(await readFile(result.capturedTrace.tracePath));
  assert.deepEqual(trace.events.map(event=>event.kind),['skill_selected','decision_recorded','file_written']);
  assert.ok(trace.events.every(event=>event.evidence==='host-scenario-runtime'));
  assert.equal(trace.execution.kind,'simulated');assert.equal(trace.behavioralStatus,'BLOCKED');
  const replay=createRunnerCapture({directory:dirs.evidenceDir,scenarioId:'HOOK-CONTRACT',sourceSha:dirs.sourceSha,modelIdentity:'none'});
  assert.throws(()=>replay.observeAction({tool:'refinement.skip',...skip},observed[1]),/replay/);
}));

test('real tool boundary denies traversal and symlink escapes, excludes credentials and preserves snapshot integrity', {timeout:90_000},async()=>withFixture(async dirs=>{
  const previous=process.env.OPENAI_API_KEY;
  const sentinel='model-free-credential-leak-sentinel';
  process.env.OPENAI_API_KEY=sentinel;
  const run=request=>runSandboxedTool({...dirs,request,imageId:image,imageApproval,
    readPaths:['README.md','escape','../outside'],writePaths:['artifacts/decision.json','escape-parent/output.json']});
  try {
    await symlink('/etc/passwd',path.join(dirs.workspace,'escape'));
    await symlink(dirs.evidenceDir,path.join(dirs.workspace,'escape-parent'));
    for (const request of [
      {tool:'fixture.read',path:'../outside'}, {tool:'fixture.read',path:'escape'},
      {tool:'artifact.write',path:'escape-parent/output.json',content:'forged'},
      {tool:'fixture.read',path:'/proc/self/environ'},
    ]) await assert.rejects(run(request),/unsafe|symlink/);
    const read=await run({tool:'fixture.read',path:'README.md'});
    assert.doesNotMatch(JSON.stringify(read),new RegExp(sentinel));
    const written=await run({tool:'artifact.write',path:'artifacts/decision.json',content:'captured bytes'});
    const receipt=getSandboxObservation(written);
    await rm(path.join(dirs.workspace,'artifacts/decision.json'));
    await writeFile(path.join(dirs.workspace,'artifacts/decision.json'),'agent-writable tamper');
    const snapshot=await readFile(receipt.artifact.snapshotFile);
    assert.equal(snapshot.toString(),'captured bytes');
    assert.equal(createHash('sha256').update(snapshot).digest('hex'),receipt.artifact.sha256);
    await writeFile(receipt.artifact.snapshotFile,'host-evidence tamper');
    assert.notEqual(createHash('sha256').update(await readFile(receipt.artifact.snapshotFile)).digest('hex'),receipt.artifact.sha256);
  } finally {
    if (previous===undefined) delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;
  }
}));

test('actual stalled container hits the tool deadline and is removed without minting a receipt', {timeout:45_000},async()=>withFixture(async dirs=>{
  const fifo=path.join(dirs.workspace,'stalled-input');
  execFileSync('/usr/bin/mkfifo',[fifo]);
  await chmod(fifo,0o666);
  await assert.rejects(runSandboxedTool({...dirs,imageId:image,imageApproval,request:{tool:'fixture.read',path:'stalled-input'},
    readPaths:['stalled-input']}),/deadline exceeded/);
  const running=execFileSync('/usr/bin/docker',['ps','--all','--filter','name=showdar-tool-','--format','{{.Names}}'],{encoding:'utf8'});
  assert.equal(running.trim(),'');
}));

test('real Docker runtime can back the offline Responses function-call loop without behavioral PASS', {timeout:90_000},async()=>withFixture(async dirs=>{
  const {sourceSha}=dirs;
  let turn=0;
  const artifact=scenario.oracle.rubric[0].artifact;
  const seedFile=Object.keys(suite.fixtureTemplates[scenario.fixture.template].files)[0];
  await writeFile(path.join(dirs.workspace,seedFile),suite.fixtureTemplates[scenario.fixture.template].files[seedFile],{mode:0o644});
  const outputs=[
    [{type:'function_call',name:'fixture_read',call_id:'call-read',arguments:JSON.stringify({path:seedFile})}],
    [{type:'function_call',name:'artifact_write',call_id:'call-write',arguments:JSON.stringify({path:artifact,content:'fixture-grade: PASS'})}],
    [{type:'message',content:[{type:'output_text',text:'done'}]}],
  ];
  const result=await runOfflineResponses({
    ...dirs,scenario,suite,sourceSha,model:'offline-fixture',
    apiKey:'model-free-transport-sentinel',
    fakeResponses:createOfflineResponsesTransport({apiKey:'model-free-transport-sentinel',fakeFetch:async(_url,options)=>{
      assert.doesNotMatch(options.body,/evidenceFile|snapshotFile|host-tool-runtime|model-free-transport-sentinel/);
      return new Response(JSON.stringify({id:`resp_fixture_${turn}`,model:'offline-fixture',status:'completed',output:outputs[turn++]}),
        {headers:{'x-request-id':`req_fixture_${turn}`}});
    }}),
    fakeRuntime:async request=>{
      const tool=await runSandboxedTool({
        request,workspace:dirs.workspace,sourceRoot:dirs.sourceRoot,evidenceDir:dirs.evidenceDir,imageId:image,imageApproval,sourceSha,
        readPaths:[seedFile],writePaths:[artifact],
      });
      return tool;
    },
    timeoutMs:60_000,
  });
  assert.equal(result.status,'NOT_RUN',JSON.stringify(result.reasons));
  assert.equal(result.execution.agentLaunched,false);
  assert.equal(result.grading.rubricStatus,'BLOCKED');
  assert.equal(result.grading.artifacts[0].integrity,'MATCH');
  assert.notEqual(result.grading.artifacts[0].grade,'PASS');
  const trace=JSON.parse(await readFile(result.capturedTrace.tracePath));
  assert.equal(trace.execution.kind,'simulated');
  assert.equal(trace.behavioralStatus,'BLOCKED');
  assert.ok(trace.events.every(event=>event.evidence==='host-tool-runtime'));
  assert.ok(trace.events.every(event=>event.receiptSha256 || event.artifactSha256));
  assert.ok(trace.responses.every(response=>response.origin==='simulated'));
  assert.equal(trace.authentication.kind,'host-session-hmac-sha256');
}));

test('producer HTTP, semantic hooks, Docker and durable bundle verify end-to-end; simulated origin always blocks grading', {timeout:90_000},async()=>withFixture(async dirs=>{
  const approval='Generic model-free contract, not a behavioral pilot.';
  await writeFile(path.join(dirs.workspace,'APPROVAL.md'),approval,{mode:0o644});
  const contract={id:'PRODUCER-CONTRACT',prompt:'Only exercise infrastructure.',installedSkills:['showdar-build'],fixture:{template:'contract'},
    oracle:{required:[],forbidden:[],order:[],rubric:[{id:'proof',artifact:'artifacts/decision.json'}]}};
  const contractSuite={fixtureTemplates:{contract:{files:{'APPROVAL.md':approval}}}};
  const actions=await createScenarioActions({...dirs,imageId:image,imageApproval,installedSkills:contract.installedSkills,approvalFiles:{'APPROVAL.md':digest(approval)}});
  const calls=[['skill_select',{skill:'showdar-build'}],['skip_refinement',{approvalPath:'APPROVAL.md',approvalSha256:digest(approval),rationale:'Generic supplied scope.'}],
    ['approval_request',{scope:'already-approved-spec',message:'Please approve the generic scope'}],
    ['scope_change',{decision:'new-requirements',message:'Propose generic additional requirements'}],['git_diff_check',{}]];
  let turn=0;
  const fakeResponses=createOfflineResponsesTransport({fakeFetch:async()=>new Response(JSON.stringify({id:`resp_${turn}`,model:'gpt-6-luna',status:'completed',
    output:turn<calls.length?[{type:'function_call',call_id:`call_${turn}`,name:calls[turn][0],arguments:JSON.stringify(calls[turn++][1])}]:
      [{type:'message',content:[{type:'output_text',text:'Please approve the new scope.'}]}]}),{headers:{'x-request-id':`req_${turn}`}})});
  const result=await runOfflineResponses({...dirs,scenario:contract,suite:contractSuite,model:'gpt-6-luna',timeoutMs:60000,fakeResponses,
    fakeRuntime:createProducerRuntime({...dirs,scenario:contract,suite:contractSuite,actions,imageId:image,imageApproval})});
  assert.equal(result.status,'NOT_RUN',JSON.stringify(result.reasons));
  const directory=await mkdtemp(path.join(dirs.evidenceDir,'durable-'));
  const targetScenario=suite.scenarios.find(item=>item.id==='BRAIN-001');
  const evidence=await sealCapture({...dirs,result,scenario:contract,targetScenario,runnerRevision:dirs.sourceSha,model:'gpt-6-luna',plannedModelIdentity:'gpt-6-luna',
    runId:'123',runAttempt:1,pullRequest:23,imageId:image,imageApproval,directory});
  const trace=JSON.parse(await readFile(path.join(directory,'trace.json')));
  const artifacts=JSON.parse(await readFile(path.join(directory,'artifacts.json')));
  assertCaptureBundle(evidence,trace,artifacts,evidence,targetScenario);
  assert.ok(trace.events.some(event=>event.kind==='approval_requested'));
  assert.ok(trace.events.some(event=>event.kind==='scope_changed'));
  assert.ok(trace.events.find(event=>event.kind==='verification_observed').receiptSha256);
  assert.equal(evidence.purpose,'infrastructure-contract');
  assert.equal(evidence.modelIdentity,'gpt-6-luna');
  assert.equal(evidence.plannedModelIdentity,'gpt-6-luna');
  assert.equal(trace.modelIdentity,'gpt-6-luna');
  assert.ok(trace.responses.every(response=>response.origin==='simulated'));
  assert.ok(trace.receipts.filter(item=>item.receipt.kind==='responses-transport-observation').every(item=>item.receipt.modelIdentity==='gpt-6-luna'));
  assert.equal(evidence.behavioralStatus,'BLOCKED');
  const expected={...evidence,evidenceSha256:digest(await readFile(path.join(directory,'evidence.json')))};
  const verdict=await verifyPilotGates({evidencePath:path.join(directory,'evidence.json'),tracePath:path.join(directory,'trace.json'),artifactPath:path.join(directory,'artifacts.json'),expected});
  assert.equal(verdict.prePilot,'NO-GO');assert.equal(verdict.behavioral,'BLOCKED');
  assert.match(verdict.reason,/Unapproved image/);
  assert.throws(()=>assertCaptureBundle({...evidence,purpose:'behavioral-live-capture',captureScenarioId:'BRAIN-001'},
    {...trace,scenarioId:'BRAIN-001'},artifacts,{...evidence,purpose:'behavioral-live-capture',captureScenarioId:'BRAIN-001'},targetScenario),/Simulated/);
  for (const tamper of [()=>trace.coverage.complete=false,()=>trace.responses[0].id='forged',()=>trace.receipts[0].receipt.origin='responses-live',
    ()=>trace.interactions[0].payload.skill='forged']) {
    const copied=structuredClone(trace);tamper();
    assert.throws(()=>assertCaptureBundle(evidence,trace,artifacts,evidence,targetScenario));
    Object.assign(trace,copied);
  }
  const saved=JSON.parse(await readFile(result.evidencePath));
  await writeFile(saved.snapshots[0].file,'tampered');
  await assert.rejects(sealCapture({...dirs,result,scenario:contract,runnerRevision:dirs.sourceSha,model:'gpt-6-luna',runId:'123',runAttempt:1,pullRequest:23,
    imageId:image,imageApproval,directory}),/Artifact changed/);
}));
