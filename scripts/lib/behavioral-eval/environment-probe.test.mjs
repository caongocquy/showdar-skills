import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from './github-provenance.mjs';
import * as probe from './environment-probe.mjs';
const revision='a'.repeat(40);
const context={GITHUB_REPOSITORY:'caongocquy/showdar-skills',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:revision,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
const environment={id:42,name:'showdar-paid-capture',can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{login:'caongocquy',id:50620260,type:'User'}}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
const policies={total_count:1,branch_policies:[{id:17,name:'main'}]};
const run={id:123,run_attempt:1,head_sha:revision,head_branch:'main',event:'workflow_dispatch',status:'in_progress',path:'.github/workflows/behavioral-environment-probe.yml',repository:{full_name:context.GITHUB_REPOSITORY},head_repository:{full_name:context.GITHUB_REPOSITORY}};
function api(t,state){t.mock.method(globalThis,'fetch',async(url,init)=>{
 assert.equal(init.headers.Authorization,'Bearer fixture-token');assert.ok(url.startsWith('https://api.github.com/repos/caongocquy/showdar-skills/'));
 return new Response(JSON.stringify(url.endsWith('/approvals')?state.approvals:url.endsWith('/attempts/1')?state.run:url.endsWith('/deployment-branch-policies')?state.policies:url.endsWith('/git/matching-refs/tags/main')?state.tags:state.environment));
});}
function state(){return {environment:structuredClone(environment),policies:structuredClone(policies),run:structuredClone(run),tags:[],approvals:[]};}
function approval(binding){return {state:'approved',user:{login:'caongocquy',id:50620260,type:'User'},environments:[{id:42,name:environment.name}],comment:'SHOWDAR-ENVIRONMENT-PROBE/1\n'+digest(JSON.stringify(binding))};}

test('secret-free probe binds exact native main run and current protection policy without minting paid authority',async t=>{
 assert.equal(typeof probe.prepareEnvironmentProbe,'function');const s=state();api(t,s);
 const binding=await probe.prepareEnvironmentProbe('fixture-token',{context});
 assert.equal(binding.paidAuthorization,false);assert.equal(binding.sourceRef,'refs/heads/main');assert.equal(binding.environment.deploymentPolicyId,17);assert.equal(binding.environment.observedPolicyType,null);
 s.approvals=[approval(binding)];const proof=await probe.verifyEnvironmentProbe('fixture-token',{context});
 assert.equal(proof.status,'PASS');assert.equal(proof.paidAuthorization,false);assert.equal(proof.bindingSha256,digest(JSON.stringify(binding)));
 s.run={...run,status:'completed',conclusion:'success'};await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}));
 assert.equal((await probe.verifyEnvironmentProbe('fixture-token',{context,completed:true})).status,'PASS');
 s.run.conclusion='failure';await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context,completed:true}));
});
test('withheld, rejected, forged, wrong-digest and paid-capture approvals cannot pass the probe',async t=>{
 assert.equal(typeof probe.prepareEnvironmentProbe,'function');const s=state();api(t,s);const binding=await probe.prepareEnvironmentProbe('fixture-token',{context});
 const good=approval(binding);
 for(const approvals of [[],[good,good],[{...good,state:'rejected'}],[{...good,user:{login:'forged',id:50620260,type:'User'}}],[{...good,comment:'wrong digest'}],[{...good,comment:'SHOWDAR-CAPTURE-AUTH/2\n'+digest(JSON.stringify(binding))}],[{...good,environments:[{id:43,name:environment.name}]}]]){
  s.approvals=approvals;await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}),/approval/);
 }
});
test('probe rejects fork, tag, rerun, stale signer/policy and same-name tag despite valid owner review',async t=>{
 assert.equal(typeof probe.prepareEnvironmentProbe,'function');const s=state();api(t,s);const binding=await probe.prepareEnvironmentProbe('fixture-token',{context});s.approvals=[approval(binding)];
 for(const delta of [{GITHUB_REF:'refs/heads/unauthorized'},{GITHUB_REF:'refs/tags/main'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_REPOSITORY:'attacker/fork'}])await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context:{...context,...delta}}));
 for(const delta of [{head_sha:'b'.repeat(40)},{head_repository:{full_name:'attacker/fork'}},{run_attempt:2},{path:'.github/workflows/behavioral-live-capture.yml'}]){
  s.run={...run,...delta};await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}));
 }
 s.run={...run};s.policies.branch_policies[0].id=18;await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}),/approval/);
 s.policies=structuredClone(policies);s.tags=[{ref:'refs/tags/main'}];await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}),/tag/);
 s.tags=[];s.environment.can_admins_bypass=undefined;await assert.rejects(probe.verifyEnvironmentProbe('fixture-token',{context}),/protection/);
});
test('probe workflow has no model credentials, OIDC, Responses imports or privileged PR checkout',async()=>{
 const workflow=await readFile(new URL('../../../.github/workflows/behavioral-environment-probe.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/secrets\.|OPENAI|id-token:|attestations: write|pull_request_target|workflow_run/);
 assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);assert.match(workflow,/persist-credentials: false/);
 const negative=workflow.slice(workflow.indexOf('  reject-unauthorized-ref:'));
 assert.match(negative,/github.ref != 'refs\/heads\/main'/);assert.match(negative,/permissions: \{\}/);assert.match(negative,/UNAUTHORIZED_ENVIRONMENT_JOB_STARTED/);
 assert.doesNotMatch(negative,/checkout|uses:|secrets\.|\$\{\{ inputs/);
 for(const file of ['environment-probe.mjs','paid-authorization.mjs','github-provenance.mjs']){
  const source=await readFile(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"][^'"]*(?:responses-transport|live-producer|responses-runner)['"]|api\.openai\.com|OPENAI_API_KEY/);
 }
 const cli=await readFile(new URL('../../../scripts/behavioral-eval-environment-probe.mjs',import.meta.url),'utf8');assert.doesNotMatch(cli,/Responses|OPENAI|secrets|produceLiveCapture|reservePaidCapture|consumePaidResponse/);
});
