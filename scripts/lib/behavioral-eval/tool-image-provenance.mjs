import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { digest, fileDigest, readEvidence, verifySignedFiles } from './github-provenance.mjs';
import { SANDBOX_IMAGE } from './container-sandbox.mjs';

const exec=promisify(execFile);
const approvals=new WeakMap();
const env={PATH:'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin'};
const recipe=new URL('../../../evals/behavioral/Dockerfile.tool-runtime',import.meta.url);

async function inspect(imageId) {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) throw new Error('Immutable approved image ID required');
  const {stdout}=await exec('docker',['image','inspect',imageId],{env,timeout:5000,maxBuffer:65536});
  const images=JSON.parse(stdout);
  if (images.length!==1 || images[0].Id!==imageId ||
      images[0].Config?.Labels?.['org.showdar.purpose']!=='behavioral-eval-offline-tool-runtime') throw new Error('Unapproved tool image');
  return images[0];
}

export function requireToolImage(approval,imageId,{live=false}={}) {
  const proof=approvals.get(approval);
  if (!proof || proof.imageId!==imageId || (live && proof.kind!=='github-attested-image')) throw new Error('Missing, forged or unapproved tool-image provenance');
  return structuredClone(proof);
}

/** An explicit local Docker test capability is permanently excluded from both readiness and behavioral authority. */
export async function approveModelFreeToolImage(imageId) {
  await inspect(imageId);
  const approval=Object.freeze({});
  approvals.set(approval,{kind:'model-free-image',imageId,behavioralStatus:'BLOCKED'});
  return approval;
}

export async function createToolImageManifest({imageId,archivePath,runnerRevision,runId,runAttempt}) {
  const image=await inspect(imageId);
  if (!/^[a-f0-9]{40}$/.test(runnerRevision ?? '') || !/^[1-9]\d*$/.test(String(runId)) || !Number.isSafeInteger(runAttempt) || runAttempt<1) throw new Error('Pinned build identity required');
  return {schemaVersion:1,purpose:'tool-image-build',imageId,archiveSha256:await fileDigest(archivePath),
    dockerfileSha256:digest(await readFile(recipe)),baseImage:SANDBOX_IMAGE,
    imageConfigSha256:digest(JSON.stringify(image.Config)),runnerRevision,runId:String(runId),runAttempt};
}

export function assertImageManifest(manifest,expected,recipeSha256) {
  if (manifest.schemaVersion!==1 || manifest.purpose!=='tool-image-build' ||
      manifest.baseImage!==SANDBOX_IMAGE || manifest.dockerfileSha256!==recipeSha256 ||
      !/^[a-f0-9]{64}$/.test(manifest.imageConfigSha256 ?? '')) throw new Error('Unapproved image recipe or configuration');
  for (const key of ['imageId','archiveSha256','runnerRevision','runId','runAttempt']) {
    if (String(manifest[key])!==String(expected[key])) throw new Error(`Image ${key} mismatch`);
  }
}

/** Verify both signed build manifest and exact archive before loading; callers must pin every approved digest. */
export async function verifyImageBuild({manifestPath,archivePath,expected,token,bundlePath}) {
  const {bytes,value:manifest}=await readEvidence(manifestPath);
  if (digest(bytes)!==expected?.manifestSha256) throw new Error('Image manifest digest mismatch');
  assertImageManifest(manifest,expected,digest(await readFile(recipe)));
  const binding={workflow:'behavioral-tool-image.yml',runnerRevision:manifest.runnerRevision,runId:manifest.runId,runAttempt:manifest.runAttempt};
  await verifySignedFiles([{file:manifestPath,sha256:expected.manifestSha256},{file:archivePath,sha256:manifest.archiveSha256}],binding,token,bundlePath);
  return manifest;
}

export async function verifyToolImage(options) {
  const {manifestPath,archivePath,expected}=options;
  const manifest=await verifyImageBuild(options);
  await exec('docker',['load','--input',archivePath],{env,timeout:90000,maxBuffer:65536});
  if (await fileDigest(archivePath)!==manifest.archiveSha256) throw new Error('Image archive changed while loading');
  const image=await inspect(manifest.imageId);
  if (digest(JSON.stringify(image.Config))!==manifest.imageConfigSha256) throw new Error('Loaded image configuration mismatch');
  const approval=Object.freeze({});
  approvals.set(approval,{kind:'github-attested-image',...manifest,manifestSha256:expected.manifestSha256});
  return approval;
}
