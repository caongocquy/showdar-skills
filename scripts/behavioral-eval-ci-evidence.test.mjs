import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCiEvidence } from './behavioral-eval-ci-evidence.mjs';
import { assertEvidenceBinding } from './lib/behavioral-eval/trusted-evidence.mjs';

const event={repository:{full_name:'caongocquy/showdar-skills'},workflow_run:{
  id:38016557871,name:'Verify PR',event:'pull_request',path:'.github/workflows/verify-pr.yml@refs/pull/23/merge',conclusion:'success',
  head_sha:'a'.repeat(40),pull_requests:[{number:23,head:{sha:'a'.repeat(40)}}],
}};

test('trusted workflow evidence is bound to the completed source run and is never behavioral PASS',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'showdar-ci-evidence-'));
  const previous=process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY='caongocquy/showdar-skills';
  try {
    const {evidence}=await createCiEvidence(event,dir);
    const payload=await readFile(path.join(dir,'payload.json'));
    assert.equal(evidence.sourceSha,event.workflow_run.head_sha);
    assert.equal(evidence.workflowRunId,String(event.workflow_run.id));
    assert.equal(evidence.scenarioId,'TASK-002-CI');
    assert.equal(evidence.modelIdentity,'none (model-free CI)');
    assert.equal(evidence.artifactSha256,createHash('sha256').update(payload).digest('hex'));
    assert.equal(evidence.behavioralStatus,'BLOCKED');
    assert.throws(()=>assertEvidenceBinding(evidence,{...evidence,rubricIds:[],requiredEvents:[]},payload,Buffer.from('')),/Invalid evidence envelope/);
  } finally {
    if(previous===undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY=previous;
    await rm(dir,{recursive:true,force:true});
  }
});

test('failed, replayed or mismatched workflow metadata cannot mint evidence',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'showdar-ci-evidence-invalid-'));
  const previous=process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY='caongocquy/showdar-skills';
  try {
    for(const bad of [
      {...event,workflow_run:{...event.workflow_run,conclusion:'failure'}},
      {...event,workflow_run:{...event.workflow_run,head_sha:'bad'}},
      {...event,repository:{full_name:'attacker/repo'}},
    ]) await assert.rejects(()=>createCiEvidence(bad,path.join(dir,String(Math.random()))),/Untrusted or incomplete/);
  } finally {
    if(previous===undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY=previous;
    await rm(dir,{recursive:true,force:true});
  }
});
