#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'; import path from 'node:path';
const root=path.resolve(process.argv[2]??process.cwd()); const out=[];
try{const p=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));const d={...(p.dependencies??{}),...(p.devDependencies??{})};for(const [pkg,name] of [['vitest','vitest'],['jest','jest'],['@playwright/test','playwright'],['detox','detox']])if(d[pkg])out.push(name)}catch{}
try{await access(path.join(root,'pubspec.yaml'));const s=await readFile(path.join(root,'pubspec.yaml'),'utf8');if(/flutter_test/.test(s))out.push('flutter-test');if(/integration_test/.test(s))out.push('flutter-integration-test')}catch{}
console.log(JSON.stringify({root,tools:[...new Set(out)]},null,2));
