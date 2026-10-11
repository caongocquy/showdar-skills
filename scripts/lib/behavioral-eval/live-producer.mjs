import { readFile, writeFile, mkdir, mkdtemp, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { digest } from './github-provenance.mjs';
import { requireToolImage } from './tool-image-provenance.mjs';
import { assertSourceRevision, runSandboxedTool } from './sandbox-tool-runtime.mjs';
import { createScenarioActions } from './scenario-actions.mjs';
import { createLiveResponsesTransport, assertLiveTransportEnabled } from './responses-transport.mjs';
import { runCapturedResponses } from './responses-runner.mjs';
import {reservePaidCaptureAuthorization,getPaidCaptureAuthorization,PAID_BUDGET} from './paid-authorization.mjs';
export {createPaidCaptureBinding,assertPaidCaptureApproval,verifyPaidCaptureAuthorization,reservePaidCaptureAuthorization} from './paid-authorization.mjs';
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
  requireToolImage(options.imageApproval,options.imageId,{live:true});
  const {verifyPilotGates}=await import('./pilot-gates.mjs');
  const readiness=await verifyPilotGates({...options.prePilotEvidence,token:options.token});
  if (readiness.prePilot!=='GO') throw new Error('Verified PRE-PILOT evidence required');
  const authorization=await reservePaidCaptureAuthorization({runnerRevision:options.runnerRevision,sourceSha:options.sourceSha,scenarioId:options.scenarioId,
    model:options.model,runId:options.runId,runAttempt:options.runAttempt,pullRequest:options.pullRequest,token:options.token,
    readiness:options.prePilotEvidence.expected,image:requireToolImage(options.imageApproval,options.imageId,{live:true})});
  options={...options,timeoutMs:PAID_BUDGET.timeoutMs,maxTurns:PAID_BUDGET.maxTurns};
  await assertSourceRevision(options.runnerRoot,options.runnerRevision);
  await assertSourceRevision(options.sourceRoot,options.sourceSha);
  const send=createLiveResponsesTransport({allowModel:options.allowModel===true,apiKey:options.apiKey,timeoutMs:options.timeoutMs,authorization});
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
  return sealCapture({...options,result,scenario,authorization});
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

export async function sealCapture({result,scenario,targetScenario=scenario,runnerRevision,sourceSha,model,plannedModelIdentity=model,runId,runAttempt,pullRequest,imageId,imageApproval,directory,authorization}) {
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
  const paidAuthorization=live?getPaidCaptureAuthorization(authorization):null;
  if (live && (paidAuthorization.binding.runnerRevision!==runnerRevision || paidAuthorization.binding.sourceSha!==sourceSha ||
      paidAuthorization.binding.modelIdentity!==model || paidAuthorization.binding.runId!==String(runId) || paidAuthorization.binding.runAttempt!==runAttempt ||
      paidAuthorization.binding.scenarioId!==scenario.id || paidAuthorization.binding.pullRequest!==pullRequest ||
      paidAuthorization.binding.readiness.scenarioSha256!==digest(JSON.stringify(scenario)) || JSON.stringify(paidAuthorization.binding.image)!==JSON.stringify(image))) throw new Error('Paid authorization capture binding mismatch');
  const envelope={schemaVersion:2,purpose:live?'behavioral-live-capture':'infrastructure-contract',behavioralStatus:'BLOCKED',
    runnerRevision,sourceSha,scenarioId:targetScenario.id,scenarioSha256:digest(JSON.stringify(targetScenario)),modelIdentity:model,
    captureScenarioId:scenario.id,plannedModelIdentity,checks:live?[]:[...INFRASTRUCTURE_CHECKS],
    runId:String(runId),runAttempt,pullRequest,responseIds:trace.responses.map(response=>response.id),
    traceSha256:digest(traceBytes),artifactSha256:digest(artifactBytes),image,
    execution:trace.execution,coverageSha256:digest(JSON.stringify(trace.coverage)),
    interactionSha256:digest(JSON.stringify(trace.interactions)),receiptSha256:digest(JSON.stringify(trace.receipts)),
    ...(live?{paidAuthorization,authorizationSha256:digest(JSON.stringify(paidAuthorization))}:{}),
    captureComplete:trace.complete && trace.coverage.complete && result.status!=='BLOCKED'};
  for (const [name,bytes] of [['trace.json',traceBytes],['artifacts.json',artifactBytes],['evidence.json',JSON.stringify(envelope,null,2)+'\n']]) {
    await writeFile(path.join(directory,name),bytes,{flag:'wx',mode:0o600});
  }
  return envelope;
}
