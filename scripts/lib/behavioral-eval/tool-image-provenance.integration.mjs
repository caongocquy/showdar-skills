import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest, fileDigest } from './github-provenance.mjs';
import { createToolImageManifest, approveModelFreeToolImage, requireToolImage, assertImageManifest } from './tool-image-provenance.mjs';
import { assertSourceRevision } from './source-revision.mjs';

test('real Docker archive and immutable configuration match the build manifest; unsigned images cannot authorize live execution',{timeout:120000},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'image-build-contract-'));
  const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:90000,maxBuffer:65536});
  try {
    const sourceSha=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    await assertSourceRevision(process.cwd(),sourceSha);
    const imageId=docker(['image','inspect','--format','{{.Id}}','showdar-eval-tools:ci']).trim();
    const archivePath=path.join(directory,'tool-image.tar');docker(['save',imageId,'-o',archivePath]);
    const manifest=await createToolImageManifest({imageId,archivePath,runnerRevision:sourceSha,runId:'1',runAttempt:1});
    const recipeSha=digest(await readFile(new URL('../../../evals/behavioral/Dockerfile.tool-runtime',import.meta.url)));
    assertImageManifest(manifest,manifest,recipeSha);
    assert.equal(manifest.archiveSha256,await fileDigest(archivePath));
    const image=JSON.parse(docker(['image','inspect',imageId]))[0];
    assert.equal(manifest.imageConfigSha256,digest(JSON.stringify(image.Config)));
    const approval=await approveModelFreeToolImage(imageId);
    assert.equal(requireToolImage(approval,imageId).behavioralStatus,'BLOCKED');
    assert.throws(()=>requireToolImage(approval,imageId,{live:true}),/provenance/);
    assert.throws(()=>requireToolImage({...manifest},imageId),/provenance/);
    await assertSourceRevision(process.cwd(),sourceSha);
  } finally {await rm(directory,{recursive:true,force:true});}
});
