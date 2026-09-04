#!/usr/bin/env node
import { detectStacks } from './lib/detect-stack.mjs'; import path from 'node:path';
const root=path.resolve(process.argv[2]??process.cwd()); const stacks=await detectStacks(root); const targets=[];
if(stacks.some(s=>['nextjs','react','vue','svelte'].includes(s)))targets.push('web'); if(stacks.some(s=>['node','fastify','nestjs'].includes(s)))targets.push('backend'); if(stacks.includes('ios'))targets.push('ios'); if(stacks.includes('android'))targets.push('android'); if(stacks.includes('tauri'))targets.push('desktop');
console.log(JSON.stringify({root,stacks,targets:[...new Set(targets)]},null,2));
