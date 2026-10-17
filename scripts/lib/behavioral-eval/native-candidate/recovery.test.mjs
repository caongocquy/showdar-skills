import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {quarantineInterruptedInvocation} from './recovery.mjs';
test('Interrupted publication is quarantined without trusting its marker or touching accepted history',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));
 await mkdir(path.join(root,'active'));await mkdir(path.join(root,'accepted'));
 await writeFile(path.join(root,'active','commit.json'),'{"integrityVerified":true,"approvalGranted":true}');
 await writeFile(path.join(root,'accepted','receipt.json'),'PUBLIC_ACCEPTED_BYTES');
 const result=await quarantineInterruptedInvocation(root);
 assert.equal(result.trusted,false);assert.equal(result.invocationResumed,false);
 await assert.rejects(lstat(path.join(root,'active')),{code:'ENOENT'});
 assert.equal(await readFile(path.join(root,'accepted','receipt.json'),'utf8'),'PUBLIC_ACCEPTED_BYTES');
 assert.equal((await readdir(path.join(root,'quarantine'))).length,1);
 assert.equal((await quarantineInterruptedInvocation(root)).moved,false);
});

test('recovery exposes a synchronous post-quarantine crash boundary without synthesizing trust',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'active'));await writeFile(path.join(root,'active','commit.json'),'PUBLIC_FORGED_MATCHING_MARKER');let observed=false;
 const result=await quarantineInterruptedInvocation(root,{barrier:(name,info)=>{if(name==='after-quarantine-rename'){observed=true;assert.ok(info.destination);}}});assert.equal(observed,true);assert.equal(result.trusted,false);
});
test('ambiguous quarantine path fails closed even with no active namespace',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'outside'));const {symlink}=await import('node:fs/promises');await symlink(path.join(root,'outside'),path.join(root,'quarantine'));await assert.rejects(quarantineInterruptedInvocation(root));
});

test('forged matching marker bytes stay opaque and existing quarantine files are not overwritten',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'active'));await mkdir(path.join(root,'quarantine'),{mode:0o700});await mkdir(path.join(root,'quarantine','accepted'),{mode:0o700});await writeFile(path.join(root,'quarantine','accepted','receipt.json'),'PUBLIC_EXISTING_VALID_BYTES');const forged=JSON.stringify({integrityVerified:true,approvalGranted:true,sha256:'f'.repeat(64)});await writeFile(path.join(root,'active','commit.json'),forged);
 const r=await quarantineInterruptedInvocation(root);assert.equal(await readFile(path.join(r.destination,'commit.json'),'utf8'),forged);assert.equal(await readFile(path.join(root,'quarantine','accepted','receipt.json'),'utf8'),'PUBLIC_EXISTING_VALID_BYTES');assert.deepEqual(await readdir(r.destination),['commit.json']);assert.equal(r.trusted,false);assert.equal((await quarantineInterruptedInvocation(root)).moved,false);
});
test('failure after opaque move leaves material quarantined and retry is idempotent',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'active'));await writeFile(path.join(root,'active','artifact.bin'),'PUBLIC_PARTIAL_BYTES');await assert.rejects(quarantineInterruptedInvocation(root,{barrier:name=>{if(name==='after-quarantine-rename')throw Error('PUBLIC_CRASH');}}),/PUBLIC_CRASH/);assert.equal((await quarantineInterruptedInvocation(root)).moved,false);assert.equal((await readdir(path.join(root,'quarantine'))).length,1);
});
test('active symlink, file and unsafe root permissions fail closed without touching outside canary',async()=>{
 const {symlink,unlink,chmod}=await import('node:fs/promises');const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'outside'));await writeFile(path.join(root,'outside','canary'),'PUBLIC_OUTSIDE');await symlink(path.join(root,'outside'),path.join(root,'active'));await assert.rejects(quarantineInterruptedInvocation(root));await unlink(path.join(root,'active'));await writeFile(path.join(root,'active'),'PUBLIC_NOT_DIRECTORY');await assert.rejects(quarantineInterruptedInvocation(root));await chmod(root,0o755);await assert.rejects(quarantineInterruptedInvocation(root));await chmod(root,0o700);assert.equal(await readFile(path.join(root,'outside','canary'),'utf8'),'PUBLIC_OUTSIDE');
});
test('recovery refuses active identity substitution at its final move boundary',async()=>{
 const {rename}=await import('node:fs/promises');const {renameSync,mkdirSync}=await import('node:fs');const root=await realpath(await mkdtemp(path.join(tmpdir(),'task002-recovery-')));await mkdir(path.join(root,'active'));await writeFile(path.join(root,'active','old.bin'),'PUBLIC_OLD');await assert.rejects(quarantineInterruptedInvocation(root,{barrier:name=>{if(name==='before-quarantine-rename'){renameSync(path.join(root,'active'),path.join(root,'old'));mkdirSync(path.join(root,'active'));}}}),/identity changed/);assert.equal(await readFile(path.join(root,'old','old.bin'),'utf8'),'PUBLIC_OLD');assert.deepEqual(await readdir(path.join(root,'active')),[]);
});
