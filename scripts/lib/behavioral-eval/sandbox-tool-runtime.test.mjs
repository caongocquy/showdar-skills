import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSandboxToolArgs, runSandboxedTool } from './sandbox-tool-runtime.mjs';
import { prepareBrokerCommand, BrokerPolicyError } from './typed-command-broker.mjs';

const id = 'sha256:' + 'b'.repeat(64);
const workspace = '/tmp/strict-fixture';
const name = 'showdar-tool-test';

test('tool process uses the same hardened Docker flag contract as isolation probes', () => {
  const args = buildSandboxToolArgs({ workspace, imageId:id, name, request:{tool:'git.status'} });
  for (const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--user=65534:65534','--pids-limit=64','--memory=256m','--cpus=1','--pull=never']) {
    assert.ok(args.includes(flag), 'missing '+flag);
  }
  assert.ok(args.includes('type=bind,src='+workspace+',dst=/workspace'));
  assert.ok(args.includes(id));
  assert.equal(args.includes('--privileged'),false);
  assert.equal(args.some(x=>x==='--env'||x==='--env-file'),false);
  assert.equal(args.some((x,i)=>args[i-1]==='--mount' && x.includes('docker.sock')),false);
});

test('model tool content is carried only via stdin, never Docker process argv', () => {
  const secret='private-eval-content-do-not-expose';
  const args=buildSandboxToolArgs({workspace,imageId:id,name,
    request:{tool:'artifact.write',path:'artifacts/a.txt',content:secret}});
  assert.equal(args[0],'run');
  assert.ok(args.includes('-i'));
  assert.equal(args.join(' ').includes(secret),false);
  assert.equal(args.join(' ').includes(Buffer.from(secret).toString('base64')),false);
});

test('no mutable image tag or invalid workspace can reach Docker', () => {
  for (const bad of ['node:24-alpine','sha256:bad','a'.repeat(64),null]) {
    assert.throws(()=>buildSandboxToolArgs({workspace,imageId:bad,name,request:{tool:'git.status'}}),BrokerPolicyError);
  }
  assert.throws(()=>buildSandboxToolArgs({workspace:'/',imageId:id,name,request:{tool:'git.status'}}));
});

test('real tool transport rejects unauthorized requests before container launch', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'showdar-offline-policy-'));
  const fixture=path.join(root,'fixture');
  const evidence=path.join(root,'evidence');
  const sourceRoot=path.join(root,'source');
  await mkdir(fixture);await mkdir(evidence);await mkdir(sourceRoot);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'init','--quiet']);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--allow-empty','--quiet','-m','source']);
  const sourceSha=execFileSync('/usr/bin/git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  try {
    const tests = [
      {tool:'git.status',command:'/bin/sh',args:['-c','whoami']},
      {tool:'git.status',args:['push','origin','main']},
      {tool:'git.diff-check'},
      {tool:'artifact.write',path:'../bad.txt',content:'a'},
      {tool:'artifact.write',path:'artifacts/a.txt',content:'a',status:'PASS'},
      {tool:'fixture.read',path:'.ssh/key'},
      {tool:'shell',command:'node -e 1'},
    ];
    for (const request of tests) {
      await assert.rejects(()=>runSandboxedTool({request,workspace:fixture,sourceRoot,sourceSha,evidenceDir:evidence,imageId:id,
        readPaths:['README.md'],writePaths:['artifacts/a.txt']}),BrokerPolicyError);
    }
    await writeFile(path.join(fixture,'README.md'),'fixture');
    await symlink('/etc/passwd',path.join(fixture,'unsafe.txt'));
    await assert.rejects(()=>runSandboxedTool({request:{tool:'fixture.read',path:'unsafe.txt'},
      workspace:fixture,sourceRoot,sourceSha,evidenceDir:evidence,imageId:id,readPaths:['unsafe.txt']}),
      error=>error instanceof BrokerPolicyError&&/symlink/.test(error.message));
    await assert.rejects(()=>runSandboxedTool({request:{tool:'artifact.write',path:'unsafe.txt',content:'x'},
      workspace:fixture,sourceRoot,sourceSha,evidenceDir:evidence,imageId:id,writePaths:['unsafe.txt']}),
      error=>error instanceof BrokerPolicyError&&/symlink/.test(error.message));
    await mkdir(path.join(root,'outside'));
    await symlink(path.join(root,'outside'),path.join(fixture,'linked'));
    await assert.rejects(()=>runSandboxedTool({request:{tool:'artifact.write',path:'linked/escaped.txt',content:'x'},
      workspace:fixture,sourceRoot,sourceSha,evidenceDir:evidence,imageId:id,writePaths:['linked/escaped.txt']}),
      error=>error instanceof BrokerPolicyError&&/symlink/.test(error.message));
    const legit=prepareBrokerCommand({tool:'git.status'},{workspace:fixture});
    assert.deepEqual(legit.args,['status','--short','--branch']);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('evidence cannot be mounted within, or as ancestor of, agent fixture',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'showdar-offline-boundary-'));
  const workspace=path.join(root,'workspace');
  const sourceRoot=path.join(root,'source');
  await mkdir(workspace);await mkdir(sourceRoot);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'init','--quiet']);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--allow-empty','--quiet','-m','source']);
  const sourceSha=execFileSync('/usr/bin/git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  try {
    const request={tool:'fixture.read',path:'readme.md'};
    for (const evidenceDir of [workspace,root]) {
      await assert.rejects(()=>runSandboxedTool({request,workspace,sourceRoot,sourceSha,evidenceDir,imageId:id,readPaths:['readme.md']}),BrokerPolicyError);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});

test('source revision mismatch is rejected before Docker is invoked',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'showdar-source-revision-'));
  const workspace=path.join(root,'workspace');
  const evidenceDir=path.join(root,'evidence');
  const sourceRoot=path.join(root,'source');
  await mkdir(workspace);await mkdir(evidenceDir);await mkdir(sourceRoot);
  await writeFile(path.join(workspace,'README.md'),'fixture');
  execFileSync('/usr/bin/git',['-C',sourceRoot,'init','--quiet']);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--allow-empty','--quiet','-m','source']);
  try {
    await assert.rejects(()=>runSandboxedTool({
      request:{tool:'fixture.read',path:'README.md'},workspace,sourceRoot,evidenceDir,
      imageId:id,readPaths:['README.md'],sourceSha:'f'.repeat(40),
    }),error=>error instanceof BrokerPolicyError&&/revision mismatch/.test(error.message));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('dirty source checkout is rejected even when HEAD matches the requested SHA',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'showdar-dirty-source-'));
  const workspace=path.join(root,'fixture'),sourceRoot=path.join(root,'source'),evidenceDir=path.join(root,'evidence');
  await mkdir(workspace);await mkdir(sourceRoot);await mkdir(evidenceDir);
  await writeFile(path.join(workspace,'README.md'),'fixture');
  execFileSync('/usr/bin/git',['-C',sourceRoot,'init','--quiet']);
  execFileSync('/usr/bin/git',['-C',sourceRoot,'-c','user.name=Showdar Eval','-c','user.email=eval@example.invalid','commit','--allow-empty','--quiet','-m','source']);
  const sourceSha=execFileSync('/usr/bin/git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  await writeFile(path.join(sourceRoot,'uncommitted.txt'),'unbound source');
  try {
    await assert.rejects(()=>runSandboxedTool({request:{tool:'fixture.read',path:'README.md'},workspace,sourceRoot,evidenceDir,
      imageId:id,sourceSha,readPaths:['README.md']}),error=>error instanceof BrokerPolicyError&&/uncommitted changes/.test(error.message));
  } finally {await rm(root,{recursive:true,force:true});}
});
