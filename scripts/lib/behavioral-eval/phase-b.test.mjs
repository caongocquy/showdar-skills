import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digest, assertTrustedRun, assertSignedSubject } from './github-provenance.mjs';
import { requireToolImage, assertImageManifest } from './tool-image-provenance.mjs';
import { SANDBOX_IMAGE } from './container-sandbox.mjs';
import { createRunnerCapture } from './runner-capture.mjs';
import { assertCaptureBundle, validateHumanRubric, verifyPilotGates } from './pilot-gates.mjs';
import { produceLiveCapture, sealCapture, INFRASTRUCTURE_CHECKS } from './live-producer.mjs';

const revision='a'.repeat(40);
test('trusted producer CLI rejects live mode before parsing input or accessing authenticated services',()=>{
  const cli=fileURLToPath(new URL('../../behavioral-eval-producer.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'--live'],{encoding:'utf8',timeout:5000,
    env:{PATH:process.env.PATH,GITHUB_REPOSITORY:'caongocquy/showdar-skills',GITHUB_REF:'refs/heads/main',
      GITHUB_EVENT_NAME:'workflow_dispatch',RUNNER_TEMP:tmpdir(),PRODUCER_INPUT:'not-json',GITHUB_TOKEN:'must-never-be-used'}});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0);
  assert.match(result.stderr,/Live Responses disabled/);
  assert.doesNotMatch(result.stderr,/Unexpected token|JSON.parse|fetch failed/);
});
test('image capabilities cannot be forged, cloned or substituted by immutable-looking IDs',()=>{
  for (const fake of [undefined,{}, {kind:'github-attested-image',imageId:'sha256:'+'b'.repeat(64)}]) {
    assert.throws(()=>requireToolImage(fake,'sha256:'+'b'.repeat(64)),/provenance/);
  }
});

test('human review binds every channel record and all live evidence; forged or incomplete approvals are rejected',()=>{
  const scenario={oracle:{rubric:[{id:'proof'}],forbidden:[{kind:'approval_requested',attributes:{scope:'already-approved-spec'}}]}};
  const trace={interactions:[{id:'interaction-0',sha256:'b'.repeat(64),sequence:0}]};
  const evidence={sourceSha:revision,runnerRevision:revision,scenarioId:'BRAIN-001',scenarioSha256:'b'.repeat(64),
    modelIdentity:'explicit-model',plannedModelIdentity:'explicit-model',runId:'123',runAttempt:1,pullRequest:23,
    artifactSha256:'c'.repeat(64),traceSha256:'d'.repeat(64),interactionSha256:'e'.repeat(64),coverageSha256:'f'.repeat(64),
    receiptSha256:'a'.repeat(64),image:{imageId:'sha256:'+'a'.repeat(64)},responseIds:['resp_actual']};
  const data={...evidence,decision:'APPROVED',evidenceSha256:'1'.repeat(64),grades:{proof:'PASS'},
    interactions:[{id:'interaction-0',sha256:'b'.repeat(64),events:[{kind:'approval_requested',attributes:{scope:'already-approved-spec'}}]}]};
  const review={user:{login:'independent',type:'User'},state:'APPROVED',commit_id:revision,author_association:'COLLABORATOR',
    body:'SHOWDAR-RUBRIC/2\n'+JSON.stringify(data)};
  const options={evidence,evidenceSha256:'1'.repeat(64),trace,scenario,excludedActors:['executor','pr-author']};
  assert.equal(validateHumanRubric(review,options).classified[0].kind,'approval_requested');
  for (const delta of [{user:{login:'executor',type:'User'}},{user:{login:'bot',type:'Bot'}},{state:'COMMENTED'},
    {commit_id:'c'.repeat(40)},{author_association:'NONE'}]) assert.throws(()=>validateHumanRubric({...review,...delta},options),/approval/);
  for (const delta of [{evidenceSha256:'2'.repeat(64)},{runAttempt:2},{sourceSha:'c'.repeat(40)},{runnerRevision:'d'.repeat(40)},
    {image:{}},{responseIds:['forged']},{interactions:[]},{grades:{proof:'PASS',invented:'PASS'}},
    {interactions:[{id:'interaction-0',sha256:'forged',events:[]}]},
    {interactions:[{id:'interaction-0',sha256:'b'.repeat(64),events:[{kind:'approval_requested',attributes:{scope:'invented'}}]}]}]) {
    assert.throws(()=>validateHumanRubric({...review,body:'SHOWDAR-RUBRIC/2\n'+JSON.stringify({...data,...delta})},options));
  }
});

test('caller authorization flags cannot enable the disabled producer',async()=>{
  await assert.rejects(produceLiveCapture({runnerRevision:revision,sourceSha:revision,runId:'123',runAttempt:1,pullRequest:23,
    model:'explicit-model',allowModel:true,apiKey:'must-never-be-used',imageApproval:{kind:'github-attested-image'},
    verified:true,securityGates:true}),/Live Responses disabled/);
  const verdict=await verifyPilotGates({expected:{verified:true,behavioralStatus:'PASS'}});
  assert.equal(verdict.prePilot,'NO-GO');assert.equal(verdict.behavioral,'BLOCKED');
  // Guard the omitted planned-model fallback before provenance validation.
  await assert.rejects(sealCapture({runnerRevision:revision,sourceSha:revision,model:'contract',runId:'123',runAttempt:1,pullRequest:23,
    imageApproval:{},imageId:'sha256:'+'b'.repeat(64)}),/provenance/);
});
test('signed build policy rejects image substitution, recipe drift and run/attempt replay',()=>{
  const manifest={schemaVersion:1,purpose:'tool-image-build',baseImage:SANDBOX_IMAGE,
    dockerfileSha256:'b'.repeat(64),imageConfigSha256:'c'.repeat(64),imageId:'sha256:'+'d'.repeat(64),
    archiveSha256:'e'.repeat(64),runnerRevision:revision,runId:'123',runAttempt:1};
  assertImageManifest(manifest,manifest,manifest.dockerfileSha256);
  for (const key of ['imageId','archiveSha256','runnerRevision','runId','runAttempt']) {
    assert.throws(()=>assertImageManifest({...manifest,[key]:key==='runAttempt'?2:'forged'},manifest,manifest.dockerfileSha256),/mismatch/);
  }
  assert.throws(()=>assertImageManifest({...manifest,baseImage:'node:latest'},manifest,manifest.dockerfileSha256),/recipe/);
  assert.throws(()=>assertImageManifest(manifest,manifest,'f'.repeat(64)),/recipe/);
});
test('privileged run policy rejects forks, non-main runs, wrong workflow, actor, SHA and attempts',()=>{
  const binding={workflow:'behavioral-tool-image.yml',runnerRevision:revision,runId:'123',runAttempt:1};
  const run={id:123,run_attempt:1,head_sha:revision,head_branch:'main',event:'workflow_dispatch',conclusion:'success',
    path:'.github/workflows/behavioral-tool-image.yml',repository:{full_name:'caongocquy/showdar-skills'},
    head_repository:{full_name:'caongocquy/showdar-skills'},actor:{login:'operator'}};
  assertTrustedRun(run,binding);
  for (const delta of [{head_branch:'feature'},{head_repository:{full_name:'evil/fork'}},{run_attempt:2},
    {head_sha:'b'.repeat(40)},{event:'pull_request'},{conclusion:null},{path:'other.yml'},{actor:{}}]) {
    assert.throws(()=>assertTrustedRun({...run,...delta},binding),/Untrusted/);
  }
  const invocation='https://github.com/caongocquy/showdar-skills/actions/runs/123/attempts/1';
  const attestations=[{verificationResult:{statement:{subject:[{digest:{sha256:digest('bytes')}}],
    predicate:{runDetails:{metadata:{invocationId:invocation}}}},signature:{certificate:{runInvocationURI:invocation}}}}];
  assertSignedSubject(attestations,digest('bytes'),binding);
  assert.throws(()=>assertSignedSubject(attestations,digest('tamper'),binding),/binding/);
  assert.throws(()=>assertSignedSubject(attestations,digest('bytes'),{...binding,runAttempt:2}),/binding/);
});
test('all permitted channels retain semantic content; opaque channels and redaction block absence claims',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'coverage-'));
  try {
    const capture=createRunnerCapture({directory,scenarioId:'CHANNEL-CONTRACT',sourceSha:revision,modelIdentity:'fixture'});
    capture.observeResponse({id:'fake',output:[{type:'message',content:[{type:'output_text',text:'Please approve the already approved scope.'}]},
      {type:'reasoning',summary:[{type:'summary_text',text:'I will add new requirements.'}]},
      {type:'function_call',name:'artifact_write',call_id:'call1',arguments:'withheld'}]});
    capture.observeTool({tool:'artifact.write',path:'artifacts/decision.json',content:'Add requirements?'},{content:'Approval please'});
    const sealed=await capture.finish(true);
    const trace=JSON.parse(await readFile(sealed.tracePath));
    assert.equal(trace.coverage.complete,true);
    assert.deepEqual(new Set(trace.interactions.map(item=>item.channel)),new Set(['assistant-text','reasoning-summary','tool-arguments','tool-results','artifact-bytes']));
    assert.ok(trace.interactions.every(item=>item.sha256===digest(JSON.stringify(item.payload))));
    assert.match(JSON.stringify(trace.interactions),/Please approve/);
    assert.equal(trace.behavioralStatus,'BLOCKED');
    for (const output of [
      [{type:'message',content:[{type:'output_audio',audio:'opaque'}]}],
      [{type:'message',content:[{type:'output_text',text:'secret approval'}]}],
      [{type:'reasoning',summary:[],encrypted_content:'opaque'}],
      [{type:'function_call',name:'scope_change',call_id:'unobserved',arguments:'{}'}],
    ]) {
      const child=await mkdtemp(path.join(directory,'child-'));
      const incomplete=createRunnerCapture({directory:child,scenarioId:'CHANNEL-CONTRACT',sourceSha:revision,modelIdentity:'fixture',apiKey:'secret'});
      incomplete.observeResponse({output});
      const saved=await incomplete.finish(true);
      const partial=JSON.parse(await readFile(saved.tracePath));
      assert.equal(partial.coverage.complete,false);
      assert.ok(partial.coverage.issues.length>0);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('Phase B workflow privilege is limited to attesting same-run trusted artifacts; inputs never enter shell syntax',async()=>{
  for (const name of ['behavioral-tool-image.yml','behavioral-live-capture.yml']) {
    const workflow=await readFile(new URL(`../../../.github/workflows/${name}`,import.meta.url),'utf8');
    assert.match(workflow,/workflow_dispatch:/);
    assert.match(workflow,/permissions: \{\}/);
    assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(workflow,/pull_request_target:|workflow_run:/);
    assert.doesNotMatch(workflow.split('  prepare-paid-capture:')[0],/OPENAI_API_KEY|secrets\./);
    const [execution,rest]=workflow.split('  attest:\n');
    const attester=rest.split('  prepare-paid-capture:')[0];
    assert.doesNotMatch(execution,/id-token: write|attestations: write/);
    assert.match(execution,/ref: \$\{\{ github.sha \}\}/);
    assert.match(execution,/persist-credentials: false/);
    assert.match(attester,/needs: (build|contract)/);
    assert.match(attester,/id-token: write/);
    assert.match(attester,/steps\.provenance\.outputs\.bundle-path/);
    assert.doesNotMatch(attester,/checkout@|run:|run-id:|github-token:/);
    for (const action of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(action[1],/@[a-f0-9]{40} /);
    for (const block of workflow.split('run:').slice(1)) assert.doesNotMatch(block.split(/\n(?:      - |  [a-z][a-z-]+:)/)[0],/\$\{\{ inputs\./);
  }
});

test('a verification event must bind its real tool receipt; removing that binding cannot be repaired by trust flags',()=>{
  // This is a structural policy fixture, never authenticated evidence or a behavioral execution.
  const scenario={id:'BRAIN-001',oracle:{rubric:[{artifact:'artifacts/decision.json'}]}};
  const image={kind:'model-free-image',imageId:'sha256:'+'b'.repeat(64),behavioralStatus:'BLOCKED'};
  const transport={kind:'responses-transport-observation',requestSha256:'c'.repeat(64),resultSha256:'d'.repeat(64),
    responseId:'resp_fixture',requestId:'req_fixture',modelIdentity:'fixture',origin:'simulated'};
  const tool={kind:'sandbox-tool-observation',tool:'git.diff-check',sourceSha:revision,imageId:image.imageId,imageProvenance:image,
    artifact:{path:'artifacts/decision.json',sha256:digest('fixture')}};
  const receiptSha=digest(JSON.stringify(tool));
  const trace={sourceSha:revision,scenarioId:'PRODUCER-CONTRACT',modelIdentity:'fixture',complete:true,
    execution:{kind:'simulated',agentLaunched:false},coverage:{complete:true,channels:['assistant-text','reasoning-summary','tool-arguments','tool-results','artifact-bytes'],issues:[]},
    interactions:[],receipts:[{sha256:receiptSha,receipt:tool},{sha256:digest(JSON.stringify(transport)),receipt:transport}],
    responses:[{id:'resp_fixture',requestId:'req_fixture',origin:'simulated',output:[],outputSha256:digest('[]'),transportReceiptSha256:digest(JSON.stringify(transport))}],
    events:[{kind:'verification_observed',attributes:{command:'git diff --check',exitCode:0},evidence:'host-tool-runtime',receiptSha256:receiptSha,sequence:0}]};
  const artifacts=[{path:'artifacts/decision.json',content:'fixture',sha256:digest('fixture')}];
  const evidence={schemaVersion:2,purpose:'infrastructure-contract',behavioralStatus:'BLOCKED',captureComplete:true,runnerRevision:revision,sourceSha:revision,
    scenarioId:scenario.id,scenarioSha256:digest(JSON.stringify(scenario)),modelIdentity:'fixture',plannedModelIdentity:'not-authorized',runId:'123',runAttempt:1,pullRequest:23,
    traceSha256:'c'.repeat(64),artifactSha256:'d'.repeat(64),coverageSha256:digest(JSON.stringify(trace.coverage)),interactionSha256:digest('[]'),
    receiptSha256:digest(JSON.stringify(trace.receipts)),execution:trace.execution,responseIds:['resp_fixture'],captureScenarioId:'PRODUCER-CONTRACT',checks:[...INFRASTRUCTURE_CHECKS],image};
  assertCaptureBundle(evidence,trace,artifacts,evidence,scenario);
  delete trace.events[0].receiptSha256;
  assert.throws(()=>assertCaptureBundle({...evidence,verified:true},trace,artifacts,evidence,scenario),/Tool event receipt/);
});
