import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'caongocquy/showdar-skills';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const denied = () => { throw new Error('Untrusted or incomplete verify-pr workflow run'); };

export async function createCiEvidence(event, outputDir, {context = process.env, github = githubJson} = {}) {
  const run = event?.workflow_run;
  const pr = run?.pull_requests?.length === 1 ? run.pull_requests[0] : null;
  if (context.GITHUB_REPOSITORY !== REPOSITORY || event.repository?.full_name !== REPOSITORY ||
      event.repository?.default_branch !== 'main' || context.GITHUB_EVENT_NAME !== 'workflow_run' ||
      context.GITHUB_REF !== 'refs/heads/main' || !sha(context.GITHUB_SHA) ||
      !positive(context.GITHUB_RUN_ID) || !positive(context.GITHUB_RUN_ATTEMPT) ||
      run?.conclusion !== 'success' || run.event !== 'pull_request' || run.name !== 'Verify PR' ||
      run.path?.split('@')[0] !== '.github/workflows/verify-pr.yml' ||
      run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY ||
      !sha(run.head_sha) || pr?.head?.sha !== run.head_sha ||
      !positive(run.id) || !positive(run.run_attempt) || !positive(pr?.number)) denied();
  // The webhook is only a hint. Read authenticated current metadata before minting any evidence.
  const [current, pull, workflow] = await Promise.all([
    github(`actions/runs/${run.id}`, context.GITHUB_TOKEN),
    github(`pulls/${pr.number}`, context.GITHUB_TOKEN),
    github('actions/workflows/verify-pr.yml', context.GITHUB_TOKEN),
  ]);
  if (current.id !== run.id || current.run_attempt !== run.run_attempt ||
      current.workflow_id !== workflow.id || workflow.path !== '.github/workflows/verify-pr.yml' ||
      current.conclusion !== 'success' || current.event !== 'pull_request' || current.head_sha !== run.head_sha ||
      current.repository?.full_name !== REPOSITORY || current.head_repository?.full_name !== REPOSITORY ||
      current.pull_requests?.length !== 1 || current.pull_requests[0].number !== pr.number ||
      current.pull_requests[0].head?.sha !== run.head_sha || pull.number !== pr.number || pull.state !== 'open' ||
      pull.head?.sha !== run.head_sha || pull.head?.repo?.full_name !== REPOSITORY ||
      pull.base?.repo?.full_name !== REPOSITORY || pull.base?.ref !== 'main') denied();
  const payload = {schemaVersion:1, scenarioId:'TASK-002-CI', sourceSha:run.head_sha,
    workflowRunId:String(run.id), workflowRunAttempt:run.run_attempt, pullRequest:pr.number,
    attesterRunId:String(context.GITHUB_RUN_ID), attesterRunAttempt:Number(context.GITHUB_RUN_ATTEMPT),
    attesterSourceSha:context.GITHUB_SHA, modelIdentity:'none (model-free CI)', behavioralStatus:'BLOCKED',
    evidence:'CI test completion only; no model execution, activity trace or behavioral grade'};
  const payloadBytes = Buffer.from(JSON.stringify(payload,null,2)+'\n');
  const evidence = {...payload, artifactSha256:hash(payloadBytes)};
  await mkdir(outputDir,{recursive:true});
  await writeFile(path.join(outputDir,'payload.json'),payloadBytes,{flag:'wx',mode:0o600});
  await writeFile(path.join(outputDir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  return {payload,evidence};
}

async function githubJson(resource, token) {
  if (!token) denied();
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${resource}`, {
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    redirect:'error', signal:AbortSignal.timeout(15000),
  });
  if (!response.ok) denied();
  return response.json();
}

export async function verifyCiEnvelope(outputDir, context = process.env) {
  const payloadBytes = await readFile(path.join(outputDir,'payload.json'));
  const payload = JSON.parse(payloadBytes);
  const evidence = JSON.parse(await readFile(path.join(outputDir,'evidence.json')));
  const {artifactSha256, ...boundPayload} = evidence;
  if (hash(payloadBytes) !== artifactSha256 || JSON.stringify(payload) !== JSON.stringify(boundPayload) ||
      payload.behavioralStatus !== 'BLOCKED' || payload.scenarioId !== 'TASK-002-CI' ||
      payload.modelIdentity !== 'none (model-free CI)' || payload.attesterSourceSha !== context.GITHUB_SHA ||
      payload.attesterRunId !== context.GITHUB_RUN_ID || payload.attesterRunAttempt !== Number(context.GITHUB_RUN_ATTEMPT) ||
      payload.workflowRunId !== String(context.TRIGGER_RUN_ID) ||
      payload.workflowRunAttempt !== Number(context.TRIGGER_RUN_ATTEMPT)) denied();
  return {status:'VERIFIED_CI_ONLY',behavioralStatus:'BLOCKED'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') console.log(JSON.stringify(await verifyCiEnvelope('.behavioral-evidence')));
  else await createCiEvidence(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')),'.behavioral-evidence');
}
