#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { verifyTrustedEvidence } from './lib/behavioral-eval/trusted-evidence.mjs';

const values={};
const args=process.argv.slice(2);
for (let i=0;i<args.length;i+=2) {
  if (!['--evidence','--artifact','--trace','--expected'].includes(args[i]) ||
      !args[i+1] || args[i+1].startsWith('--') || values[args[i]]) throw new Error('Invalid evidence verification arguments');
  values[args[i]]=args[i+1];
}
if (Object.keys(values).length!==4) throw new Error('Evidence, artifact, trace and independently pinned expected binding files required');
const result=await verifyTrustedEvidence({evidencePath:values['--evidence'],artifactPath:values['--artifact'],
  tracePath:values['--trace'],expected:JSON.parse(await readFile(values['--expected'],'utf8')),
  repository:'caongocquy/showdar-skills',
  signerWorkflow:'caongocquy/showdar-skills/.github/workflows/behavioral-evidence-attestation.yml'});
console.log(JSON.stringify(result,null,2));
process.exitCode=result.status==='PASS'?0:1;
