#!/usr/bin/env node
import { spawnSync } from 'node:child_process'; import path from 'node:path';
const cwd=path.resolve(process.argv[2]??process.cwd()); const run=a=>{const r=spawnSync('git',a,{cwd,encoding:'utf8'});return {ok:r.status===0,out:r.stdout.trim(),err:r.stderr.trim()}};
const status=run(['status','--short']); const diff=run(['diff','--stat']); const names=run(['diff','--name-only']); const log=run(['log','-5','--oneline','--decorate']);
console.log(JSON.stringify({cwd,gitAvailable:status.ok,status:status.out||null,diffStat:diff.out||null,changed:names.out?names.out.split('\n'):[],recentCommits:log.out?log.out.split('\n'):[],errors:[status.err,diff.err,names.err,log.err].filter(Boolean)},null,2));
