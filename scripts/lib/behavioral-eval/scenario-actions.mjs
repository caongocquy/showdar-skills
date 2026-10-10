import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorkflowState, skipStage } from '../../../src/workflow-state.js';
import { assertSourceRevision, getSandboxObservation, runSandboxedTool } from './sandbox-tool-runtime.mjs';

const exec=promisify(execFile);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const observations=new WeakMap();
const within=(root,child)=>child===root || child.startsWith(root+path.sep);
const denied=reason=>{throw new Error('Scenario action denied: '+reason);};
const exact=(value,keys)=>value && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()) && keys.every(key=>typeof value[key]==='string');

export function getScenarioActionObservation(result) {
  const observation=observations.get(result);
  if (!observation) return null;
  if (hash(JSON.stringify(result))!==observation.resultSha256) denied('action result was modified');
  return structuredClone(observation);
}

/** Read pinned skill data and persist a real lifecycle skip. Neither action grants mutation authority. */
export async function createScenarioActions({sourceRoot,sourceSha,workspace,evidenceDir,imageId,imageApproval,
  installedSkills=[],approvalFiles={},decisionArtifact='artifacts/decision.json'}={}) {
  const skills=[...installedSkills];const approvals=structuredClone(approvalFiles);
  const [source,fixture,evidence]=await Promise.all([realpath(sourceRoot),realpath(workspace),realpath(evidenceDir)]);
  if ([source,fixture,evidence].some((root,i,roots)=>roots.some((other,j)=>i!==j && within(root,other)))) denied('source, fixture and evidence must be separate');
  if (decisionArtifact!=='artifacts/decision.json' || skills.some(skill=>!/^showdar-[a-z-]+$/.test(skill))) denied('unsupported action capability');
  await assertSourceRevision(source,sourceSha);
  let selected=null;
  let workflow=createWorkflowState('showdar-feature',{selectedStages:['showdar-understand','showdar-build','showdar-test','showdar-review']}).value;
  let busy=false;
  async function serialized(fn) {
    if (busy) denied('concurrent action');
    busy=true;
    try {return await fn();} finally {busy=false;}
  }
  async function record(request,result,observation) {
    const bound={schemaVersion:1,kind:'scenario-action-observation',sourceSha,...observation,
      requestSha256:hash(JSON.stringify(request)),
      resultSha256:hash(JSON.stringify(result)),behavioralStatus:'BLOCKED'};
    await writeFile(path.join(evidence,'action-'+randomUUID()+'.json'),JSON.stringify(bound,null,2),{flag:'wx',mode:0o600});
    observations.set(result,bound);
    return result;
  }
  return Object.freeze({
    requestApproval(request) {return serialized(async()=>{
      if (!exact(request,['scope','message']) || request.scope!=='already-approved-spec' || !request.message.trim() || request.message.length>4096) denied('approval request capability');
      await assertSourceRevision(source,sourceSha);
      return record({tool:'interaction.approval',...request},{content:'Approval request recorded; no approval granted'},
        {event:{kind:'approval_requested',attributes:{scope:request.scope}},message:request.message});
    });},
    changeScope(request) {return serialized(async()=>{
      if (!exact(request,['decision','message']) || request.decision!=='new-requirements' || !request.message.trim() || request.message.length>4096) denied('scope change capability');
      await assertSourceRevision(source,sourceSha);
      return record({tool:'interaction.scope',...request},{content:'Scope change proposal recorded; no mutation authority granted'},
        {event:{kind:'scope_changed',attributes:{decision:request.decision}},message:request.message});
    });},
    selectSkill(request) {return serialized(async()=>{
      if (!exact(request,['skill']) || !skills.includes(request.skill)) denied('skill capability');
      await assertSourceRevision(source,sourceSha);
      const relative=`skills/${request.skill}/SKILL.md`;
      const options={env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:3000,maxBuffer:65536};
      const mode=await exec('/usr/bin/git',['-C',source,'ls-tree','--format=%(objectmode)',sourceSha,'--',relative],options);
      if (mode.stdout.trim()!=='100644' && mode.stdout.trim()!=='100755') denied('skill must be a regular file in the pinned commit');
      const blob=await exec('/usr/bin/git',['-C',source,'show',`${sourceSha}:${relative}`],options);
      await assertSourceRevision(source,sourceSha);
      const result={content:blob.stdout};
      const observed=await record({tool:'skill.select',...request},result,{event:{kind:'skill_selected',attributes:{skill:request.skill}},
        sourcePath:relative,skillSha256:hash(blob.stdout)});
      selected=request.skill;
      return observed;
    });},
    skipRefinement(request) {return serialized(async()=>{
      if (!exact(request,['approvalPath','approvalSha256','rationale']) || selected!=='showdar-build' ||
          !request.rationale.trim() || request.rationale.length>4096 || !/^[a-f0-9]{64}$/.test(request.approvalSha256)) denied('invalid skip or skill was not selected');
      if (request.approvalPath.includes('\\') || request.approvalPath.includes('\0') || path.isAbsolute(request.approvalPath) ||
          request.approvalPath.split('/').some(part=>!part || part==='.' || part==='..') ||
          !Object.hasOwn(approvals,request.approvalPath) || approvals[request.approvalPath]!==request.approvalSha256) denied('unbound approval source');
      await assertSourceRevision(source,sourceSha);
      let current=fixture;
      for (const part of request.approvalPath.split('/')) {
        current=path.join(current,part);
        if ((await lstat(current)).isSymbolicLink()) denied('approval symlink');
      }
      const info=await lstat(current);
      if (!info.isFile() || info.size>65536) denied('approval must be a bounded regular file');
      const approval=await readFile(current);
      if (approval.length>65536 || hash(approval)!==request.approvalSha256) denied('approval bytes changed');
      await assertSourceRevision(source,sourceSha);
      // The observed skip is a real state transition; its qualitative justification remains a human-review claim.
      const next=skipStage(workflow,'showdar-requirements',{reason:'behavior-defined',policy:'behavior-defined',
        evidence:[{kind:'behavior-defined',quality:'observed',source:'showdar-build'}]});
      const content=JSON.stringify({decision:'skip-refinement',sourceSha,approvalSource:{path:request.approvalPath,sha256:request.approvalSha256},
        claims:{rationale:request.rationale,requiresIndependentHumanReview:true},workflow:next});
      const written=await runSandboxedTool({sourceRoot:source,sourceSha,workspace:fixture,evidenceDir:evidence,imageId,imageApproval,
        request:{tool:'artifact.write',path:decisionArtifact,content},writePaths:[decisionArtifact]});
      const receipt=getSandboxObservation(written);
      if (!receipt?.artifact || receipt.artifact.sha256!==hash(content)) denied('decision artifact integrity');
      const result=await record({tool:'refinement.skip',...request},{content},{event:{kind:'decision_recorded',attributes:{decision:'skip-refinement'}},
        approvalSource:{path:request.approvalPath,sha256:request.approvalSha256},artifact:receipt.artifact,
        toolReceiptSha256:hash(JSON.stringify(receipt)),toolReceipt:receipt,workflowRevision:next.revision});
      workflow=next;
      return result;
    });},
  });
}
