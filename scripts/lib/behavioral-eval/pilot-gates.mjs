import { readFile } from 'node:fs/promises';
import { digest, readEvidence, verifySignedFiles, githubJson } from './github-provenance.mjs';
import { verifyImageBuild } from './tool-image-provenance.mjs';
import { INTERACTION_CHANNELS } from './runner-capture.mjs';
import { analyzeRecordedTrace } from './trace-grader.mjs';
import { INFRASTRUCTURE_CHECKS } from './live-producer.mjs';
import {verifyPaidCaptureEvidence} from './paid-authorization.mjs';

const blocked=reason=>({prePilot:'NO-GO',behavioral:'BLOCKED',reason});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Structural policy has no authority by itself. The public gate verifier authenticates every input first. */
export function assertCaptureBundle(evidence,trace,artifacts,expected,scenario) {
  if (evidence.schemaVersion!==2 || evidence.behavioralStatus!=='BLOCKED' || !evidence.captureComplete ||
      !['infrastructure-contract','behavioral-live-capture'].includes(evidence.purpose) ||
      ![evidence.runnerRevision,evidence.sourceSha].every(value=>/^[a-f0-9]{40}$/.test(value ?? '')) ||
      ![evidence.scenarioSha256,evidence.traceSha256,evidence.artifactSha256,evidence.coverageSha256,evidence.interactionSha256,evidence.receiptSha256].every(value=>/^[a-f0-9]{64}$/.test(value ?? '')) ||
      !/^[1-9]\d*$/.test(String(evidence.runId)) || !Number.isSafeInteger(evidence.runAttempt) || evidence.runAttempt<1 ||
      !Number.isSafeInteger(evidence.pullRequest) || evidence.pullRequest<1 ||
      typeof evidence.plannedModelIdentity!=='string' || !evidence.plannedModelIdentity.trim()) throw new Error('Incomplete or invalid capture envelope');
  for (const key of ['runnerRevision','sourceSha','scenarioId','scenarioSha256','modelIdentity','plannedModelIdentity','runId','runAttempt','pullRequest',
    'traceSha256','artifactSha256','coverageSha256','interactionSha256','receiptSha256']) {
    if (String(evidence[key])!==String(expected[key])) throw new Error(`Capture ${key} mismatch`);
  }
  if (evidence.scenarioId!==scenario.id || evidence.scenarioSha256!==digest(JSON.stringify(scenario)) ||
      trace.sourceSha!==evidence.sourceSha || trace.scenarioId!==evidence.captureScenarioId || trace.modelIdentity!==evidence.modelIdentity ||
      trace.complete!==true || !same(trace.execution,evidence.execution) ||
      !same(evidence.responseIds,trace.responses?.map(response=>response.id)) || !trace.responses?.length ||
      !trace.coverage?.complete || !same(trace.coverage.channels,INTERACTION_CHANNELS) || trace.coverage.issues?.length!==0 ||
      digest(JSON.stringify(trace.coverage))!==evidence.coverageSha256 ||
      digest(JSON.stringify(trace.interactions))!==evidence.interactionSha256 ||
      digest(JSON.stringify(trace.receipts))!==evidence.receiptSha256) throw new Error('Incomplete observation or capture identity mismatch');
  if (!Array.isArray(trace.interactions) || trace.interactions.some((item,i)=>item.id!==`interaction-${i}` ||
      !INTERACTION_CHANNELS.includes(item.channel) || !Number.isSafeInteger(item.sequence) || item.sequence<0 || item.sequence>trace.events.length ||
      item.sha256!==digest(JSON.stringify(item.payload)))) throw new Error('Invalid interaction integrity or coverage');
  if (!Array.isArray(trace.receipts) || trace.receipts.some(item=>item.sha256!==digest(JSON.stringify(item.receipt)))) throw new Error('Receipt integrity mismatch');
  const receipts=new Map(trace.receipts.map(item=>[item.sha256,item.receipt]));
  if (receipts.size!==trace.receipts.length || new Set(trace.responses.map(response=>response.id)).size!==trace.responses.length ||
      trace.events.some((event,i)=>event.sequence!==i)) throw new Error('Receipt, response or event sequence replay');
  for (const [i,item] of trace.interactions.entries()) {
    if (item.channel!=='tool-arguments') continue;
    const output=trace.interactions[i+1];
    if (output?.channel!=='tool-results' || !trace.receipts.some(proof=>proof.receipt.requestSha256===digest(JSON.stringify(item.payload)) &&
        proof.receipt.resultSha256===digest(JSON.stringify(output.payload)))) throw new Error('Tool interaction receipt mismatch');
  }
  for (const response of trace.responses) {
    const receipt=receipts.get(response.transportReceiptSha256);
    if (!receipt || receipt.kind!=='responses-transport-observation' ||
        ![receipt.requestSha256,receipt.resultSha256].every(value=>/^[a-f0-9]{64}$/.test(value ?? '')) ||
        response.outputSha256!==digest(JSON.stringify(response.output)) || receipt.responseId!==response.id ||
        receipt.requestId!==response.requestId || receipt.modelIdentity!==evidence.modelIdentity || receipt.origin!==response.origin) throw new Error('Response identity or receipt mismatch');
  }
  for (const event of trace.events) {
    const receipt=receipts.get(event.receiptSha256);
    if (event.receiptSha256 && (!receipt || receipt.sourceSha!==evidence.sourceSha)) throw new Error('Event receipt source mismatch');
    if (!['host-tool-runtime','host-scenario-runtime'].includes(event.evidence)) throw new Error('Unobserved or simulated semantic event');
    if (event.evidence==='host-tool-runtime' && (event.kind==='tool_invoked' && receipt?.tool!==event.attributes?.tool ||
        !['tool_invoked','file_written','verification_observed'].includes(event.kind) ||
        event.kind==='verification_observed' && (receipt?.tool!=='git.diff-check' || event.attributes.command!=='git diff --check' || !Number.isInteger(event.attributes.exitCode)))) throw new Error('Tool event receipt mismatch');
    if (event.evidence==='host-scenario-runtime' && event.kind!=='file_written' && !same(receipt?.event,{kind:event.kind,attributes:event.attributes})) throw new Error('Semantic event receipt mismatch');
    if (event.kind==='file_written' && !trace.receipts.some(item=>item.receipt.artifact?.sha256===event.artifactSha256 &&
        item.receipt.artifact.path===event.attributes?.path)) throw new Error('Artifact event receipt mismatch');
  }
  if (!Array.isArray(artifacts) || artifacts.some(item=>item.sha256!==digest(item.content)) ||
      scenario.oracle.rubric.some(rule=>!artifacts.some(item=>item.path===rule.artifact))) throw new Error('Missing rubric artifact or artifact integrity mismatch');
  for (const artifact of artifacts) {
    if (!trace.receipts.some(item=>item.receipt.artifact?.path===artifact.path && item.receipt.artifact.sha256===artifact.sha256)) throw new Error('Artifact lacks a host-owned receipt');
  }
  const imageReceipts=trace.receipts.flatMap(item=>item.receipt.toolReceipt?[item.receipt.toolReceipt]:[item.receipt])
    .filter(receipt=>receipt.kind==='sandbox-tool-observation');
  if (!imageReceipts.length || imageReceipts.some(receipt=>receipt.imageId!==evidence.image.imageId ||
      !same(receipt.imageProvenance,evidence.image))) throw new Error('Tool image provenance mismatch');
  if (evidence.purpose==='behavioral-live-capture' && (evidence.execution.kind!=='responses-live' || evidence.execution.agentLaunched!==true ||
      evidence.captureScenarioId!==scenario.id || trace.responses.some(response=>response.origin!=='responses-live' || !response.id || !response.requestId))) throw new Error('Simulated model origin cannot produce behavioral evidence');
  if (evidence.purpose==='behavioral-live-capture') {
    const proof=evidence.paidAuthorization,binding=proof?.binding;
    if (!binding || evidence.authorizationSha256!==digest(JSON.stringify(proof)) || proof.bindingSha256!==digest(JSON.stringify(binding)) ||
        ['runnerRevision','sourceSha','scenarioId','modelIdentity','runId','runAttempt','pullRequest'].some(key=>String(binding[key])!==String(evidence[key])) ||
        binding.readiness?.scenarioSha256!==evidence.scenarioSha256 || !same(binding.image,evidence.image)) throw new Error('Missing or mismatched paid authorization evidence');
  }
  if (evidence.purpose==='infrastructure-contract' && (evidence.captureScenarioId!=='PRODUCER-CONTRACT' ||
      evidence.execution.kind!=='simulated' || !same(evidence.checks,INFRASTRUCTURE_CHECKS))) throw new Error('Incomplete infrastructure acceptance');
}

/** A reviewer must classify every record, including text and artifact bytes, before absence is meaningful. */
export function validateHumanRubric(review,{evidence,evidenceSha256,trace,scenario,excludedActors}) {
  const login=review?.user?.login?.toLowerCase();
  if (!login || excludedActors.some(actor=>String(actor).toLowerCase()===login) ||
      review.user.type!=='User' || review.state!=='APPROVED' || review.commit_id!==evidence.sourceSha ||
      !['OWNER','MEMBER','COLLABORATOR'].includes(review.author_association) ||
      !review.body?.startsWith('SHOWDAR-RUBRIC/2\n')) throw new Error('Separate authenticated human approval required');
  const data=JSON.parse(review.body.slice('SHOWDAR-RUBRIC/2\n'.length));
  if (data.evidenceSha256!==evidenceSha256 || data.decision!=='APPROVED') throw new Error('Review evidence digest mismatch');
  for (const key of ['runnerRevision','sourceSha','scenarioId','scenarioSha256','modelIdentity','plannedModelIdentity','runId','runAttempt','pullRequest',
    'artifactSha256','traceSha256','interactionSha256','coverageSha256','receiptSha256']) {
    if (String(data[key])!==String(evidence[key])) throw new Error(`Review ${key} mismatch`);
  }
  if (!same(data.image,evidence.image) || !same(data.responseIds,evidence.responseIds) ||
      !same(Object.keys(data.grades ?? {}).sort(),scenario.oracle.rubric.map(rule=>rule.id).sort()) ||
      Object.values(data.grades).some(grade=>!['PASS','FAIL'].includes(grade)) ||
      !Array.isArray(data.interactions) || data.interactions.length!==trace.interactions.length) throw new Error('Incomplete human rubric or channel review');
  const classified=[];
  for (const [i,record] of trace.interactions.entries()) {
    const approval=data.interactions[i];
    if (approval.id!==record.id || approval.sha256!==record.sha256 || !Array.isArray(approval.events)) throw new Error('Missing or mismatched channel classification');
    for (const event of approval.events) {
      if (!scenario.oracle.forbidden.some(pattern=>pattern.kind===event.kind && same(pattern.attributes,event.attributes))) throw new Error('Invalid human event classification');
      classified.push({...event,evidence:'independent-human-review',sequence:record.sequence});
    }
  }
  return {reviewer:review.user.login,grades:data.grades,classified};
}

/** Verify actual GitHub signatures and approved image build independently before considering any rubric. */
export async function verifyPilotGates({evidencePath,tracePath,artifactPath,imageManifestPath,imageArchivePath,imageBundlePath,captureBundlePath,expected,token}) {
  try {
    const [{bytes:evidenceBytes,value:evidence},{bytes:traceBytes,value:trace},{bytes:artifactBytes,value:artifacts}]=await Promise.all([
      readEvidence(evidencePath),readEvidence(tracePath),readEvidence(artifactPath)]);
    if (digest(evidenceBytes)!==expected?.evidenceSha256 || digest(traceBytes)!==expected.traceSha256 ||
        digest(artifactBytes)!==expected.artifactSha256) throw new Error('Capture artifact integrity mismatch');
    const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url)));
    const scenario=suite.scenarios.find(item=>item.id===evidence.scenarioId);
    if (!scenario || scenario.id!=='BRAIN-001') throw new Error('Unapproved pilot scenario');
    assertCaptureBundle(evidence,trace,artifacts,expected,scenario);
    if (!same(evidence.image,expected.image) || evidence.image.kind!=='github-attested-image') throw new Error('Unapproved image identity');
    const image=await verifyImageBuild({manifestPath:imageManifestPath,archivePath:imageArchivePath,expected:expected.image,token,bundlePath:imageBundlePath});
    if (!same(evidence.image,{kind:'github-attested-image',...image,manifestSha256:expected.image.manifestSha256})) throw new Error('Image build receipt mismatch');
    const captureRun=await verifySignedFiles([
      {file:evidencePath,sha256:expected.evidenceSha256},{file:tracePath,sha256:expected.traceSha256},{file:artifactPath,sha256:expected.artifactSha256}],
      {workflow:'behavioral-live-capture.yml',runnerRevision:evidence.runnerRevision,runId:evidence.runId,runAttempt:evidence.runAttempt},token,captureBundlePath);
    const pull=await githubJson(`/pulls/${evidence.pullRequest}`,token);
    if (pull.state!=='open' || pull.base?.ref!=='main' || pull.base.repo?.full_name!=='caongocquy/showdar-skills' ||
        pull.head?.repo?.full_name!=='caongocquy/showdar-skills' || pull.head.sha!==evidence.sourceSha || !pull.user?.login) throw new Error('Forked or stale source evidence');
    // An infrastructure contract must be signed by the fixed trusted producer after all its required jobs pass.
    const infrastructure={prePilot:'GO',behavioral:'BLOCKED',reason:'Infrastructure verified; one paid capture still requires separate explicit authorization'};
    if (evidence.purpose!=='behavioral-live-capture') return infrastructure;
    await verifyPaidCaptureEvidence(evidence.paidAuthorization,captureRun,token);
    const reviews=await githubJson(`/pulls/${evidence.pullRequest}/reviews?per_page=100`,token);
    if (!Array.isArray(reviews)) throw new Error('Human review unavailable');
    const latest=new Map();
    for (const review of reviews) if (review.user?.login) latest.set(review.user.login.toLowerCase(),review);
    for (const review of latest.values()) {
      let rubric;
      try {rubric=validateHumanRubric(review,{evidence,evidenceSha256:expected.evidenceSha256,trace,scenario,
        excludedActors:[captureRun.actor.login,pull.user.login]});} catch {continue;}
      const permission=await githubJson(`/collaborators/${rubric.reviewer}/permission`,token);
      if (!['write','admin'].includes(permission.permission) || permission.user?.login?.toLowerCase()!==rubric.reviewer.toLowerCase()) continue;
      const events=[...trace.events,...rubric.classified].sort((a,b)=>(a.sequence ?? 0)-(b.sequence ?? 0));
      const analysis=analyzeRecordedTrace(scenario,{...trace,events},{sourceSha:evidence.sourceSha});
      return {...infrastructure,behavioral:analysis.status==='MATCH' && Object.values(rubric.grades).every(grade=>grade==='PASS')?'PASS':'FAIL',
        reviewer:rubric.reviewer,analysis,reason:'Signed live evidence independently verified and separately reviewed'};
    }
    return {...infrastructure,reason:'No complete separate human review matches the verified live evidence'};
  } catch(error) {return blocked(String(error.message).slice(0,240));}
}
