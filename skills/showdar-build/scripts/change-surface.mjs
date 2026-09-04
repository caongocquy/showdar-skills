#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const cwd=process.argv[2]??process.cwd();
const run=(args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});return r.status===0?r.stdout.trim():null};
console.log(JSON.stringify({status:run(['status','--short']),diffStat:run(['diff','--stat']),changed:run(['diff','--name-only'])?.split('\n').filter(Boolean)??[],staged:run(['diff','--cached','--name-only'])?.split('\n').filter(Boolean)??[]},null,2));
