#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const cwd=process.argv[2]??process.cwd(); const base=process.argv[3]??'HEAD';
const run=a=>{const r=spawnSync('git',a,{cwd,encoding:'utf8'});return r.status===0?r.stdout.trim():null};
console.log(JSON.stringify({base,status:run(['status','--short']),files:run(['diff','--name-only',base])?.split('\n').filter(Boolean)??[],stat:run(['diff','--stat',base]),diff:run(['diff','--no-ext-diff','--unified=3',base])},null,2));
