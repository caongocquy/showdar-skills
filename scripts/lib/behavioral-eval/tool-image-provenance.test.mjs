import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest, fileDigest, readEvidence, assertTrustedRun, assertSignedSubject, verifySignedFiles } from './github-provenance.mjs';
import { SANDBOX_IMAGE, requireToolImage, assertImageManifest, verifyImageBuild } from './tool-image-provenance.mjs';

const revision='a'.repeat(40);
test('image provenance rejects tampering, substitution, stale signer and attempt replay',async()=>{
  const manifest={schemaVersion:1,purpose:'tool-image-build',baseImage:SANDBOX_IMAGE,dockerfileSha256:'b'.repeat(64),
    imageConfigSha256:'c'.repeat(64),imageId:'sha256:'+'d'.repeat(64),archiveSha256:'e'.repeat(64),runnerRevision:revision,runId:'123',runAttempt:1};
  assertImageManifest(manifest,manifest,manifest.dockerfileSha256);
  for (const key of ['imageId','archiveSha256','runnerRevision','runId','runAttempt']) {
    assert.throws(()=>assertImageManifest({...manifest,[key]:key==='runAttempt'?2:'forged'},manifest,manifest.dockerfileSha256),/mismatch/);
  }
  assert.throws(()=>assertImageManifest({...manifest,baseImage:'node:latest'},manifest,manifest.dockerfileSha256),/recipe/);
  assert.throws(()=>assertImageManifest(manifest,manifest,'f'.repeat(64)),/recipe/);
  assert.throws(()=>requireToolImage({...manifest,kind:'github-attested-image'},manifest.imageId),/provenance/);
  await assert.rejects(verifySignedFiles([],{workflow:'forged.yml'}),/signer/);
  const directory=await mkdtemp(path.join(tmpdir(),'image-provenance-'));
  try {
    const file=path.join(directory,'image.json');
    await writeFile(file,JSON.stringify(manifest));
    assert.equal(await fileDigest(file),digest(JSON.stringify(manifest)));
    await assert.rejects(verifyImageBuild({manifestPath:file,expected:{manifestSha256:'f'.repeat(64)}}),/digest/);
    const link=path.join(directory,'link.json');await symlink(file,link);
    await assert.rejects(readEvidence(link),/Invalid evidence/);
    await assert.rejects(fileDigest(link),/regular files/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('authenticated run and cryptographically verified subject policies reject fork, wrong signer and replay',()=>{
  const binding={workflow:'behavioral-tool-image.yml',runnerRevision:revision,runId:'123',runAttempt:1};
  const run={id:123,run_attempt:1,head_sha:revision,head_branch:'main',event:'workflow_dispatch',conclusion:'success',
    path:'.github/workflows/behavioral-tool-image.yml',repository:{full_name:'caongocquy/showdar-skills'},
    head_repository:{full_name:'caongocquy/showdar-skills'},actor:{login:'operator'}};
  assertTrustedRun(run,binding);
  for (const delta of [{head_branch:'feature'},{repository:{full_name:'evil/fork'}},{head_repository:{full_name:'evil/fork'}},
    {run_attempt:2},{head_sha:'b'.repeat(40)},{event:'pull_request'},{conclusion:null},{path:'forged.yml'},{actor:{}}]) {
    assert.throws(()=>assertTrustedRun({...run,...delta},binding),/Untrusted/);
  }
  const invocation='https://github.com/caongocquy/showdar-skills/actions/runs/123/attempts/1';
  const verified=[{verificationResult:{statement:{subject:[{digest:{sha256:digest('bytes')}}],
    predicate:{runDetails:{metadata:{invocationId:invocation}}}},signature:{certificate:{runInvocationURI:invocation}}}}];
  assertSignedSubject(verified,digest('bytes'),binding);
  assert.throws(()=>assertSignedSubject(verified,digest('tamper'),binding),/binding/);
  assert.throws(()=>assertSignedSubject(verified,digest('bytes'),{...binding,runAttempt:2}),/binding/);
});

test('image signing job has no code execution, trusted-main checkout and only same-run subjects',async()=>{
  const workflow=await readFile(new URL('../../../.github/workflows/behavioral-tool-image.yml',import.meta.url),'utf8');
  assert.match(workflow,/permissions: \{\}/);
  assert.match(workflow,/github.repository == 'caongocquy\/showdar-skills' && github.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  const [build,signer]=workflow.split('\n  attest:');
  assert.doesNotMatch(build,/id-token: write|attestations: write|secrets\.|inputs\.|pull_request_target|workflow_run/);
  assert.match(signer,/needs: build/);
  assert.match(signer,/id-token: write/);
  assert.match(signer,/attestations: write/);
  assert.doesNotMatch(signer,/checkout|run:|script:|github-script|repository:|run-id:|github-token:|secrets\./);
  assert.match(signer,/name: behavioral-tool-image-\$\{\{ github.run_attempt \}\}/);
  assert.match(signer,/steps.provenance.outputs.bundle-path/);
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1],/@[a-f0-9]{40}$/);
  const verifier=await readFile(new URL('./github-provenance.mjs',import.meta.url),'utf8');
  for (const flag of ['--source-ref','--source-digest','--signer-digest','--signer-workflow','--deny-self-hosted-runners','--bundle']) assert.ok(verifier.includes(flag));
});
