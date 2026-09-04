#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { detectStacks } from './lib/detect-stack.mjs';
const cwd=path.resolve(process.argv[2]??process.cwd());
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd,encoding:'utf8'});return r.status===0?r.stdout.trim():null};
const redact=(s)=>s?.replace(/(token|secret|password|authorization)\s*[=:]\s*\S+/ig,'$1=<redacted>')??null;
console.log(JSON.stringify({cwd,stacks:await detectStacks(cwd),node:process.version,platform:process.platform,arch:process.arch,gitStatus:redact(run('git',['status','--short'])),gitHead:run('git',['rev-parse','--short','HEAD'])},null,2));
