import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {digest} from './lib/behavioral-eval/github-provenance.mjs';
import {prepareEnvironmentProbe,verifyEnvironmentProbe,ENVIRONMENT_PROBE_PREFIX} from './lib/behavioral-eval/environment-probe.mjs';

const mode=process.argv[2];
if (process.argv.length!==3 || !['--prepare','--verify'].includes(mode)) throw new Error('Invalid probe mode');
if (mode==='--prepare') {
  if (!path.isAbsolute(process.env.GITHUB_STEP_SUMMARY ?? '')) throw new Error('Native summary path required');
  const binding=await prepareEnvironmentProbe(process.env.GITHUB_TOKEN);
  const comment=ENVIRONMENT_PROBE_PREFIX+'\n'+digest(JSON.stringify(binding));
  await writeFile(process.env.GITHUB_STEP_SUMMARY,'## Secret-free Environment probe\n\nThis approves no paid execution. Paste this exact comment when reviewing this Environment deployment:\n\n```\n'+comment+'\n```\n\n```json\n'+JSON.stringify(binding,null,2)+'\n```\n',{flag:'a'});
  console.log(comment);
} else {
  if (!path.isAbsolute(process.env.RUNNER_TEMP ?? '')) throw new Error('Native runner temporary path required');
  const result=await verifyEnvironmentProbe(process.env.GITHUB_TOKEN);
  await writeFile(path.join(process.env.RUNNER_TEMP,'environment-probe.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Environment probe PASS; paid authorization false');
}
