import { readFile, writeFile, mkdir, mkdtemp, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { digest, githubJson } from './github-provenance.mjs';
import { requireToolImage } from './tool-image-provenance.mjs';
import { assertSourceRevision, runSandboxedTool } from './sandbox-tool-runtime.mjs';
import { createScenarioActions } from './scenario-actions.mjs';
import { createLiveResponsesTransport, assertLiveTransportEnabled } from './responses-transport.mjs';
import { runCapturedResponses } from './responses-runner.mjs';
const exec=promisify(execFile);

function validateBinding({runnerRevision,sourceSha,runId,runAttempt,pullRequest,model}) {
  if (![runnerRevision,sourceSha].every(sha=>/^[a-f0-9]{40}$/.test(sha ?? '')) ||
      !/^[1-9]\d*$/.test(String(runId)) || !Number.isSafeInteger(runAttempt) || runAttempt<1 ||
      !Number.isSafeInteger(pullRequest) || pullRequest<1 || typeof model!=='string' || !model.trim() || model.length>128) throw new Error('Invalid producer identity');
}

/** Fixed native transport and sandbox composition. The transport's private deployment gate stays disabled. */
export async function produceLiveCapture(options) {
  validateBinding(options);
  assertLiveTransportEnabled(options.allowModel);
  options={...options,timeoutMs:120000,maxTurns:8};
  requireToolImage(options.imageApproval,options.imageId,{live:true});
  const {verifyPilotGates}=await import('./pilot-gates.mjs');
  const readiness=await verifyPilotGates({...options.prePilotEvidence,token:options.token});
  if (readiness.prePilot!=='GO') throw new Error('Verified PRE-PILOT evidence required');
  await reservePaidCapture(options);
  await assertSourceRevision(options.runnerRoot,options.runnerRevision);
  await assertSourceRevision(options.sourceRoot,options.sourceSha);
  const send=createLiveResponsesTransport({allowModel:options.allowModel===true,apiKey:options.apiKey,timeoutMs:options.timeoutMs});
  const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url)));
  const scenario=suite.scenarios.find(item=>item.id===options.scenarioId);
  if (!scenario || scenario.id!=='BRAIN-001') throw new Error('Only the explicitly bounded first pilot is supported');
  const files=suite.fixtureTemplates[scenario.fixture.template].files;
  const workspace=await createProducerFixture(options.temporaryRoot,files);
  const bound={...options,workspace};
  const actions=await createScenarioActions({...bound,installedSkills:scenario.installedSkills,
    approvalFiles:Object.fromEntries(Object.entries(files).map(([file,content])=>[file,digest(content)]))});
  const runtime=createProducerRuntime({...bound,scenario,suite,actions});
  const result=await runCapturedResponses({...bound,scenario,suite,responses:send,runtime});
  await assertSourceRevision(options.sourceRoot,options.sourceSha);
  await assertSourceRevision(options.runnerRoot,options.runnerRevision);
  return sealCapture({...options,result,scenario});
}

export function assertPaidCaptureApproval(review,expected) {
  if (review?.user?.login!=='caongocquy' || review.user.type!=='User' || review.state!=='APPROVED' ||
      review.commit_id!==expected.sourceSha || !review.body?.startsWith('SHOWDAR-CAPTURE-AUTH/1\n')) throw new Error('Explicit repository-owner capture approval required');
  const approval=JSON.parse(review.body.slice('SHOWDAR-CAPTURE-AUTH/1\n'.length));
  if (approval.decision!=='AUTHORIZE_ONE_CAPTURE' || JSON.stringify(approval.binding)!==JSON.stringify(expected)) throw new Error('Paid capture approval binding mismatch');
}

async function reservePaidCapture(options) {
  if (process.env.GITHUB_REPOSITORY!=='caongocquy/showdar-skills' || process.env.GITHUB_REF!=='refs/heads/main' ||
      process.env.GITHUB_SHA!==options.runnerRevision || process.env.GITHUB_RUN_ID!==String(options.runId) ||
      Number(process.env.GITHUB_RUN_ATTEMPT)!==options.runAttempt || !path.isAbsolute(process.env.RUNNER_TEMP ?? '')) throw new Error('Native trusted workflow context required');
  const binding={runnerRevision:options.runnerRevision,sourceSha:options.sourceSha,scenarioId:options.scenarioId,modelIdentity:options.model,
    runId:String(options.runId),runAttempt:options.runAttempt,pullRequest:options.pullRequest,
    image:requireToolImage(options.imageApproval,options.imageId,{live:true}),
    prePilotEvidenceSha256:options.prePilotEvidence.expected.evidenceSha256,budget:{timeoutMs:120000,maxTurns:8,maxOutputTokens:2048}};
  if (options.prePilotEvidence.expected.sourceSha!==options.sourceSha || options.prePilotEvidence.expected.scenarioId!==options.scenarioId ||
      options.prePilotEvidence.expected.plannedModelIdentity!==options.model ||
      options.prePilotEvidence.expected.runnerRevision!==options.runnerRevision ||
      JSON.stringify(options.prePilotEvidence.expected.image)!==JSON.stringify(binding.image)) throw new Error('Readiness does not authorize this capture identity');
  const run=await githubJson(`/actions/runs/${options.runId}/attempts/${options.runAttempt}`,options.token);
  if (String(run.id)!==binding.runId || run.run_attempt!==binding.runAttempt || run.head_sha!==binding.runnerRevision ||
      run.head_branch!=='main' || run.event!=='workflow_dispatch' || run.status!=='in_progress' ||
      run.path?.split('@')[0]!=='.github/workflows/behavioral-live-capture.yml' ||
      run.repository?.full_name!=='caongocquy/showdar-skills' || run.head_repository?.full_name!=='caongocquy/showdar-skills') throw new Error('Untrusted active capture run');
  const reviews=await githubJson(`/pulls/${options.pullRequest}/reviews?per_page=100`,options.token);
  if (!Array.isArray(reviews)) throw new Error('Capture approval unavailable');
  const review=reviews.findLast(item=>item.user?.login==='caongocquy');
  assertPaidCaptureApproval(review,binding);
  // The signed approval is single-run/single-attempt; GitHub reruns change attempt. wx also prevents process replay within the same job.
  await writeFile(path.join(process.env.RUNNER_TEMP,`paid-capture-${binding.runId}-${binding.runAttempt}.json`),JSON.stringify({binding,approvalReviewId:review.id}),{flag:'wx',mode:0o600});
}

export async function createProducerFixture(temporaryRoot,files) {
  const workspace=await mkdtemp(path.join(temporaryRoot,'fixture-'));
  await chmod(workspace,0o777);
  await mkdir(path.join(workspace,'artifacts'),{mode:0o777});
  await chmod(path.join(workspace,'artifacts'),0o777);
  for (const [file,content] of Object.entries(files)) {
    if (path.isAbsolute(file) || file.includes('\\') || file.includes('\0') || file.split('/').some(part=>!part || part==='.' || part==='..') || typeof content!=='string') throw new Error('Unsafe frozen fixture');
    await mkdir(path.dirname(path.join(workspace,file)),{recursive:true});
    await writeFile(path.join(workspace,file),content,{flag:'wx',mode:0o644});
  }
  const options={env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:5000,maxBuffer:4096};
  await exec('/usr/bin/git',['-C',workspace,'init','--quiet'],options);
  await exec('/usr/bin/git',['-C',workspace,'add','--',...Object.keys(files)],options);
  await exec('/usr/bin/git',['-C',workspace,'-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--quiet','-m','Frozen seed'],options);
  return workspace;
}

export function createProducerRuntime(options) {
  const {scenario,suite,actions}=options;
  return async request=>{
    const {tool,...args}=request;
    if (tool==='skill.select') return actions.selectSkill(args);
    if (tool==='refinement.skip') return actions.skipRefinement(args);
    if (tool==='interaction.approval') return actions.requestApproval(args);
    if (tool==='interaction.scope') return actions.changeScope(args);
    return runSandboxedTool({...options,request,
      readPaths:Object.keys(suite.fixtureTemplates[scenario.fixture.template].files),
      writePaths:scenario.oracle.rubric.map(rule=>rule.artifact)});
  };
}

/** Durable bytes for the trusted workflow to attest; this function itself grants no evidence authority. */
export const INFRASTRUCTURE_CHECKS=Object.freeze(['isolation','tool-runtime','security','full-suite','coverage','producer-contract']);

export async function sealCapture({result,scenario,targetScenario=scenario,runnerRevision,sourceSha,model,plannedModelIdentity=model,runId,runAttempt,pullRequest,imageId,imageApproval,directory}) {
  validateBinding({runnerRevision,sourceSha,model,runId,runAttempt,pullRequest});
  const image=requireToolImage(imageApproval,imageId);
  const traceBytes=await readFile(result.capturedTrace.tracePath);
  if (digest(traceBytes)!==result.capturedTrace.traceSha256) throw new Error('Capture bytes changed before sealing');
  const trace=JSON.parse(traceBytes);
  if (trace.sourceSha!==sourceSha || trace.scenarioId!==scenario.id || trace.modelIdentity!==model) throw new Error('Capture identity mismatch');
  const saved=JSON.parse(await readFile(result.evidencePath));
  const artifacts=[];
  for (const snapshot of saved.snapshots) {
    const bytes=await readFile(snapshot.file);
    if (digest(bytes)!==snapshot.sha256) throw new Error('Artifact changed before sealing');
    artifacts.push({path:snapshot.path,sha256:snapshot.sha256,content:bytes.toString('utf8')});
  }
  const artifactBytes=Buffer.from(JSON.stringify(artifacts,null,2)+'\n');
  const live=trace.execution.kind==='responses-live' && trace.responses.length>0 &&
    trace.responses.every(response=>response.origin==='responses-live') && image.kind==='github-attested-image';
  const envelope={schemaVersion:2,purpose:live?'behavioral-live-capture':'infrastructure-contract',behavioralStatus:'BLOCKED',
    runnerRevision,sourceSha,scenarioId:targetScenario.id,scenarioSha256:digest(JSON.stringify(targetScenario)),modelIdentity:model,
    captureScenarioId:scenario.id,plannedModelIdentity,checks:live?[]:[...INFRASTRUCTURE_CHECKS],
    runId:String(runId),runAttempt,pullRequest,responseIds:trace.responses.map(response=>response.id),
    traceSha256:digest(traceBytes),artifactSha256:digest(artifactBytes),image,
    execution:trace.execution,coverageSha256:digest(JSON.stringify(trace.coverage)),
    interactionSha256:digest(JSON.stringify(trace.interactions)),receiptSha256:digest(JSON.stringify(trace.receipts)),
    captureComplete:trace.complete && trace.coverage.complete && result.status!=='BLOCKED'};
  for (const [name,bytes] of [['trace.json',traceBytes],['artifacts.json',artifactBytes],['evidence.json',JSON.stringify(envelope,null,2)+'\n']]) {
    await writeFile(path.join(directory,name),bytes,{flag:'wx',mode:0o600});
  }
  return envelope;
}
