import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {digest,githubJson,REPOSITORY} from './github-provenance.mjs';
export const PAID_ENVIRONMENT='showdar-paid-capture';
export const PAID_BUDGET=Object.freeze({timeoutMs:120000,maxTurns:8,maxOutputTokens:2048});
const owner={login:'caongocquy',id:50620260,type:'User'};
const capabilities=new WeakMap();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=value=>/^[a-f0-9]{64}$/.test(value ?? '');

export function createPaidCaptureBinding(options,environment) {
  const {runnerRevision,sourceSha,scenarioId,model,runId,runAttempt,pullRequest,readiness,image}=options;
  if (![runnerRevision,sourceSha].every(value=>/^[a-f0-9]{40}$/.test(value ?? '')) ||
      !/^[1-9]\d*$/.test(String(runId)) || runAttempt!==1 || scenarioId!=='BRAIN-001' || model!=='gpt-6-luna' ||
      !Number.isSafeInteger(pullRequest) || pullRequest<1 || !Number.isSafeInteger(environment?.id) || environment.id<1 ||
      environment.name!==PAID_ENVIRONMENT || image?.kind!=='github-attested-image' || !/^sha256:[a-f0-9]{64}$/.test(image.imageId ?? '') ||
      ![image.archiveSha256,image.manifestSha256].every(sha)) throw new Error('Invalid paid capture identity; fresh run attempt 1 required');
  if (!readiness || readiness.runnerRevision!==runnerRevision || readiness.sourceSha!==sourceSha || readiness.scenarioId!==scenarioId ||
      readiness.plannedModelIdentity!==model || readiness.modelIdentity!==model || readiness.pullRequest!==pullRequest ||
      !same(readiness.image,image) || !/^[1-9]\d*$/.test(String(readiness.runId)) || String(readiness.runId)===String(runId) ||
      !Number.isSafeInteger(readiness.runAttempt) || readiness.runAttempt<1 ||
      ![readiness.evidenceSha256,readiness.traceSha256,readiness.artifactSha256,readiness.scenarioSha256].every(sha)) throw new Error('Readiness does not authorize this capture identity');
  return {schemaVersion:2,environment:{id:environment.id,name:PAID_ENVIRONMENT},runnerRevision,sourceSha,scenarioId,
    modelIdentity:model,runId:String(runId),runAttempt,pullRequest,image:structuredClone(image),readiness:structuredClone(readiness),budget:{...PAID_BUDGET}};
}

export function assertPaidEnvironment(environment,policies) {
  const rules=environment?.protection_rules?.filter(rule=>rule.type==='required_reviewers');
  const reviewer=rules?.[0]?.reviewers?.[0];
  if (environment?.name!==PAID_ENVIRONMENT || !Number.isSafeInteger(environment.id) || environment.id<1 ||
      environment.can_admins_bypass!==false || rules?.length!==1 || rules[0].prevent_self_review!==false ||
      rules[0].reviewers?.length!==1 || reviewer.type!=='User' || !same({login:reviewer.reviewer?.login,id:reviewer.reviewer?.id,type:reviewer.reviewer?.type},owner) ||
      environment.deployment_branch_policy?.protected_branches!==false || environment.deployment_branch_policy?.custom_branch_policies!==true ||
      policies?.total_count!==1 || policies.branch_policies?.length!==1 || policies.branch_policies[0].name!=='main' || policies.branch_policies[0].type!=='branch') {
    throw new Error('Missing or weakened owner environment protection');
  }
}

export function assertPaidCaptureApproval({environment,policies,run,approvals},binding,{completed=false}={}) {
  assertPaidEnvironment(environment,policies);
  const canonical=createPaidCaptureBinding({runnerRevision:binding.runnerRevision,sourceSha:binding.sourceSha,scenarioId:binding.scenarioId,
    model:binding.modelIdentity,runId:binding.runId,runAttempt:binding.runAttempt,pullRequest:binding.pullRequest,image:binding.image,readiness:binding.readiness},environment);
  if (!same(binding,canonical) || String(run?.id)!==binding.runId || run.run_attempt!==1 || run.head_sha!==binding.runnerRevision ||
      run.head_branch!=='main' || run.event!=='workflow_dispatch' || (completed?(run.status!=='completed' || run.conclusion!=='success'):run.status!=='in_progress') ||
      run.path?.split('@')[0]!=='.github/workflows/behavioral-live-capture.yml' || run.repository?.full_name!==REPOSITORY || run.head_repository?.full_name!==REPOSITORY) throw new Error('Untrusted active capture run or binding');
  const records=Array.isArray(approvals)?approvals.filter(item=>item.environments?.some(env=>env.id===environment.id || env.name===PAID_ENVIRONMENT)):[];
  const review=records[0];
  if (records.length!==1 || review.state!=='approved' || !same({login:review.user?.login,id:review.user?.id,type:review.user?.type},owner) ||
      review.environments?.length!==1 || review.environments[0].id!==environment.id || review.environments[0].name!==PAID_ENVIRONMENT ||
      review.comment!=='SHOWDAR-CAPTURE-AUTH/2\n'+digest(JSON.stringify(binding))) throw new Error('Missing, forged, stale or replayed owner environment approval');
}

function assertContext(options,context) {
  if (context.GITHUB_REPOSITORY!==REPOSITORY || context.GITHUB_REF!=='refs/heads/main' || context.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
      context.GITHUB_SHA!==options.runnerRevision || context.GITHUB_RUN_ID!==String(options.runId) || context.GITHUB_RUN_ATTEMPT!=='1' ||
      options.runAttempt!==1 || !path.isAbsolute(context.RUNNER_TEMP ?? '')) throw new Error('Native trusted workflow context required');
}

export async function preparePaidCaptureBinding(options,{context=process.env}={}) {
  assertContext(options,context);
  const environment=await githubJson('/environments/'+PAID_ENVIRONMENT,options.token);
  const policies=await githubJson('/environments/'+PAID_ENVIRONMENT+'/deployment-branch-policies',options.token);
  assertPaidEnvironment(environment,policies);
  return createPaidCaptureBinding(options,environment);
}

/** GitHub authenticated records confer authority; caller-supplied review JSON never does. */
export async function verifyPaidCaptureAuthorization(options,{context=process.env}={}) {
  const binding=await preparePaidCaptureBinding(options,{context});
  const run=await githubJson(`/actions/runs/${options.runId}/attempts/1`,options.token);
  const environment=await githubJson('/environments/'+PAID_ENVIRONMENT,options.token);
  const policies=await githubJson('/environments/'+PAID_ENVIRONMENT+'/deployment-branch-policies',options.token);
  const approvals=await githubJson(`/actions/runs/${options.runId}/approvals`,options.token);
  assertPaidCaptureApproval({environment,policies,run,approvals},binding);
  return {kind:'github-environment-owner-approval',binding,bindingSha256:digest(JSON.stringify(binding)),owner:{...owner}};
}

export async function reservePaidCaptureAuthorization(options) {
  const proof=await verifyPaidCaptureAuthorization(options);
  const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url)));
  const scenario=suite.scenarios.find(item=>item.id===proof.binding.scenarioId);
  if (!scenario || digest(JSON.stringify(scenario))!==proof.binding.readiness.scenarioSha256) throw new Error('Paid scenario revision mismatch');
  // A rerun is never eligible; wx consumes the approved run exactly once within its only eligible attempt.
  await writeFile(path.join(process.env.RUNNER_TEMP,`paid-capture-${proof.binding.runId}-1.json`),JSON.stringify(proof),{flag:'wx',mode:0o600});
  const capability=Object.freeze({});capabilities.set(capability,{proof,prompt:scenario.prompt,requests:0,deadline:Date.now()+PAID_BUDGET.timeoutMs});
  return capability;
}

export function getPaidCaptureAuthorization(capability) {
  const state=capabilities.get(capability);
  if (!state) throw new Error('Missing or forged paid execution capability');
  return structuredClone(state.proof);
}

export function consumePaidResponse(capability,request) {
  const state=capabilities.get(capability);
  let seed;try{seed=JSON.parse(request?.input?.[0]?.content);}catch{}
  if (!state || request?.input?.[0]?.role!=='developer' || seed?.sourceSha!==state.proof.binding.sourceSha ||
      seed?.scenarioId!==state.proof.binding.scenarioId || request.input?.[1]?.role!=='user' || request.input[1].content!==state.prompt || Date.now()>=state.deadline || state.requests>=PAID_BUDGET.maxTurns || request.model!==state.proof.binding.modelIdentity ||
      request.max_output_tokens!==PAID_BUDGET.maxOutputTokens) throw new Error('Paid authorization or execution budget denied');
  state.requests++;
  return state.deadline-Date.now();
}

export async function verifyPaidCaptureEvidence(proof,run,token) {
  if (proof?.kind!=='github-environment-owner-approval' || proof.bindingSha256!==digest(JSON.stringify(proof.binding)) || !same(proof.owner,owner)) throw new Error('Invalid paid authorization evidence');
  const environment=await githubJson('/environments/'+PAID_ENVIRONMENT,token);
  const policies=await githubJson('/environments/'+PAID_ENVIRONMENT+'/deployment-branch-policies',token);
  const approvals=await githubJson(`/actions/runs/${proof.binding.runId}/approvals`,token);
  assertPaidCaptureApproval({environment,policies,run,approvals},proof.binding,{completed:true});
}
