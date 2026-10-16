import {writeFileSync,unlinkSync,realpathSync} from 'node:fs';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,lstat,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import {createSourceBinding} from './source-binding.mjs';
import {createBrainActions,getBrainObservation} from './brain-actions.mjs';
import {createScenarioActions} from '../scenario-actions.mjs';
import {assertSourceRevision,runSandboxedTool,getSandboxObservation,getPersistedReceipt} from './sandbox-tool-runtime.mjs';
export const DATASET_SHA='2fef414af08c69191048a99001b05c02af727ce41fbd7610afe3812904302560';
export const MANIFEST_SHA='92a73a09f10a01ea3190c57a9caf63ca839e5a744faeb090d92c24bfe65aa47f';
const dataset=new URL('./adopted-v2/',import.meta.url);
export const hash=b=>createHash('sha256').update(b).digest('hex');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const observations=new WeakMap();
export function getV2Observation(result){const o=observations.get(result);if(!o)return null;if(hash(JSON.stringify(result))!==o.resultSha256)throw Error('Modified action result');return structuredClone(o);}
export async function createV2Actions(options){
 options=Object.freeze({...options,installedSkills:[...options.installedSkills]});
 if(!['BRAIN-002','BRAIN-003'].includes(options.scenarioId))throw Error('Unsupported v2 scenario');
 await createScenarioActions(options); // Original pinned-source and disjoint-root authorization.
 const suiteBytes=await readFile(new URL('scenarios.json',dataset)),manifestBytes=await readFile(new URL('dataset-manifest.json',dataset));
 if(hash(suiteBytes)!==DATASET_SHA||hash(manifestBytes)!==MANIFEST_SHA)throw Error('Adopted identity changed');
 const suite=JSON.parse(suiteBytes),manifest=JSON.parse(manifestBytes),contractsBytes=await readFile(new URL('runner-event-contracts.json',dataset));
 if(hash(contractsBytes)!==manifest.contractsSha256)throw Error('Contract identity changed');
 const contracts=JSON.parse(contractsBytes),scenario=suite.scenarios.find(c=>c.id===options.scenarioId),template=suite.fixtureTemplates[scenario.fixture.template];
 if(!equal(options.installedSkills,scenario.installedSkills))throw Error('Skill authorization mismatch');
 const workspace=await realpath(options.workspace),evidence=await realpath(options.evidenceDir);
 if(options.authoritativeUserTurn!==scenario.prompt)throw Error('Exact runner-owned user turn required');
 const sourceSha=hash(template.files['docs/spec-draft.md']);
 const oldBinding=await createSourceBinding({workspace,sourcePath:'docs/spec-draft.md',expectedSha256:sourceSha});
 const sourceDraft=Object.freeze({datasetSha256:DATASET_SHA,scenarioId:scenario.id,path:'docs/spec-draft.md',sha256:sourceSha,sessionBindingId:oldBinding.schema.properties.bindingId.const});
 const userAnswer=Object.freeze({userTurnSha256:hash(options.authoritativeUserTurn),sessionBindingId:randomBytes(32).toString('hex')});
 const legacy=scenario.id==='BRAIN-002'?await createBrainActions({...options,draftSha256:sourceSha}):null;
 const persisted=[];const key=randomBytes(32),tracked=new Map(),events=[],receipts=[];let phase='initial',revision=0,questionId,decisionId,target,busy=false,sealed=false,poisoned=false;
 const nonce=()=>randomBytes(32).toString('hex');
 const ajv=new Ajv({strict:true,allErrors:true,coerceTypes:false,removeAdditional:false,useDefaults:false});
 const answerText=scenario.id==='BRAIN-003'?'missing seatCount should show an error.':null;
 if(answerText&&!options.authoritativeUserTurn.includes(answerText))throw Error('Answer span mismatch');
 // Readiness is an explicit caller claim; content semantics require independent review.
 const validation=Object.freeze({mechanicalAuthorization:'PASS',readinessClaim:'CALLER_REPORTED',independentSemanticCompleteness:'NOT_EVALUATED',rubricVerdict:'UNOBSERVABLE'});
 const constObject=(schema,value)=>{const copy=structuredClone(schema);for(const [k,v]of Object.entries(value))copy.properties[k].const=v;return copy;};
 function tools(){return contracts.actions.filter(a=>a.scenarioId===scenario.id).map(a=>{
  const schema=structuredClone(a.inputSchema);schema.properties.sourceDraft=constObject(schema.properties.sourceDraft,sourceDraft);
  if(schema.properties.userAnswer)schema.properties.userAnswer=constObject(schema.properties.userAnswer,userAnswer);
  if(schema.properties.answerText)schema.properties.answerText.const=answerText;
  if(schema.properties.approvalTarget&&target)schema.properties.approvalTarget=constObject(schema.properties.approvalTarget,target);
  let description='Explicit local v2 action; no approval or production authority. sourceDraft='+JSON.stringify(sourceDraft);
  if(schema.properties.userAnswer)description+=' userAnswer='+JSON.stringify(userAnswer);
  if(schema.properties.content)description+=' Supply the actual bounded r2 brief as content, including Markdown if desired. Bytes are preserved; no content format or literal wording is imposed. Authorization and artifact integrity do not independently verify semantic completeness or approval.';
  return {name:a.proposedToolName,description,inputSchema:schema};
 });}
 async function safeFile(root,relative){let current=root;if((await lstat(root)).isSymbolicLink())throw Error('Root symlink');for(const part of relative.split('/')){if(!part||part==='.'||part==='..')throw Error('Traversal');current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('Path symlink');}const stat=await lstat(current);if(!stat.isFile()||stat.size>1024*1024)throw Error('File bound');return readFile(current);}
 async function check(){
  if(sealed||poisoned)throw Error('Sealed/poisoned session');
  if(await realpath(options.workspace)!==workspace||await realpath(options.evidenceDir)!==evidence)throw Error('Root changed');
  try{for(const binding of persisted)await binding.verify();}catch(error){poisoned=true;throw error;}
  await assertSourceRevision(options.sourceRoot,options.sourceSha);
  if(hash(await readFile(new URL('scenarios.json',dataset)))!==DATASET_SHA||hash(await readFile(new URL('dataset-manifest.json',dataset)))!==MANIFEST_SHA||hash(await readFile(new URL('runner-event-contracts.json',dataset)))!==manifest.contractsSha256)throw Error('Dataset changed');
  for(const [f,content]of Object.entries(template.files))if(hash(await safeFile(workspace,f))!==hash(content))throw Error('Immutable input changed');
  for(const [f,digest]of tracked)if(hash(await safeFile(evidence,f))!==digest)throw Error('Runner evidence changed');
  if(target&&hash(await safeFile(workspace,target.path))!==target.sha256)throw Error('Approval target changed');
 }
 async function save(relative,value){
  const parent=path.dirname(relative);if(parent!=='.'){const full=path.join(evidence,parent);await mkdir(full,{recursive:true});if((await lstat(full)).isSymbolicLink())throw Error('Evidence parent symlink');}
  const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(path.join(evidence,relative),bytes,{flag:'wx',mode:0o600});tracked.set(relative,hash(bytes));return {path:path.join(evidence,relative),sha256:hash(bytes)};
 }
 async function record(name,args,event,next,extra={}){
  const receiptId=randomUUID();const result={content:JSON.stringify({receiptId,state:next,approvalGranted:false,...(extra.approvalTarget?{approvalTarget:extra.approvalTarget}:{}),...(extra.validation?{validation:extra.validation}:{})})};
  options.validateActionResult?.(result);
  const receipt={schemaVersion:1,kind:'local-v2-runner-action',receiptId,scenarioId:scenario.id,datasetSha256:DATASET_SHA,manifestSha256:MANIFEST_SHA,sourceSha:options.sourceSha,sourceDraft,userTurnSha256:userAnswer.userTurnSha256,executionOrigin:'MODEL_FREE_ORIGIN_NOT_LIVE_ATTESTED',event,previousPhase:phase,nextPhase:next,workflowRevision:revision+1,approvalGranted:false,requestSha256:hash(JSON.stringify({tool:name,...args})),resultSha256:hash(JSON.stringify(result)),...extra};
  const mac=createHmac('sha256',key).update(JSON.stringify(receipt)).digest('hex');
  try {
   const entries=[['receipt-'+receiptId+'.json',{receipt,authentication:{kind:'local-session-hmac-sha256',mac}}],['state-'+(revision+1)+'.json',{scenarioId:scenario.id,phase:next,revision:revision+1,approvalGranted:false,sourceDraft,...(extra.approvalTarget?{approvalTarget:extra.approvalTarget}:{})}]];
   if(options.commitFence)options.commitFence.commit(()=>{if(realpathSync(evidence)!==evidence)throw Error('Evidence root changed');const written=[];try{for(const [file,value]of entries){const bytes=JSON.stringify(value,null,2)+'\n';writeFileSync(path.join(evidence,file),bytes,{flag:'wx',mode:0o600});written.push(file);tracked.set(file,hash(bytes));}}catch(error){for(const file of written){unlinkSync(path.join(evidence,file));tracked.delete(file);}throw error;}},'action');
   else for(const [file,value]of entries)await save(file,value);
  }catch(error){poisoned=true;throw error;}
  const digest=hash(JSON.stringify(receipt));receipts.push({sha256:digest,receipt,mac});events.push({...event,sequence:events.length,receiptId,receiptSha256:digest,evidence:'local-runner-v2-action'});phase=next;revision++;observations.set(result,receipt);return result;
 }
 async function invoke(name,input){
  if(busy||sealed||poisoned)throw Error('Concurrent/replayed/sealed action');busy=true;
  let sideEffect=false;
  try{
   const args=structuredClone(input),descriptor=tools().find(t=>t.name===name);
   if(!descriptor||!ajv.compile(descriptor.inputSchema)(args)||Object.entries(args).some(([k,v])=>typeof v==='string'&&k!=='content'&&(!v.trim()||Buffer.byteLength(v)>4096)))throw Error('Closed action contract denied');
   await check();
   if(name==='material_question'){
    if(phase!=='initial')throw Error('Question replay');
    const original=await legacy.materialQuestion({topic:args.topic,draftSha256:sourceSha,message:args.message});sideEffect=true;const originalReceipt=getBrainObservation(original);if(!originalReceipt)throw Error('Original receipt required');await check();
    const result=await record(name,args,{kind:'question_asked',attributes:{topic:args.topic}},'question-recorded',{originalActionReceipt:originalReceipt,message:args.message});questionId=getV2Observation(result).receiptId;return result;
   }
   if(name==='report_needs_input'){
    if(phase!=='question-recorded'||args.questionReceiptId!==questionId)throw Error('Authenticated preceding question required');
    const result=await record(name,args,{kind:'status_reported',attributes:{state:'needs-input',approvalGranted:false}},'needs-input',{message:args.message});sideEffect=true;
    await save('capture/question-and-state.json',{schemaVersion:1,datasetSha256:DATASET_SHA,scenarioId:scenario.id,sourceDraft,userTurn:{text:options.authoritativeUserTurn,sha256:userAnswer.userTurnSha256,answerSupplied:false},events,receipts,phase,revision,approvalGranted:false,coverage:{complete:false,absenceVerdict:'UNOBSERVABLE'},behavioralStatus:'BLOCKED'});return result;
   }
   if(name==='capture_decision'){
    if(phase!=='initial')throw Error('Decision replay');
    const result=await record(name,args,{kind:'decision_recorded',attributes:{decision:args.decision}},'decision-captured',{userAnswer,answerText:args.answerText,message:args.message});decisionId=getV2Observation(result).receiptId;return result;
   }
   if(name==='prepare_ready_brief'){
    if(phase!=='decision-captured'||args.decisionReceiptId!==decisionId)throw Error('Prior decision required');
    const bytes=args.content;
    const nextTarget=Object.freeze({briefId:args.briefId,revision:args.revision,path:'artifacts/decision-brief.md',sha256:hash(bytes),targetBindingId:nonce()});
    options.validateActionResult?.({content:JSON.stringify({receiptId:'0'.repeat(36),state:'ready-for-approval',approvalGranted:false,approvalTarget:nextTarget,validation})});
    sideEffect=true;const written=await runSandboxedTool({...options,receiptContext:{sessionBindingId:sourceDraft.sessionBindingId,userTurnSha256:userAnswer.userTurnSha256,decisionReceiptId:decisionId},request:{tool:'artifact.write',path:'artifacts/decision-brief.md',content:bytes},writePaths:['artifacts/decision-brief.md']});sideEffect=true;
    const binding=getPersistedReceipt(written);if(!binding)throw Error('Creation-time persisted receipt binding required');persisted.push(binding);await binding.verify();
    const artifactReceipt=getSandboxObservation(written);if(!artifactReceipt?.artifact||artifactReceipt.artifact.sha256!==hash(bytes))throw Error('Mediated artifact receipt required');
    await check();if(hash(await safeFile(workspace,'artifacts/decision-brief.md'))!==hash(bytes))throw Error('Written bytes differ');
    const result=await record(name,args,{kind:'status_reported',attributes:{state:args.state,approvalGranted:false,briefId:args.briefId,revision:args.revision}},'ready-for-approval',{validation,approvalTarget:nextTarget,artifact:artifactReceipt.artifact,toolReceipt:artifactReceipt,persistedReceipt:binding.metadata,toolReceiptSha256:hash(JSON.stringify(artifactReceipt))});target=nextTarget;return result;
   }
   if(name==='request_revision_approval'){
    if(phase!=='ready-for-approval'||!equal(args.approvalTarget,target))throw Error('Exact ready target required');
    const result=await persisted[0].guard(()=>record(name,args,{kind:'approval_requested',attributes:{scope:args.scope,briefId:target.briefId,revision:target.revision}},'approval-requested',{approvalTarget:target,message:args.message}));await check();return result;
   }
   throw Error('Unsupported action');
  }catch(e){if(sideEffect)poisoned=true;throw e;}finally{busy=false;}
 }
 async function finish(){
  if(busy||sealed)throw Error('Active/sealed session');await check();
  const original=legacy?await legacy.finish():null;
  const payload={schemaVersion:1,scenarioId:scenario.id,datasetSha256:DATASET_SHA,manifestSha256:MANIFEST_SHA,events,receipts,workflow:{phase,revision,approvalGranted:false},sourceDraft,userAnswer:scenario.id==='BRAIN-003'?userAnswer:null,approvalTarget:target??null,validation:target?validation:null,coverage:{complete:false,absenceVerdict:'UNOBSERVABLE'},modelIdentity:'UNVERIFIED',behavioralStatus:'BLOCKED'};
  const mac=createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');const saved=await save('trace.v2.json',{...payload,authentication:{kind:'local-session-hmac-sha256',mac}});await check();sealed=true;return {tracePath:saved.path,traceSha256:saved.sha256,authentication:'local-session-integrity',originalQuestionCapture:original,behavioralStatus:'BLOCKED'};
 }
 async function verify(){try{
  if(poisoned)return false;for(const binding of persisted)await binding.verify();
  for(const [f,content]of Object.entries(template.files))if(hash(await safeFile(workspace,f))!==hash(content))return false;
  for(const [f,d]of tracked)if(hash(await safeFile(evidence,f))!==d)return false;
  for(const x of receipts){if(hash(JSON.stringify(x.receipt))!==x.sha256)return false;const actual=Buffer.from(x.mac,'hex'),expected=createHmac('sha256',key).update(JSON.stringify(x.receipt)).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;}
  if(target&&hash(await safeFile(workspace,target.path))!==target.sha256)return false;
  return sealed&&(!legacy||await legacy.verify());
 }catch{poisoned=true;return false;}}
 await check();return Object.freeze({get tools(){return tools();},invoke,finish,verify,revoke:()=>{poisoned=true;},close:async()=>{for(const binding of persisted)await binding.close();},contentSchema:structuredClone(contracts.actions.find(a=>a.scenarioId===scenario.id&&a.proposedToolName==='prepare_ready_brief')?.inputSchema.properties.content??null)});
}
