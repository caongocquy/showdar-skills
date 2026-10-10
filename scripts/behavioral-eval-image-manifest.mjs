import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createToolImageManifest } from './lib/behavioral-eval/tool-image-provenance.mjs';
import { assertSourceRevision } from './lib/behavioral-eval/source-revision.mjs';

if (process.env.GITHUB_REPOSITORY!=='caongocquy/showdar-skills' || process.env.GITHUB_REF!=='refs/heads/main' ||
    process.env.GITHUB_EVENT_NAME!=='workflow_dispatch') throw new Error('Trusted main workflow required');
await assertSourceRevision(process.cwd(),process.env.GITHUB_SHA);
const directory=process.env.IMAGE_DIRECTORY;
if (!directory || !path.isAbsolute(directory)) throw new Error('Host-owned image directory required');
const manifest=await createToolImageManifest({imageId:process.env.TOOL_IMAGE_ID,archivePath:path.join(directory,'tool-image.tar'),
  runnerRevision:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT)});
await writeFile(path.join(directory,'image.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
