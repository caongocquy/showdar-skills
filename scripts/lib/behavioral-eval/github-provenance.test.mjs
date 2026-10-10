import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest, verifySignedFiles } from './github-provenance.mjs';

test('native verifier owns and cleans gh home/state/cache even when cryptographic verification fails',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'gh-environment-contract-'));
  const previousPath=process.env.PATH;
  const binding={workflow:'behavioral-tool-image.yml',runnerRevision:'a'.repeat(40),runId:'123',runAttempt:1};
  const run={id:123,run_attempt:1,head_sha:binding.runnerRevision,head_branch:'main',event:'workflow_dispatch',conclusion:'success',
    path:'.github/workflows/behavioral-tool-image.yml',repository:{full_name:'caongocquy/showdar-skills'},
    head_repository:{full_name:'caongocquy/showdar-skills'},actor:{login:'operator'}};
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(run)));
  let verifierHome;
  try {
    const file=path.join(directory,'subject');await writeFile(file,'fixture');
    // This CLI fixture always rejects signatures; it tests child isolation and confers no evidence authority.
    await writeFile(path.join(directory,'gh'),`#!${process.execPath}\n`+String.raw`
      const fs=require('node:fs'),path=require('node:path');
      const home=process.env.HOME;
      if(!home || !path.isAbsolute(home) || !path.basename(home).startsWith('showdar-gh-attestation-') ||
        ['GH_CONFIG_DIR','XDG_STATE_HOME','XDG_CACHE_HOME'].some(key=>!process.env[key]?.startsWith(home+path.sep))) {
        process.stderr.write('GH_HOME_NOT_ISOLATED');process.exit(2);
      }
      fs.mkdirSync(path.join(home,'.local/state/gh'),{recursive:true});
      fs.writeFileSync(path.join(home,'.local/state/gh/device-id'),'fixture');
      process.stderr.write('GH_HOME:'+home);process.exit(1);
    `,{mode:0o700});
    process.env.PATH=directory+path.delimiter+previousPath;
    await assert.rejects(verifySignedFiles([{file,sha256:digest('fixture')}],binding,'fixture-token'),error=>{
      const stderr=String(error.stderr);
      assert.doesNotMatch(stderr,/GH_HOME_NOT_ISOLATED/);
      assert.match(stderr,/GH_HOME:/);verifierHome=stderr.split('GH_HOME:')[1];
      return true;
    });
    await assert.rejects(access(verifierHome),{code:'ENOENT'});
  } finally {
    process.env.PATH=previousPath;
    await rm(directory,{recursive:true,force:true});
  }
});
