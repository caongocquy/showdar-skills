import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink,rename,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';import {createHash} from 'node:crypto';
import {createPersistedReceipt} from './receipt-integrity.mjs';
const out=tmpdir(),bytes=Buffer.from('{\n  "tool": "artifact.write", "source": "public"\n}');
const context={sourceSha:'f'.repeat(40),sessionBindingId:'a'.repeat(64),tool:'artifact.write',requestSha256:'b'.repeat(64)};
async function fixture(fn){const dir=await mkdtemp(path.join(out,'binding-test-')),file=path.join(dir,'tool.json');const b=await createPersistedReceipt({file,bytes,context});try{await fn({dir,file,b});}finally{await b.close();await rm(dir,{recursive:true,force:true});}}
test('untouched writer-owned raw bytes and exact identity pass',()=>fixture(async({file,b})=>{assert.equal(await b.verify(),true);assert.equal(await b.guard(async()=>42),42);assert.equal(b.metadata.rawSha256,createHash('sha256').update(await readFile(file)).digest('hex'));assert.equal(b.metadata.sessionBindingId,context.sessionBindingId);}));
const cases={
 append:async f=>writeFile(f,Buffer.concat([bytes,Buffer.from(' marker')])),
 equivalentJSON:async f=>writeFile(f,JSON.stringify(JSON.parse(bytes))),
 validFieldChange:async f=>writeFile(f,'{"tool":"other","source":"public"}'),
 truncate:async f=>writeFile(f,bytes.subarray(0,10)),
 missing:async f=>unlink(f),
 malformed:async f=>writeFile(f,'{invalid'),
 replacedSameBytes:async f=>{await rename(f,f+'.old');await writeFile(f,bytes);},
 otherSessionReceipt:async f=>{await unlink(f);await writeFile(f,'{"tool":"artifact.write","source":"other-session"}');},
 symlinkReplacement:async f=>{await rename(f,f+'.old');await symlink(f+'.old',f);},
 rootSubstitution:async(f,dir)=>{await rename(dir,dir+'.old');await symlink(dir+'.old',dir);}
};
for(const [name,mutate]of Object.entries(cases))test('fail closed: '+name,()=>fixture(async({file,dir,b})=>{await mutate(file,dir);await assert.rejects(b.verify());await assert.rejects(b.guard(async()=>true));await assert.rejects(b.verify());if(name==='rootSubstitution'){await unlink(dir);await rename(dir+'.old',dir);}}));
test('mutation during guarded operation rejects the result and remains poisoned after restore',()=>fixture(async({file,b})=>{await assert.rejects(b.guard(async()=>{await writeFile(file,Buffer.concat([bytes,Buffer.from(' race')]));return true;}));await writeFile(file,bytes);await assert.rejects(b.verify());}));
test('same path cannot issue a replacement proof after deletion',()=>fixture(async({file})=>{await unlink(file);await assert.rejects(createPersistedReceipt({file,bytes,context}));}));
