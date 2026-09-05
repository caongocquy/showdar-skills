#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const cwd=process.argv[2]??process.cwd(); const base=process.argv[3]??'HEAD';
const run=(args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',shell:false});if(r.error)throw r.error;if(r.status!==0)throw new Error((r.stderr||r.stdout).trim()||`git ${args.join(' ')} failed`);return r.stdout.trim()};
try {
  if (base.startsWith('-')) throw new Error('revision must not begin with "-"');
  const resolved=run(['rev-parse','--verify',`${base}^{commit}`]);
  console.log(JSON.stringify({base,status:run(['status','--short']),files:run(['diff','--no-ext-diff','--name-only',resolved])?.split('\n').filter(Boolean)??[],stat:run(['diff','--no-ext-diff','--stat',resolved]),diff:run(['diff','--no-ext-diff','--unified=3',resolved])},null,2));
} catch (error) {
  console.error(`collect-diff: ${error.message}`);
  process.exitCode=1;
}
