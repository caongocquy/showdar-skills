#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { runResponsesScenario } from './lib/behavioral-eval/responses-runner.mjs';
import { verifyDockerIsolation } from './lib/behavioral-eval/container-sandbox.mjs';
const args=process.argv.slice(2);
const values={};
for(let index=0;index<args.length;index++) {
  const arg=args[index];
  if(['--preflight','--allow-model'].includes(arg)) {values[arg]=true;continue;}
  if(!['--case','--model','--source-sha'].includes(arg)||!args[index+1]||args[index+1].startsWith('--')||values[arg]) throw new Error('Invalid or duplicate argument');
  values[arg]=args[++index];
}
if(values['--preflight']) {
  const sandbox = await verifyDockerIsolation();
  console.log(JSON.stringify(sandbox,null,2));
  process.exitCode = sandbox.verified ? 0 : 1;
} else {
  const suite=JSON.parse(await readFile(new URL('../evals/behavioral/scenarios.json',import.meta.url),'utf8'));
  if(!suite.scenarios.some(s=>s.id===values['--case'])||!values['--model']||!/^[a-f0-9]{40}$/.test(values['--source-sha']??'')) throw new Error('One known --case, explicit --model and full --source-sha are required');
  console.log(JSON.stringify(await runResponsesScenario({allowModel:values['--allow-model']===true}),null,2));
  process.exitCode=1;
}
