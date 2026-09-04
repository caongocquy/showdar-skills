#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectStacks } from './lib/detect-stack.mjs';
const root=path.resolve(process.argv[2]??process.cwd());
const exists=async p=>{try{await access(p);return true}catch{return false}};
const files={};
for(const f of ['package.json','pubspec.yaml','README.md','AGENTS.md']) if(await exists(path.join(root,f))) files[f]=(await readFile(path.join(root,f),'utf8')).slice(0,12000);
console.log(JSON.stringify({root,stacks:await detectStacks(root),contextFiles:Object.keys(files),snippets:files},null,2));
