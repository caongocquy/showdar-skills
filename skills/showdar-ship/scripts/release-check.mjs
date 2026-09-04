#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'; import path from 'node:path';
const root=path.resolve(process.argv[2]??process.cwd()); const exists=async p=>{try{await access(p);return true}catch{return false}}; const checks=[];
if(await exists(path.join(root,'package.json'))){const p=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));checks.push({check:'package version',status:p.version?'present':'missing',value:p.version??null});checks.push({check:'build script',status:p.scripts?.build?'present':'missing'});checks.push({check:'test script',status:p.scripts?.test?'present':'missing'})}
checks.push({check:'git repository',status:await exists(path.join(root,'.git'))?'present':'not-detected'}); checks.push({check:'ios project',status:await exists(path.join(root,'ios'))?'present':'not-applicable'}); checks.push({check:'android project',status:await exists(path.join(root,'android'))?'present':'not-applicable'});
console.log(JSON.stringify({root,checks,note:'Read-only preflight. It does not prove release readiness; run project verification commands and platform checks.'},null,2));
