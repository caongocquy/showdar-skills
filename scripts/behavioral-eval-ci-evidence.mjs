import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function createCiEvidence(event, outputDir) {
  const run=event?.workflow_run;
  const pr=run?.pull_requests?.length===1 ? run.pull_requests[0] : null;
  if (!run || run.conclusion!=='success' || run.event!=='pull_request' ||
      run.name!=='Verify PR' || run.path?.split('@')[0]!=='.github/workflows/verify-pr.yml' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha ?? '') || pr?.head?.sha!==run.head_sha ||
      !Number.isSafeInteger(run.id) || !Number.isSafeInteger(pr?.number) ||
      event.repository?.full_name !== process.env.GITHUB_REPOSITORY) {
    throw new Error('Untrusted or incomplete verify-pr workflow run');
  }
  const payload={schemaVersion:1,scenarioId:'TASK-002-CI',sourceSha:run.head_sha,workflowRunId:String(run.id),
    pullRequest:pr.number,modelIdentity:'none (model-free CI)',behavioralStatus:'BLOCKED',
    evidence:'CI test completion only; no model execution, activity trace or behavioral grade'};
  const payloadBytes=Buffer.from(JSON.stringify(payload,null,2)+'\n');
  const evidence={...payload,artifactSha256:hash(payloadBytes)};
  await mkdir(outputDir,{recursive:true});
  await Promise.all([
    writeFile(path.join(outputDir,'payload.json'),payloadBytes,{flag:'wx',mode:0o600}),
    writeFile(path.join(outputDir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600}),
  ]);
  return {payload,evidence};
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  const event=JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  await createCiEvidence(event,path.resolve('.behavioral-evidence'));
}
