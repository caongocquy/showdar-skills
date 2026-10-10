import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { analyzeRecordedTrace } from './trace-grader.mjs';

const exec = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blocked = reason => ({status:'BLOCKED',reason});
const json = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SIGNER = 'caongocquy/showdar-skills/.github/workflows/behavioral-evidence-attestation.yml';

export function assertEvidenceBinding(evidence, expected, artifactBytes, traceBytes) {
  if (!json(evidence) || evidence.schemaVersion !== 1 ||
      !/^[a-f0-9]{40}$/.test(evidence.sourceSha ?? '') ||
      !/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? '') || !/^[a-f0-9]{64}$/.test(evidence.traceSha256 ?? '') ||
      !/^\d+$/.test(String(evidence.workflowRunId ?? '')) ||
      !Number.isSafeInteger(evidence.workflowRunAttempt) || evidence.workflowRunAttempt < 1 ||
      !/^\d+$/.test(String(evidence.attesterRunId ?? '')) ||
      !Number.isSafeInteger(evidence.attesterRunAttempt) || evidence.attesterRunAttempt < 1 ||
      !/^[a-f0-9]{40}$/.test(evidence.attesterSourceSha ?? '') ||
      typeof evidence.scenarioId !== 'string' || typeof evidence.modelIdentity !== 'string' ||
      evidence.behavioralStatus!=='READY_FOR_REVIEW' || evidence.execution?.kind!=='responses-live' ||
      evidence.execution?.agentLaunched!==true || !Array.isArray(evidence.requiredEvents) || !evidence.requiredEvents.length ||
      !Array.isArray(evidence.rubricIds) || !evidence.rubricIds.length) {
    throw new Error('Invalid evidence envelope');
  }
  for (const key of ['sourceSha','scenarioId','modelIdentity','workflowRunId','workflowRunAttempt',
    'attesterRunId','attesterRunAttempt','attesterSourceSha','artifactSha256','traceSha256','pullRequest']) {
    if (String(evidence[key]) !== String(expected[key])) throw new Error(`Evidence ${key} mismatch`);
  }
  if (JSON.stringify([...evidence.rubricIds].sort())!==JSON.stringify([...(expected.rubricIds ?? [])].sort()) ||
      JSON.stringify([...evidence.requiredEvents].sort())!==JSON.stringify([...(expected.requiredEvents ?? [])].sort())) {
    throw new Error('Evidence rubric or required event set mismatch');
  }
  if (!Buffer.isBuffer(artifactBytes) || sha256(artifactBytes) !== evidence.artifactSha256 ||
      !Buffer.isBuffer(traceBytes) || sha256(traceBytes)!==evidence.traceSha256) {
    throw new Error('Evidence artifact digest mismatch');
  }
  return evidence;
}

function reviewPayload(review) {
  if (typeof review?.body !== 'string' || !review.body.startsWith('SHOWDAR-RUBRIC/1\n')) return null;
  try { return JSON.parse(review.body.slice('SHOWDAR-RUBRIC/1\n'.length)); } catch { return null; }
}

async function evaluateHumanReview(reviews, {evidence, evidenceDigest, actor, captureActor, pullRequestAuthor, rubricIds,base,token}) {
  if (!Array.isArray(reviews) || !Array.isArray(rubricIds) || rubricIds.length === 0) return blocked('Human review unavailable');
  const latest = new Map();
  for (const review of reviews) if (review?.user?.login) latest.set(review.user.login.toLowerCase(), review);
  for (const review of latest.values()) {
    const login=review.user.login.toLowerCase();
    const data=reviewPayload(review);
    if (review.state !== 'APPROVED' || review.commit_id !== evidence.sourceSha || review.user.type !== 'User' ||
        ['OWNER','MEMBER','COLLABORATOR'].includes(review.author_association) === false ||
        login === String(actor).toLowerCase() || login === String(captureActor).toLowerCase() ||
        login === String(pullRequestAuthor).toLowerCase() || !data) continue;
    if (data.decision !== 'APPROVED' || data.evidenceSha256 !== evidenceDigest ||
        data.artifactSha256 !== evidence.artifactSha256 || data.traceSha256 !== evidence.traceSha256 || data.sourceSha !== evidence.sourceSha ||
        data.scenarioId !== evidence.scenarioId || data.modelIdentity !== evidence.modelIdentity ||
        String(data.workflowRunId) !== String(evidence.workflowRunId) ||
        data.workflowRunAttempt !== evidence.workflowRunAttempt ||
        String(data.attesterRunId) !== String(evidence.attesterRunId) ||
        data.attesterRunAttempt !== evidence.attesterRunAttempt || data.attesterSourceSha !== evidence.attesterSourceSha ||
        JSON.stringify(Object.keys(data.grades ?? {}).sort()) !== JSON.stringify([...rubricIds].sort()) ||
        Object.values(data.grades ?? {}).some(grade => !['PASS','FAIL'].includes(grade))) continue;
    const permission=await githubJson(`${base}/collaborators/${encodeURIComponent(review.user.login)}/permission`,token);
    if (!['admin','write'].includes(permission.permission) || permission.user?.login?.toLowerCase()!==login) continue;
    return {status:'BLOCKED',rubricStatus:Object.values(data.grades).every(grade=>grade==='PASS')?'APPROVED':'REJECTED',
      reviewer:review.user.login,reason:'Trusted live capture producer is not deployed or verified; human review cannot enable behavioral PASS'};
  }
  return blocked('No authenticated, separate human rubric approval matches this evidence');
}

async function githubJson(url, token) {
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('GitHub evidence lookup failed');
  return response.json();
}

async function githubReviews(url, token) {
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok || response.headers.get('Link')?.includes('rel="next"')) throw new Error('GitHub review history is incomplete');
  const reviews=await response.json();
  if (!Array.isArray(reviews)) throw new Error('GitHub review history is invalid');
  return reviews;
}

/** Verify local bytes, GitHub-signed workflow provenance and a separate GitHub review. */
export async function verifyTrustedEvidence({evidencePath,artifactPath,tracePath,repository,signerWorkflow,expected,token=process.env.GITHUB_TOKEN}={}) {
  try {
    if (!token || repository!=='caongocquy/showdar-skills' || signerWorkflow!==SIGNER ||
        !/^[a-f0-9]{40}$/.test(expected?.attesterSourceSha ?? '')) {
      return blocked('GitHub authentication and pinned repository/workflow are required');
    }
    const evidenceBytes=await readFile(evidencePath);
    const artifactBytes=await readFile(artifactPath);
    const traceBytes=await readFile(tracePath);
    const evidence=JSON.parse(evidenceBytes.toString('utf8'));
    const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url),'utf8'));
    const scenario=suite.scenarios.find(item=>item.id===evidence.scenarioId);
    if (!scenario) return blocked('Evidence scenario is not in the frozen suite');
    const trustedExpected={...expected,rubricIds:scenario.oracle.rubric.map(rule=>rule.id),
      requiredEvents:scenario.oracle.required.map(event=>event.id)};
    assertEvidenceBinding(evidence,trustedExpected,artifactBytes,traceBytes);
    const trace=JSON.parse(traceBytes.toString('utf8'));
    if (trace.execution?.kind !== 'responses-live' || trace.execution?.agentLaunched !== true ||
        trace.modelIdentity!==evidence.modelIdentity ||
        trace.events?.some(event=>event.evidence!=='host-runner') ||
        trace.responses?.length < 1 || !Array.isArray(trace.responses) ||
        trace.responses.some(response=>response.origin!=='responses-live')) return blocked('Simulated or unauthenticated capture cannot be graded');
    if (analyzeRecordedTrace(scenario,trace,{sourceSha:evidence.sourceSha}).status!=='MATCH') {
      return blocked('Runner-captured scenario events are incomplete or do not match the frozen oracle');
    }
    const digest=sha256(evidenceBytes);
    for (const [file,bytes] of [[evidencePath,evidenceBytes],[artifactPath,artifactBytes],[tracePath,traceBytes]]) {
      const result=await exec('gh',['attestation','verify',file,'--repo',repository,
        '--signer-workflow',signerWorkflow,'--source-ref','refs/heads/main',
        '--source-digest',expected.attesterSourceSha,'--signer-digest',expected.attesterSourceSha,
        '--deny-self-hosted-runners','--format','json'],{
        env:{PATH:process.env.PATH ?? '/usr/bin:/bin',GH_TOKEN:token},timeout:30000,maxBuffer:1024*1024,
      });
      const attestations=JSON.parse(result.stdout);
      const invocation=`https://github.com/${repository}/actions/runs/${evidence.attesterRunId}/attempts/${evidence.attesterRunAttempt}`;
      const signed=bytes.length>0 && Array.isArray(attestations) && attestations.some(item=>{
        const verified=item?.verificationResult;
        return verified?.statement?.subject?.some(subject=>subject?.digest?.sha256===sha256(bytes)) &&
          verified.statement.predicate?.runDetails?.metadata?.invocationId===invocation &&
          verified.signature?.certificate?.runInvocationURI===invocation;
      });
      if (!signed) return blocked('GitHub attestation does not bind these bytes to the exact capture run/attempt');
    }
    const base=`https://api.github.com/repos/${repository}`;
    const [run,captureRun,pull,reviews]=await Promise.all([
      githubJson(`${base}/actions/runs/${encodeURIComponent(evidence.workflowRunId)}`,token),
      githubJson(`${base}/actions/runs/${encodeURIComponent(evidence.attesterRunId)}`,token),
      githubJson(`${base}/pulls/${encodeURIComponent(evidence.pullRequest)}`,token),
      githubReviews(`${base}/pulls/${encodeURIComponent(evidence.pullRequest)}/reviews?per_page=100`,token),
    ]);
    if (String(run.id)!==String(evidence.workflowRunId) || run.head_sha!==evidence.sourceSha ||
        run.run_attempt!==evidence.workflowRunAttempt || captureRun.run_attempt!==evidence.attesterRunAttempt ||
        String(captureRun.id)!==String(evidence.attesterRunId) || captureRun.head_sha!==evidence.attesterSourceSha ||
        captureRun.head_branch!=='main' || captureRun.event!=='workflow_run' || captureRun.conclusion!=='success' ||
        captureRun.path?.split('@')[0]!=='.github/workflows/behavioral-evidence-attestation.yml' ||
        captureRun.repository?.full_name!==repository || !captureRun.actor?.login ||
        run.repository?.full_name!==repository || run.head_repository?.full_name!==repository ||
        pull.head?.repo?.full_name!==repository || pull.base?.repo?.full_name!==repository ||
        pull.base?.ref!=='main' || pull.state!=='open' || run.pull_requests?.length!==1 ||
        run.conclusion!=='success' || run.event!=='pull_request' || run.path?.split('@')[0]!=='.github/workflows/verify-pr.yml' ||
        !run.pull_requests?.some(item=>String(item.number)===String(evidence.pullRequest)&&item.head?.sha===evidence.sourceSha) ||
        pull.head?.sha!==evidence.sourceSha || String(pull.number)!==String(evidence.pullRequest) ||
        !run.actor?.login || !pull.user?.login) {
      return blocked('Workflow run or pull request does not match the evidence source');
    }
    return await evaluateHumanReview(reviews,{evidence,evidenceDigest:digest,actor:run.actor?.login,base,token,
      captureActor:captureRun.actor.login,
      pullRequestAuthor:pull.user?.login,rubricIds:trustedExpected.rubricIds});
  } catch(error) {
    return blocked(String(error?.message ?? 'Evidence verification failed').slice(0,240));
  }
}
