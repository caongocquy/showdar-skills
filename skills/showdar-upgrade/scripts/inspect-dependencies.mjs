#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'; import path from 'node:path'; import { detectStacks } from './lib/detect-stack.mjs';
const root=path.resolve(process.argv[2]??process.cwd()); const out={root,stacks:await detectStacks(root)};
try{const p=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));out.node={engines:p.engines??{},dependencies:p.dependencies??{},devDependencies:p.devDependencies??{},peerDependencies:p.peerDependencies??{}}}catch{}
try{await access(path.join(root,'pubspec.yaml'));out.pubspec=(await readFile(path.join(root,'pubspec.yaml'),'utf8')).slice(0,20000)}catch{}
console.log(JSON.stringify(out,null,2));
