import test from 'node:test';
import assert from 'node:assert/strict';
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
  await mkdir(fixture);await mkdir(evidence);
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
      await assert.rejects(()=>runSandboxedTool({request,workspace:fixture,evidenceDir:evidence,imageId:id,
        readPaths:['README.md'],writePaths:['artifacts/a.txt']}),BrokerPolicyError);
    }
    await writeFile(path.join(fixture,'README.md'),'fixture');
    await symlink('/etc/passwd',path.join(fixture,'unsafe.txt'));
    await assert.rejects(()=>runSandboxedTool({request:{tool:'fixture.read',path:'unsafe.txt'},
      workspace:fixture,evidenceDir:evidence,imageId:id,readPaths:['unsafe.txt']}),BrokerPolicyError);
    const legit=prepareBrokerCommand({tool:'git.status'},{workspace:fixture});
    assert.deepEqual(legit.args,['status','--short','--branch']);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('evidence cannot be mounted within, or as ancestor of, agent fixture',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'showdar-offline-boundary-'));
  const workspace=path.join(root,'workspace');
  await mkdir(workspace);
  try {
    const request={tool:'fixture.read',path:'readme.md'};
    for (const evidenceDir of [workspace,root]) {
      await assert.rejects(()=>runSandboxedTool({request,workspace,evidenceDir,imageId:id,readPaths:['readme.md']}),BrokerPolicyError);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
