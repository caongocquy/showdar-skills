import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareBrokerCommand } from './typed-command-broker.mjs';
import { runSandboxedTool, getSandboxObservation } from './sandbox-tool-runtime.mjs';
import { runOfflineResponses } from './responses-runner.mjs';
import { createOfflineResponsesTransport } from './responses-transport.mjs';

const git = (cwd,args) => execFileSync('git',['-C',cwd,...args],{encoding:'utf8'});
const image = execFileSync('/usr/bin/docker',['image','inspect','--format','{{.Id}}','showdar-eval-tools:ci'],{encoding:'utf8'}).trim();
assert.match(image,/^sha256:[a-f0-9]{64}$/);
const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url),'utf8'));
const scenario=suite.scenarios[0];
const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));

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
  const run=request=>runSandboxedTool({request,workspace,sourceRoot,evidenceDir,imageId:image,sourceSha,readPaths,writePaths});
  const status=await run(prepareBrokerCommand({tool:'git.status'},{workspace}));
  assert.equal(status.exitCode,0);
  assert.match(status.stdout,/## /);
  assert.equal(status.behavioralStatus,'NOT_RUN');
  const diff=await run(prepareBrokerCommand({tool:'git.diff-check'},{workspace}));
  assert.equal(diff.exitCode,0);
  const read=await run({tool:'fixture.read',path:'README.md'});
  assert.equal(read.content,'fixture content');
  assert.equal(getSandboxObservation(read).sourceSha,sourceSha);
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
        request,workspace:dirs.workspace,sourceRoot:dirs.sourceRoot,evidenceDir:dirs.evidenceDir,imageId:image,sourceSha,
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
