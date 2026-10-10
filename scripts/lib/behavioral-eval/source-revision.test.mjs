import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertSourceRevision } from './source-revision.mjs';
import { BrokerPolicyError } from './typed-command-broker.mjs';

test('source binding rejects dirty and wrong revisions without executing fsmonitor',async()=>{
  const source=await mkdtemp(path.join(tmpdir(),'source-revision-'));
  const git=args=>execFileSync('/usr/bin/git',['-C',source,...args],{encoding:'utf8'}).trim();
  try {
    git(['init','--quiet']);git(['-c','user.name=Contract Test','-c','user.email=test@example.invalid','commit','--allow-empty','--quiet','-m','fixture']);
    const revision=git(['rev-parse','HEAD']),sentinel=path.join(source,'executed');
    git(['config','core.fsmonitor',`touch ${sentinel}`]);
    await assertSourceRevision(source,revision);await assert.rejects(access(sentinel));
    await assert.rejects(assertSourceRevision(source,'b'.repeat(40)),error=>error instanceof BrokerPolicyError&&/mismatch/.test(error.message));
    await assert.rejects(assertSourceRevision(source,revision.slice(0,7)),/full pinned/);
    await writeFile(path.join(source,'dirty'),'untrusted');
    await assert.rejects(assertSourceRevision(source,revision),/uncommitted/);
  } finally {await rm(source,{recursive:true,force:true});}
});
