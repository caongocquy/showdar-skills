import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {approveModelFreeToolImage} from '../../tool-image-provenance.mjs';
// External historical bytes remain prerequisites, never restored or re-attested here.
const out='/Users/quycaongoc/showdar-skills/docs/CODEX_CLI_SMOKE_TEST-20261012-phase2/resume-20261012';
export const sourceRoot=path.resolve(out,'../source');
export const sourceSha='99fc3f98e01c1a6d6f2549cc36b21af6f5eede04';
const hash=b=>createHash('sha256').update(b).digest('hex');
const env={PATH:'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin'};
export async function approveRuntime() {
  const expected={"image-pin-check.json":"e8a0e1233605eccc2a998358b74dfead1769b1260330d7ba33331aa212d0f766","archive-config.json":"e57720d796a2a1bdca070eb004c26180743389e3013ba6cc29709a4e0be84227","verify-image-manifest.json":"50cad20ee5c9e44bba8958122df1d87875c025c2cbd8c3d7287645e11f659014","verify-image-archive.json":"5cc1862f652126e461d66fcfc7cc7a021d3f06a01601825eb24d8450722f6279"};
  const checked={};for(const [name,digest]of Object.entries(expected)){const bytes=await readFile(path.join(out,name));if(hash(bytes)!==digest)throw Error('External qualification fixture identity mismatch: '+name);checked[name]=bytes;}
  const pinned = JSON.parse(checked['image-pin-check.json']);
  const archiveConfig = JSON.parse(checked['archive-config.json']);
  // Docker 29 addresses the original signed archive's OCI manifest rather than its config digest.
  const imageId = 'sha256:e576f2d6c9ba92ece8007929d7263d766ed2bd062e913f6d7eae88303cd3dc16';
  const image = JSON.parse(execFileSync('/usr/local/bin/docker', ['image', 'inspect', imageId], { env, encoding: 'utf8', timeout: 10000 }))[0];
  if (image.Id !== imageId || hash(checked['archive-config.json']) !== pinned.expected.imageId.slice(7) ||
    JSON.stringify(image.Config) !== JSON.stringify(archiveConfig.config) || JSON.stringify(image.RootFS.Layers) !== JSON.stringify(archiveConfig.rootfs.diff_ids)) throw new Error('Loaded original OCI runtime bytes do not match');
  for (const file of ['verify-image-manifest.json', 'verify-image-archive.json']) {
    const verification = JSON.parse(checked[file]);
    if (verification.exitCode !== 0) throw new Error('Original bundle signature not verified');
  }
  return { imageId, imageApproval: await approveModelFreeToolImage(imageId) };
}
