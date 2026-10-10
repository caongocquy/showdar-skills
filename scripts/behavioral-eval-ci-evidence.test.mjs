import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCiEvidence, verifyCiEnvelope } from './behavioral-eval-ci-evidence.mjs';

const repo = {full_name:'caongocquy/showdar-skills',default_branch:'main'};
const run = {id:42,run_attempt:1,workflow_id:7,name:'Verify PR',event:'pull_request',
  path:'.github/workflows/verify-pr.yml@refs/pull/23/merge',conclusion:'success',
  repository:repo,head_repository:repo,head_sha:'a'.repeat(40),pull_requests:[{number:23,head:{sha:'a'.repeat(40)}}]};
const pull = {number:23,state:'open',head:{sha:run.head_sha,repo},base:{ref:'main',repo}};
const context = {GITHUB_REPOSITORY:repo.full_name,GITHUB_SHA:'b'.repeat(40),GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_run',GITHUB_RUN_ID:'43',GITHUB_RUN_ATTEMPT:'1',TRIGGER_RUN_ID:'42',TRIGGER_RUN_ATTEMPT:'1'};
const github = async resource => resource.startsWith('pulls') ? pull : resource.startsWith('actions/runs') ? run : {id:7,path:'.github/workflows/verify-pr.yml'};

test('model-free envelope binds source, trigger attempt and attester; integrity checked independently',async()=>{
  const dir = await mkdtemp(path.join(tmpdir(),'ci-attestation-'));
  try {
    const {evidence} = await createCiEvidence({repository:repo,workflow_run:run},dir,{context,github});
    assert.equal(evidence.behavioralStatus,'BLOCKED');
    assert.equal(evidence.sourceSha,run.head_sha);
    assert.deepEqual(await verifyCiEnvelope(dir,context,{github}),{status:'VERIFIED_CI_ONLY',behavioralStatus:'BLOCKED'});
    await assert.rejects(verifyCiEnvelope(dir,{...context,GITHUB_RUN_ATTEMPT:'2'},{github}));
    await writeFile(path.join(dir,'payload.json'),'tampered');
    await assert.rejects(verifyCiEnvelope(dir,context,{github}));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('forks, stale source, replay, wrong workflow and malicious events fail closed',async()=>{
  const dir = await mkdtemp(path.join(tmpdir(),'ci-denied-'));
  try {
    const event = {repository:repo,workflow_run:run};
    for (const bad of [
      {...run,conclusion:'failure'}, {...run,id:'42; echo injected'}, {...run,run_attempt:0},
      {...run,head_repository:{full_name:'attacker/fork'}}, {...run,pull_requests:[]},
      {...run,head_sha:'c'.repeat(40)}, {...run,path:'.github/workflows/evil.yml'},
    ]) await assert.rejects(createCiEvidence({...event,workflow_run:bad},dir,{context,github}));
    for (const key of ['GITHUB_REPOSITORY','GITHUB_SHA','GITHUB_REF','GITHUB_EVENT_NAME','GITHUB_RUN_ID']) {
      await assert.rejects(createCiEvidence(event,dir,{context:{...context,[key]:'untrusted'},github}));
    }
    for (const current of [{...run,run_attempt:2},{...run,workflow_id:8},{...run,head_sha:'c'.repeat(40)}]) {
      await assert.rejects(createCiEvidence(event,dir,{context,github:async r=>r.startsWith('actions/runs')?current:github(r)}));
    }
    for (const current of [{...pull,head:{...pull.head,sha:'c'.repeat(40)}},{...pull,head:{...pull.head,repo:{full_name:'attacker/fork'}}},
      {...pull,base:{ref:'develop',repo}},{...pull,state:'closed'}]) {
      await assert.rejects(createCiEvidence(event,dir,{context,github:async r=>r.startsWith('pulls')?current:github(r)}));
    }
    await assert.rejects(createCiEvidence(event,dir,{context,github:async()=>{throw new Error('API unavailable');}}));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('privileged workflow uses trusted SHA and never consumes PR code or artifacts',async()=>{
  const workflow = await readFile(new URL('../.github/workflows/behavioral-evidence-attestation.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('ref: $'+'{{ github.sha }}'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('--signer-digest "$TRUSTED_SHA"'));
  assert.ok(workflow.includes('--deny-self-hosted-runners'));
  assert.doesNotMatch(workflow,/head_sha|head_branch|pull_request_target|npm |cache@|download-artifact@/);
  assert.equal((workflow.match(/id-token: write/g) ?? []).length,1);
  assert.ok(workflow.includes('gh run download "$ATTESTER_RUN_ID"'));
});


test('independent verifier rejects source/PR tampering with a recomputed digest and stale/fork metadata',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ci-independent-'));
  try {
    const {payload}=await createCiEvidence({repository:repo,workflow_run:run},dir,{context,github});
    for (const changed of [{...payload,sourceSha:'c'.repeat(40)},{...payload,pullRequest:24}]) {
      const bytes=Buffer.from(JSON.stringify(changed));
      await writeFile(path.join(dir,'payload.json'),bytes);
      await writeFile(path.join(dir,'evidence.json'),JSON.stringify({...changed,
        artifactSha256:createHash('sha256').update(bytes).digest('hex')}));
      await assert.rejects(verifyCiEnvelope(dir,context,{github}));
    }
    const bytes=Buffer.from(JSON.stringify(payload));
    await writeFile(path.join(dir,'payload.json'),bytes);
    await writeFile(path.join(dir,'evidence.json'),JSON.stringify({...payload,
      artifactSha256:createHash('sha256').update(bytes).digest('hex')}));
    for (const bad of [{...run,run_attempt:2},{...run,head_repository:{full_name:'attacker/fork'}},
      {...run,head_sha:'c'.repeat(40)},{...run,path:'.github/workflows/evil.yml'}]) {
      await assert.rejects(verifyCiEnvelope(dir,context,{github:async r=>r.startsWith('actions/runs')?bad:github(r)}));
    }
    await assert.rejects(verifyCiEnvelope(dir,context,{github:async()=>{throw new Error('API unavailable');}}));
  } finally {await rm(dir,{recursive:true,force:true});}
});
