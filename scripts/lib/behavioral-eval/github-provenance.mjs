import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';

export const REPOSITORY='caongocquy/showdar-skills';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const exec=promisify(execFile);

export async function fileDigest(file) {
  const info=await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Provenance requires regular files');
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function readEvidence(file) {
  const info=await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size>1024*1024) throw new Error('Invalid evidence file');
  const bytes=await readFile(file);
  if (bytes.length>1024*1024) throw new Error('Evidence limit exceeded');
  return {bytes,value:JSON.parse(bytes)};
}

export async function githubJson(relative,token) {
  if (!token || !/^\/(actions\/runs\/\d+(\/attempts\/\d+)?|pulls\/\d+(\/reviews\?per_page=100)?|collaborators\/[A-Za-z0-9-]+\/permission)$/.test(relative)) throw new Error('Invalid authenticated GitHub lookup');
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}${relative}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    redirect:'error',signal:AbortSignal.timeout(15000),
  });
  if (!response.ok || response.headers.get('Link')?.includes('rel="next"')) throw new Error('GitHub evidence lookup unavailable or incomplete');
  const text=await response.text();
  if (Buffer.byteLength(text)>1024*1024) throw new Error('GitHub metadata limit exceeded');
  return JSON.parse(text);
}

export function assertTrustedRun(run,{workflow,runnerRevision,runId,runAttempt}) {
  if (!/^[a-f0-9]{40}$/.test(runnerRevision ?? '') || !/^[1-9]\d*$/.test(String(runId)) ||
      !Number.isSafeInteger(runAttempt) || runAttempt<1 ||
      String(run.id)!==String(runId) || run.run_attempt!==runAttempt || run.head_sha!==runnerRevision ||
      run.head_branch!=='main' || run.event!=='workflow_dispatch' || run.conclusion!=='success' ||
      run.path?.split('@')[0]!==`.github/workflows/${workflow}` ||
      run.repository?.full_name!==REPOSITORY || run.head_repository?.full_name!==REPOSITORY || !run.actor?.login) {
    throw new Error('Untrusted, forked, stale or mismatched workflow run');
  }
}

export function assertSignedSubject(attestations,sha256,{runId,runAttempt}) {
  const invocation=`https://github.com/${REPOSITORY}/actions/runs/${runId}/attempts/${runAttempt}`;
  if (!Array.isArray(attestations) || !attestations.some(item=>{
    const verified=item?.verificationResult;
    return verified?.statement?.subject?.some(subject=>subject?.digest?.sha256===sha256) &&
      verified.statement.predicate?.runDetails?.metadata?.invocationId===invocation &&
      verified.signature?.certificate?.runInvocationURI===invocation;
  })) throw new Error('Signed subject or run/attempt binding mismatch');
}

/** No injectable transport: only gh's cryptographic verification and authenticated GitHub metadata confer authority. */
export async function verifySignedFiles(files,binding,token,bundlePath) {
  const {workflow,runnerRevision,runId,runAttempt}=binding;
  if (!['behavioral-tool-image.yml','behavioral-live-capture.yml'].includes(workflow)) throw new Error('Unapproved signer workflow');
  const run=await githubJson(`/actions/runs/${runId}/attempts/${runAttempt}`,token);
  assertTrustedRun(run,binding);
  if (bundlePath) await readEvidence(bundlePath);
  for (const {file,sha256} of files) {
    if (!/^[a-f0-9]{64}$/.test(sha256 ?? '') || await fileDigest(file)!==sha256) throw new Error('Artifact integrity mismatch');
    const result=await exec('gh',['attestation','verify',file,'--repo',REPOSITORY,
      '--signer-workflow',`${REPOSITORY}/.github/workflows/${workflow}`,
      '--source-ref','refs/heads/main','--source-digest',runnerRevision,'--signer-digest',runnerRevision,
      '--deny-self-hosted-runners','--format','json',...(bundlePath?['--bundle',bundlePath]:[])],{
      env:{PATH:process.env.PATH ?? '/usr/bin:/bin',GH_TOKEN:token},timeout:30000,maxBuffer:1024*1024,
    });
    assertSignedSubject(JSON.parse(result.stdout),sha256,binding);
    if (await fileDigest(file)!==sha256) throw new Error('Artifact changed during verification');
  }
  return run;
}
