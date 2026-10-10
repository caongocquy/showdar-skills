import { readFile } from 'node:fs/promises';
import { verifyPilotGates } from './lib/behavioral-eval/pilot-gates.mjs';
const [evidencePath,tracePath,artifactPath,imageManifestPath,imageArchivePath,expectedPath]=process.argv.slice(2);
if (!expectedPath) throw new Error('Six host-owned evidence paths required');
const expected=JSON.parse(await readFile(expectedPath));
const result=await verifyPilotGates({evidencePath,tracePath,artifactPath,imageManifestPath,imageArchivePath,expected,token:process.env.GITHUB_TOKEN});
console.log(JSON.stringify(result,null,2));
if (result.prePilot!=='GO') process.exitCode=1;
