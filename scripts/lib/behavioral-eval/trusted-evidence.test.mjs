import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyTrustedEvidence } from './trusted-evidence.mjs';

const suite=JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json',import.meta.url),'utf8'));
const scenario=suite.scenarios.find(item=>item.id==='BRAIN-001');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function setup() {
  const root=await mkdtemp(path.join(tmpdir(),'showdar-trusted-evidence-'));
  const bin=path.join(root,'bin');await mkdir(bin);
  const gh=path.join(bin,'gh');
  await writeFile(gh,`#!/usr/bin/env node\nconst {readFileSync}=require('node:fs');\nconst {createHash}=require('node:crypto');\nconst args=process.argv.slice(2);\nif(args[0]!=='attestation'||args[1]!=='verify'||!args.includes('--repo')||!args.includes('--source-ref')||!args.includes('refs/heads/main')||!args.includes('--signer-workflow')) process.exit(3);\nconst digest=createHash('sha256').update(readFileSync(args[2])).digest('hex');\nprocess.stdout.write(JSON.stringify([{verificationResult:{statement:{subject:[{digest:{sha256:digest}}]}}}]));\n`);
  await chmod(gh,0o755);
  const evidencePath=path.join(root,'evidence.json'),artifactPath=path.join(root,'artifact.bin'),tracePath=path.join(root,'trace.json');
  const artifactBytes=Buffer.from('reviewable output'),sourceSha='a'.repeat(40),workflowRunId='38016557871',pullRequest=23;
  const trace=Buffer.from(JSON.stringify({schemaVersion:1,scenarioId:scenario.id,sourceSha,complete:true,
    events:scenario.oracle.required.map(({kind,attributes})=>({kind,attributes}))}));
  const evidence={schemaVersion:1,scenarioId:scenario.id,sourceSha,modelIdentity:'fixture-model',workflowRunId,pullRequest,
    artifactSha256:sha(artifactBytes),traceSha256:sha(trace),rubricIds:scenario.oracle.rubric.map(rule=>rule.id),
    requiredEvents:scenario.oracle.required.map(event=>event.id),execution:{kind:'responses-live',agentLaunched:true},
    behavioralStatus:'READY_FOR_REVIEW'};
  const evidenceBytes=Buffer.from(JSON.stringify(evidence));
  await Promise.all([writeFile(artifactPath,artifactBytes),writeFile(tracePath,trace),writeFile(evidencePath,evidenceBytes)]);
  const grades=Object.fromEntries(evidence.rubricIds.map(id=>[id,'PASS']));
  const review={state:'APPROVED',commit_id:sourceSha,author_association:'MEMBER',user:{login:'reviewer',type:'User'},
    body:'SHOWDAR-RUBRIC/1\n'+JSON.stringify({decision:'APPROVED',evidenceSha256:sha(evidenceBytes),
      artifactSha256:evidence.artifactSha256,traceSha256:evidence.traceSha256,sourceSha,scenarioId:scenario.id,
      modelIdentity:evidence.modelIdentity,workflowRunId,grades})};
  const base=`https://api.github.com/repos/caongocquy/showdar-skills`;
  const run={id:Number(workflowRunId),head_sha:sourceSha,conclusion:'success',event:'pull_request',
    path:'.github/workflows/verify-pr.yml@refs/pull/23/merge',actor:{login:'runner'},
    pull_requests:[{number:pullRequest,head:{sha:sourceSha}}]};
  const pull={number:pullRequest,head:{sha:sourceSha},user:{login:'author'}};
  const oldPath=process.env.PATH;process.env.PATH=`${bin}:${oldPath ?? ''}`;
  const oldFetch=globalThis.fetch;
  let api={run,pull,reviews:[review]};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value===`${base}/actions/runs/${workflowRunId}`) return {ok:true,json:async()=>api.run};
    if(value===`${base}/pulls/${pullRequest}`) return {ok:true,json:async()=>api.pull};
    if(value.startsWith(`${base}/pulls/${pullRequest}/reviews`)) return {ok:true,headers:{get:()=>api.reviewNext?'next; rel="next"':null},json:async()=>api.reviews};
    return {ok:false,status:404,json:async()=>({})};
  };
  const expected={sourceSha,scenarioId:scenario.id,modelIdentity:evidence.modelIdentity,workflowRunId,
    pullRequest,artifactSha256:evidence.artifactSha256,traceSha256:evidence.traceSha256};
  return {root,evidencePath,artifactPath,tracePath,api,setApi:value=>{api=value;},expected,
    cleanup:async()=>{globalThis.fetch=oldFetch;if(oldPath===undefined) delete process.env.PATH;else process.env.PATH=oldPath;await rm(root,{recursive:true,force:true});}};
}

async function verify(state) {
  return verifyTrustedEvidence({...state,repository:'caongocquy/showdar-skills',
    signerWorkflow:'caongocquy/showdar-skills/.github/workflows/behavioral-evidence-attestation.yml',expected:state.expected,token:'test-token'});
}

test('attestation, source/run binding, captured events, artifact integrity and human grading pass together',async()=>{
  const state=await setup();
  try {
    const result=await verify(state);
    assert.deepEqual(result,{status:'PASS',reviewer:'reviewer'});
  } finally {await state.cleanup();}
});

test('tampering, source mismatch and replay block before rubric grading',async()=>{
  for(const mode of ['artifact','source','run','reviewNext']) {
    const state=await setup();
    try {
      if(mode==='artifact') await writeFile(state.artifactPath,'tampered');
      if(mode==='source') state.expected.sourceSha='b'.repeat(40);
      if(mode==='run') state.setApi({...state.api,run:{...state.api.run,id:38016557870}});
      if(mode==='reviewNext') state.setApi({...state.api,reviewNext:true});
      assert.equal((await verify(state)).status,'BLOCKED',mode);
    } finally {await state.cleanup();}
  }
});

test('forged, bot, self-authored, stale and mismatched approvals never pass',async()=>{
  for(const change of [
    review=>({...review,user:{login:'runner',type:'User'}}),
    review=>({...review,user:{login:'reviewer',type:'Bot'}}),
    review=>({...review,author_association:'NONE'}),
    review=>({...review,state:'CHANGES_REQUESTED'}),
    review=>({...review,commit_id:'b'.repeat(40)}),
    review=>({...review,body:'SHOWDAR-RUBRIC/1\n{"decision":"APPROVED"}'}),
    review=>({...review,body:'forged approval'}),
  ]) {
    const state=await setup();
    try {
      state.setApi({...state.api,reviews:[change(state.api.reviews[0])]});
      assert.equal((await verify(state)).status,'BLOCKED');
    } finally {await state.cleanup();}
  }
});

test('missing authentication, unverifiable attestations and missing artifacts block',async()=>{
  const noAuth=await verifyTrustedEvidence({repository:'caongocquy/showdar-skills',expected:{}});
  assert.equal(noAuth.status,'BLOCKED');
  const state=await setup();
  try {
    await rm(state.tracePath);
    assert.equal((await verify(state)).status,'BLOCKED');
  } finally {await state.cleanup();}
});
