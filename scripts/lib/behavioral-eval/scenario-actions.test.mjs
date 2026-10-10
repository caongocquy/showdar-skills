import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createScenarioActions, getScenarioActionObservation } from './scenario-actions.mjs';
import { createRunnerCapture } from './runner-capture.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const git=(cwd,args)=>execFileSync('/usr/bin/git',['-C',cwd,...args],{encoding:'utf8'});
async function fixture(fn) {
  const root=await mkdtemp(path.join(tmpdir(),'scenario-actions-'));
  const sourceRoot=path.join(root,'source'),workspace=path.join(root,'fixture'),evidenceDir=path.join(root,'evidence');
  const skillDir=path.join(sourceRoot,'skills/showdar-build');
  await mkdir(skillDir,{recursive:true});await mkdir(workspace);await mkdir(evidenceDir);
  await writeFile(path.join(skillDir,'SKILL.md'),'Pinned skill data, never executable code.');
  const approval='Generic preapproved scope for hook contract testing only.';
  await writeFile(path.join(workspace,'APPROVAL.md'),approval);
  git(sourceRoot,['init','--quiet']);git(sourceRoot,['add','skills/showdar-build/SKILL.md']);
  git(sourceRoot,['-c','user.name=Hook Test','-c','user.email=test@example.invalid','commit','--quiet','-m','generic skill fixture']);
  const sourceSha=git(sourceRoot,['rev-parse','HEAD']).trim();
  const dirs={sourceRoot,sourceSha,workspace,evidenceDir,installedSkills:['showdar-build'],approvalFiles:{'APPROVAL.md':hash(approval)}};
  try {await fn(dirs);} finally {await rm(root,{recursive:true,force:true});}
}
const skip=dirs=>({approvalPath:'APPROVAL.md',approvalSha256:dirs.approvalFiles['APPROVAL.md'],rationale:'The supplied scope is already defined.'});

test('pinned skill read creates a runner receipt; forged, altered, mismatched and replayed actions are denied',async()=>fixture(async dirs=>{
  const actions=await createScenarioActions(dirs);
  const request={skill:'showdar-build'};
  const result=await actions.selectSkill(request);
  assert.match(result.content,/Pinned skill data/);
  const observation=getScenarioActionObservation(result);
  assert.equal(observation.sourceSha,dirs.sourceSha);
  assert.equal(observation.skillSha256,hash(result.content));
  assert.equal(observation.behavioralStatus,'BLOCKED');
  const binding={directory:dirs.evidenceDir,scenarioId:'HOOK-CONTRACT',sourceSha:dirs.sourceSha,modelIdentity:'none'};
  const capture=createRunnerCapture(binding);
  const typed={tool:'skill.select',...request};
  assert.equal(getScenarioActionObservation(structuredClone(result)),null);
  assert.throws(()=>capture.observeAction(typed,{...result,observedBy:'host-scenario-runtime'}),/binding/);
  assert.throws(()=>capture.observeAction({...typed,skill:'showdar-security'},result),/binding/);
  assert.throws(()=>createRunnerCapture({...binding,sourceSha:'a'.repeat(40)}).observeAction(typed,result),/binding/);
  capture.observeAction(typed,result);
  assert.throws(()=>capture.observeAction(typed,result),/replay/);
  assert.throws(()=>createRunnerCapture(binding).observeAction(typed,result),/replay/);
  const saved=await capture.finish(true);
  const trace=JSON.parse(await readFile(saved.tracePath));
  assert.equal(trace.events[0].kind,'skill_selected');
  assert.equal(trace.events[0].evidence,'host-scenario-runtime');
  assert.equal(trace.execution.agentLaunched,false);
  assert.equal(trace.behavioralStatus,'BLOCKED');
  result.content='forged';assert.throws(()=>getScenarioActionObservation(result),/modified/);
}));

test('skill capabilities, pinned source cleanliness, concurrent calls and symlink skill blobs fail closed',async()=>fixture(async dirs=>{
  const actions=await createScenarioActions(dirs);
  for(const request of [{skill:'../outside'},{skill:'showdar-security'},{skill:'showdar-build',trusted:true}]) {
    await assert.rejects(actions.selectSkill(request),/capability/);
  }
  const first=actions.selectSkill({skill:'showdar-build'});
  await assert.rejects(actions.selectSkill({skill:'showdar-build'}),/concurrent/);await first;
  await assert.rejects(createScenarioActions({...dirs,sourceSha:'b'.repeat(40)}),/revision mismatch/);
  await assert.rejects(createScenarioActions({...dirs,evidenceDir:dirs.workspace}),/separate/);
  await writeFile(path.join(dirs.sourceRoot,'dirty'),'dirty');
  await assert.rejects(actions.selectSkill({skill:'showdar-build'}),/uncommitted/);
  await rm(path.join(dirs.sourceRoot,'dirty'));
  const file=path.join(dirs.sourceRoot,'skills/showdar-build/SKILL.md');
  await rm(file);await symlink('/etc/passwd',file);
  git(dirs.sourceRoot,['add','skills/showdar-build/SKILL.md']);
  git(dirs.sourceRoot,['-c','user.name=Hook Test','-c','user.email=test@example.invalid','commit','--quiet','-m','symlink fixture']);
  const linked=await createScenarioActions({...dirs,sourceSha:git(dirs.sourceRoot,['rev-parse','HEAD']).trim()});
  await assert.rejects(linked.selectSkill({skill:'showdar-build'}),/regular file/);
}));

test('skip requires selected skill and exact immutable approval; traversal, symlinks and forged approvals never reach Docker',async()=>fixture(async dirs=>{
  const actions=await createScenarioActions(dirs);
  await assert.rejects(actions.skipRefinement(skip(dirs)),/selected/);
  await actions.selectSkill({skill:'showdar-build'});
  for(const request of [{...skip(dirs),approvalPath:'../APPROVAL.md'},{...skip(dirs),approvalSha256:'c'.repeat(64)},
    {...skip(dirs),rationale:''},{...skip(dirs),trusted:true}]) await assert.rejects(actions.skipRefinement(request),/invalid|unbound/);
  await writeFile(path.join(dirs.workspace,'APPROVAL.md'),'changed approval');
  await assert.rejects(actions.skipRefinement(skip(dirs)),/bytes changed/);
  await rm(path.join(dirs.workspace,'APPROVAL.md'));await symlink('/etc/passwd',path.join(dirs.workspace,'APPROVAL.md'));
  await assert.rejects(actions.skipRefinement(skip(dirs)),/symlink/);
  await rm(path.join(dirs.workspace,'APPROVAL.md'));await writeFile(path.join(dirs.workspace,'APPROVAL.md'),'x'.repeat(65537));
  await assert.rejects(actions.skipRefinement(skip(dirs)),/bounded/);
}));
