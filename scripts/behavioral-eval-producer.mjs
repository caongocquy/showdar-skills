import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { githubJson, assertTrustedRun, digest } from './lib/behavioral-eval/github-provenance.mjs';
import { verifyToolImage } from './lib/behavioral-eval/tool-image-provenance.mjs';
import { assertSourceRevision } from './lib/behavioral-eval/sandbox-tool-runtime.mjs';
import { createScenarioActions } from './lib/behavioral-eval/scenario-actions.mjs';
import { createProducerRuntime, createProducerFixture, sealCapture, produceLiveCapture } from './lib/behavioral-eval/live-producer.mjs';
import { createOfflineResponsesTransport, assertLiveTransportEnabled } from './lib/behavioral-eval/responses-transport.mjs';
import {preparePaidCaptureBinding,verifyPaidCaptureAuthorization} from './lib/behavioral-eval/paid-authorization.mjs';
import {verifyPilotGates} from './lib/behavioral-eval/pilot-gates.mjs';
import { runCapturedResponses } from './lib/behavioral-eval/responses-runner.mjs';

const exec=promisify(execFile);
const env=process.env;
if (env.GITHUB_REPOSITORY!=='caongocquy/showdar-skills' || env.GITHUB_REF!=='refs/heads/main' ||
    env.GITHUB_EVENT_NAME!=='workflow_dispatch' || !path.isAbsolute(env.RUNNER_TEMP ?? '')) throw new Error('Trusted main producer required');
if (process.argv[2]==='--live') assertLiveTransportEnabled(true);
const input=JSON.parse(env.PRODUCER_INPUT ?? '{}');
if (!/^[a-f0-9]{40}$/.test(input.sourceSha ?? '') || !Number.isSafeInteger(input.pullRequest) || input.pullRequest<1 ||
    typeof input.model!=='string' || !input.model.trim() || input.model.length>128 ||
    !/^sha256:[a-f0-9]{64}$/.test(input.image?.imageId ?? '') ||
    !['archiveSha256','manifestSha256'].every(key=>/^[a-f0-9]{64}$/.test(input.image[key] ?? ''))) throw new Error('Invalid pinned producer inputs');
const imageBinding={...input.image,workflow:'behavioral-tool-image.yml'};
const imageRun=await githubJson(`/actions/runs/${input.image.runId}/attempts/${input.image.runAttempt}`,env.GITHUB_TOKEN);
assertTrustedRun(imageRun,imageBinding);
const pull=await githubJson(`/pulls/${input.pullRequest}`,env.GITHUB_TOKEN);
if (pull.state!=='open' || pull.head?.sha!==input.sourceSha || pull.head?.repo?.full_name!==env.GITHUB_REPOSITORY ||
    pull.base?.repo?.full_name!==env.GITHUB_REPOSITORY || pull.base?.ref!=='main') throw new Error('Forked or stale evaluated source');
await assertSourceRevision(process.cwd(),env.GITHUB_SHA);
if (process.argv[2]==='--download-readiness') {
  const expected=JSON.parse(env.PRE_PILOT_INPUT ?? '{}');
  if (expected.runnerRevision!==env.GITHUB_SHA || expected.sourceSha!==input.sourceSha || expected.pullRequest!==input.pullRequest ||
      expected.plannedModelIdentity!==input.model || !/^[1-9]\d*$/.test(String(expected.runId)) || !Number.isSafeInteger(expected.runAttempt) || expected.runAttempt<1) throw new Error('Invalid readiness download binding');
  const readyRun=await githubJson(`/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,env.GITHUB_TOKEN);
  assertTrustedRun(readyRun,{...expected,workflow:'behavioral-live-capture.yml'});
  const home=await mkdtemp(path.join(env.RUNNER_TEMP,'gh-readiness-'));
  try {
    for(const [runId,name,directory] of [[input.image.runId,`behavioral-tool-image-${input.image.runAttempt}`,'approved-image'],
      [input.image.runId,`behavioral-tool-image-attestation-${input.image.runAttempt}`,'approved-image-bundle'],
      [expected.runId,`behavioral-producer-contract-${expected.runAttempt}`,'pre-pilot'],
      [expected.runId,`behavioral-producer-attestation-${expected.runAttempt}`,'pre-pilot-bundle']]) {
      await exec('gh',['run','download',String(runId),'--repo','caongocquy/showdar-skills','--name',name,'--dir',path.join(env.RUNNER_TEMP,directory)],
        {env:{PATH:env.PATH,GH_TOKEN:env.GITHUB_TOKEN,HOME:home,GH_CONFIG_DIR:path.join(home,'config'),XDG_STATE_HOME:path.join(home,'state')},timeout:120000,maxBuffer:65536});
    }
    await writeFile(path.join(env.RUNNER_TEMP,'pre-pilot','expected.json'),JSON.stringify(expected),{flag:'wx',mode:0o600});
  } finally {await rm(home,{recursive:true,force:true});}
} else if (process.argv[2]==='--prepare') {
  console.log('Validated trusted image build and same-repository source');
} else {
  const imageDirectory=path.join(env.RUNNER_TEMP,'approved-image');
  const imageApproval=await verifyToolImage({manifestPath:path.join(imageDirectory,'image.json'),archivePath:path.join(imageDirectory,'tool-image.tar'),
    expected:input.image,token:env.GITHUB_TOKEN});
  const root=await mkdtemp(path.join(env.RUNNER_TEMP,'producer-'));
  const sourceRoot=path.join(root,'source'),evidenceDir=path.join(root,'private-evidence'),directory=path.join(env.RUNNER_TEMP,'capture');
  await mkdir(sourceRoot);await mkdir(evidenceDir,{mode:0o700});await mkdir(directory,{mode:0o700});
  const gitOptions={env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'},timeout:30000,maxBuffer:65536};
  // Evaluated code is data only: no npm install, tests, scripts or Git hooks from this checkout.
  for (const args of [['init','--quiet'],['fetch','--depth=1','https://github.com/caongocquy/showdar-skills.git',input.sourceSha],
    ['-c','core.hooksPath=/dev/null','checkout','--detach',input.sourceSha]]) await exec('/usr/bin/git',['-C',sourceRoot,...args],gitOptions);
  await assertSourceRevision(sourceRoot,input.sourceSha);
  const options={sourceRoot,sourceSha:input.sourceSha,runnerRoot:process.cwd(),runnerRevision:env.GITHUB_SHA,
    imageId:input.image.imageId,imageApproval,evidenceDir,directory,temporaryRoot:root,
    runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),pullRequest:input.pullRequest,timeoutMs:120000,token:env.GITHUB_TOKEN};
  if (['--live','--prepare-paid','--verify-paid'].includes(process.argv[2])) {
    const prePilotDirectory=path.join(env.RUNNER_TEMP,'pre-pilot');
    const expected=JSON.parse(await readFile(path.join(prePilotDirectory,'expected.json')));
    const prePilotEvidence={evidencePath:path.join(prePilotDirectory,'evidence.json'),tracePath:path.join(prePilotDirectory,'trace.json'),
      artifactPath:path.join(prePilotDirectory,'artifacts.json'),imageManifestPath:path.join(imageDirectory,'image.json'),
      imageArchivePath:path.join(imageDirectory,'tool-image.tar'),imageBundlePath:path.join(env.RUNNER_TEMP,'approved-image-bundle','attestation.json'),
      captureBundlePath:path.join(env.RUNNER_TEMP,'pre-pilot-bundle','attestation.json'),expected};
    const readiness=await verifyPilotGates({...prePilotEvidence,token:env.GITHUB_TOKEN});
    if (readiness.prePilot!=='GO') throw new Error('Verified PRE-PILOT evidence required: '+readiness.reason);
    const bound={...options,scenarioId:'BRAIN-001',model:input.model,readiness:expected,image:expected.image};
    if (process.argv[2]==='--prepare-paid') {
      const binding=await preparePaidCaptureBinding(bound);
      const text='SHOWDAR-CAPTURE-AUTH/2\n'+digest(JSON.stringify(binding));
      if (!path.isAbsolute(env.GITHUB_STEP_SUMMARY ?? '')) throw new Error('Native approval summary required');
      await writeFile(env.GITHUB_STEP_SUMMARY,'## One paid capture authorization\n\nReview this exact binding, then paste the following comment when approving the protected Environment.\n\n```\n'+text+'\n```\n\n```json\n'+JSON.stringify(binding,null,2)+'\n```\n',{flag:'a'});
      console.log(text);
    } else if (process.argv[2]==='--verify-paid') {
      await verifyPaidCaptureAuthorization(bound);
      console.log('Owner environment authorization verified; no credential read or model execution');
    } else {
      await produceLiveCapture({...options,scenarioId:'BRAIN-001',model:input.model,allowModel:true,
        get apiKey(){return env.OPENAI_API_KEY ?? '';},prePilotEvidence});
    }
  } else if (process.argv.length!==2) throw new Error('Unknown producer mode');
  else {
    const approval='Generic contract approval. This is not BRAIN-001 execution.';
    const scenario={id:'PRODUCER-CONTRACT',prompt:'Exercise only the infrastructure contract.',installedSkills:['showdar-build'],fixture:{template:'contract'},
      oracle:{required:[],forbidden:[],order:[],rubric:[{id:'contract-proof',artifact:'artifacts/decision.json'}]}};
    const suite={fixtureTemplates:{contract:{files:{'APPROVAL.md':approval}}}};
    const workspace=await createProducerFixture(root,suite.fixtureTemplates.contract.files);
    const actions=await createScenarioActions({...options,workspace,installedSkills:scenario.installedSkills,approvalFiles:{'APPROVAL.md':digest(approval)}});
    const calls=[['skill_select',{skill:'showdar-build'}],['skip_refinement',{approvalPath:'APPROVAL.md',approvalSha256:digest(approval),rationale:'The generic contract approval defines the fixture scope.'}],
      ['approval_request',{scope:'already-approved-spec',message:'Contract test approval request'}],['scope_change',{decision:'new-requirements',message:'Contract test scope proposal'}],['git_diff_check',{}]];
    let turn=0;
    const responses=createOfflineResponsesTransport({fakeFetch:async()=>new Response(JSON.stringify({id:`resp_contract_${turn}`,model:input.model,status:'completed',
      output:turn<calls.length?[{type:'function_call',call_id:`call_${turn}`,name:calls[turn][0],arguments:JSON.stringify(calls[turn++][1])}]:
        [{type:'message',content:[{type:'output_text',text:'Generic contract complete; never a behavioral result.'}]}]}),{headers:{'x-request-id':`req_contract_${turn}`}})});
    const result=await runCapturedResponses({...options,workspace,scenario,suite,model:input.model,responses,
      runtime:createProducerRuntime({...options,workspace,scenario,suite,actions})});
    if (result.status!=='NOT_RUN') throw new Error('Producer contract failed');
    const trace=JSON.parse(await readFile(result.capturedTrace.tracePath));
    if (!trace.coverage.complete || trace.execution.kind!=='simulated' ||
        !['skill_selected','decision_recorded','approval_requested','scope_changed','verification_observed'].every(kind=>trace.events.some(event=>event.kind===kind))) throw new Error('Producer contract lacks event coverage');
    const frozen=JSON.parse(await readFile(new URL('../evals/behavioral/scenarios.json',import.meta.url)));
    await sealCapture({...options,result,scenario,targetScenario:frozen.scenarios.find(item=>item.id==='BRAIN-001'),model:input.model,plannedModelIdentity:input.model});
    await assertSourceRevision(sourceRoot,input.sourceSha);
    await assertSourceRevision(process.cwd(),env.GITHUB_SHA);
    console.log('Model-free producer contract captured; behavioral grading BLOCKED');
  }
}
