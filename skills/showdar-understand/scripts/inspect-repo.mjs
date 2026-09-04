#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { detectStacks } from './lib/detect-stack.mjs';

const root = path.resolve(process.argv[2] ?? process.cwd());
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const candidates = ['package.json','pnpm-workspace.yaml','yarn.lock','pnpm-lock.yaml','package-lock.json','pubspec.yaml','Cargo.toml','go.mod','pyproject.toml','Dockerfile','docker-compose.yml','compose.yaml','.github/workflows'];
const present = [];
for (const name of candidates) if (await exists(path.join(root,name))) present.push(name);
let packageSummary = null;
if (await exists(path.join(root,'package.json'))) {
  try { const p=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')); packageSummary={name:p.name??null,scripts:Object.keys(p.scripts??{}),workspaces:p.workspaces??null}; } catch {}
}
const top = (await readdir(root,{withFileTypes:true})).filter(e=>!e.name.startsWith('.')||e.name==='.github').slice(0,80).map(e=>({name:e.name,type:e.isDirectory()?'dir':'file'}));
console.log(JSON.stringify({root,stacks:await detectStacks(root),signals:present,package:packageSummary,topLevel:top},null,2));
