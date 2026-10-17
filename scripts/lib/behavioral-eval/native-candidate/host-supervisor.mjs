import {spawn,execFileSync} from 'node:child_process';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {quarantineInterruptedInvocation} from './recovery.mjs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {buildSandboxToolArgs} from './sandbox-tool-runtime.mjs';

const RELEASE='/Users/quycaongoc/.codex/packages/standalone/releases/0.162.1-aarch64-apple-darwin/bin/';
const CLI=RELEASE+'codex',HOST=RELEASE+'codex-code-mode-host';
const PINS={codex:'74c6a6d263f40d65f99c27a815275f5b4ed0bcc2baecc396b4cf3255498bdfc0','codex-code-mode-host':'0960435a104cf926e18bb938b8f6f8fcdf7e27be0c8d88e1911bc22a1de7d3e6'};
const ns=()=>process.hrtime.bigint();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.slice().sort().join();
function identity(pid){
 try{const text=execFileSync('/bin/ps',['-p',String(pid),'-o','ppid=,stat=,lstart=,comm='],{encoding:'utf8',timeout:250}).trim();if(!text)return null;
 const [parent,status,...rest]=text.split(/\s+/);return {parent:Number(parent),status,binding:rest.join(' '),text};
 }catch(error){if(error.status===1)return null;throw error;}
}
const fixedValues=new Set(['model="gpt-6-luna"','model_provider="local_fixture"','model_providers.local_fixture.name="Synthetic qualification provider"','model_providers.local_fixture.wire_api="responses"','model_providers.local_fixture.requires_openai_auth=false','model_providers.local_fixture.request_max_retries=0','features.code_mode_host=true','features.shell_tool=false','mcp_servers.showdar_semantics.default_tools_approval_mode="prompt"','features.apps=false','features.plugins=false','features.hooks=false','features.memories=false','features.shell_snapshot=false','features.api_key_model_discovery=false','analytics.enabled=false','check_for_update_on_startup=false']);
function validateLaunch(p){
 if(!exact(p,['argv','cwd','env'])||!Array.isArray(p.argv)||!exact(p.env,['PATH','HOME','CODEX_HOME','TMPDIR']))throw Error('Closed native launch descriptor required');
 if(p.env.PATH!=='/usr/bin:/bin'||p.env.TMPDIR!==p.env.HOME||p.env.CODEX_HOME!==path.join(p.env.HOME,'codex'))throw Error('Minimal environment required');
 const prefix=['--no-daemon','exec','--json','--ephemeral','--skip-git-repo-check','--strict-config','--cd',p.cwd];
 if(JSON.stringify(p.argv.slice(0,8))!==JSON.stringify(prefix)||p.argv.at(-1)!=='-'||(p.argv.length-9)%2)throw Error('Fixed native command required');
 const seen=new Set();for(let i=8;i<p.argv.length-1;i+=2){const v=p.argv[i+1];if(p.argv[i]!=='-c'||typeof v!=='string'||seen.has(v.split('=')[0]))throw Error('Invalid configuration overrides');seen.add(v.split('=')[0]);
 if(!fixedValues.has(v)&&!/^model_catalog_json="[^"\n]+"$/.test(v)&&!/^model_providers\.local_fixture\.base_url="http:\/\/127\.0\.0\.1:[0-9]+\/v1"$/.test(v)&&!/^mcp_servers\.showdar_semantics\.url="http:\/\/127\.0\.0\.1:[0-9]+\/mcp"$/.test(v)&&!/^mcp_servers\.showdar_semantics\.tools\.(material_question|report_needs_input|capture_decision|prepare_ready_brief|request_revision_approval)\.approval_mode="approve"$/.test(v))throw Error('Unapproved native configuration');
 }
 for(const v of fixedValues)if(!p.argv.includes(v))throw Error('Required native configuration missing');
}

/** Trusted host entry point; the private child channel is never a model capability. */
export async function superviseBroker({brokerFile,brokerSha256,args=[],cwd,log=()=>{},onBoundary=async()=>{}}){
 const file=await realpath(brokerFile);
 if(createHash('sha256').update(await readFile(file)).digest('hex')!==brokerSha256)throw Error('Broker component identity mismatch');
 for(const [name,sha]of Object.entries(PINS))if(createHash('sha256').update(await readFile(RELEASE+name)).digest('hex')!==sha)throw Error('Pinned native binary changed');
 const invocationId=randomUUID(),events=[],hosts=new Map(),pending=new Set(),jobs=new Map(),requestIds=new Set();let state='ACTIVE',cli,death,completion,launchReserved=false,recoveryBinding,cleanupQualified=false;
 function record(event,data={}){const row={sequence:events.length,invocationId,event,monotonicNs:ns().toString(),...data};events.push(row);log(row);}
 const broker=spawn(process.execPath,[file,...args],{cwd,env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe','ipc']});
 function active(){if(state!=='ACTIVE'||broker.exitCode!==null||broker.signalCode!==null||!broker.connected)throw Error('Invocation revoked');}
 const DOCKER='/usr/local/bin/docker',IMAGE='sha256:e576f2d6c9ba92ece8007929d7263d766ed2bd062e913f6d7eae88303cd3dc16';
 const dockerEnv={PATH:'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin'};
 const cliLive=()=>{active();if(!cli||cli.exitCode!==null||cli.signalCode!==null)throw Error('Native invocation closed');};
 function dockerCommand(args,timeout=3000){return new Promise((resolve,reject)=>{
  const child=spawn(DOCKER,args,{env:dockerEnv,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',size=0;
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  for(const [stream,target]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',c=>{size+=c.length;if(size>65536){child.kill('SIGKILL');return;}if(target==='stdout')stdout+=c;else stderr+=c;});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',(code,signal)=>{clearTimeout(timer);code===0?resolve(stdout):reject(Object.assign(Error('Docker control failed '+(code??signal)),{stderr}));});
 });}
 async function verifyContainer(job){const c=JSON.parse(await dockerCommand(['inspect',job.cid]))[0];
  if(c.Id!==job.cid||c.Image!==IMAGE||c.Mounts.length!==1||c.Mounts[0].Source!==job.context.workerRoot||c.Mounts[0].Destination!=='/workspace'||c.Mounts[0].RW!==true)throw Error('Docker binding changed');return c;
 }
 async function removeJob(job,deadline){
  if(job.removal)return job.removal;
  job.removal=(async()=>{
   try{await job.creation;}catch(e){if(!job.createAdmitted){job.absent=true;return;}throw e;}
   if(!job.cid)throw Error('Ambiguous container creation');
   const remaining=()=>deadline?Math.max(1,Math.floor(Number(deadline-ns())/1e6)):3000;
   if(deadline&&ns()>=deadline)throw Error('Cleanup deadline exhausted');
   try{await dockerCommand(['rm','--force',job.cid],Math.min(2000,remaining()));}catch(e){if(!/no such/i.test(e.stderr??''))throw e;}
   try{await dockerCommand(['inspect',job.cid],Math.min(1000,remaining()));throw Error('Container remains');}catch(e){if(!/no such/i.test(e.stderr??''))throw e;}
   if(job.client&&job.client.exitCode===null&&job.client.signalCode===null)job.client.kill('SIGKILL');
   job.absent=true;record('container-absence-observed',{jobId:job.id,containerId:job.cid});
  })();return job.removal;
 }
 function streamChild(child,key){
  const sendData=(kind,chunk)=>{if(state!=='ACTIVE')return;for(let i=0;i<chunk.length;i+=16384)send({kind,invocationId,...(key==='native'?{}:{jobId:key}),data:chunk.subarray(i,i+16384).toString('base64')});};
  child.once('error',error=>{record('owned-child-error',{key,message:error.message});send({kind:key==='native'?'native.exit':'docker.exit',invocationId,...(key==='native'?{}:{jobId:key}),code:null,signal:'SPAWN_FAILED'});});
  child.stdin.on('error',()=>{});child.stdout.on('data',c=>sendData(key==='native'?'native.stdout':'docker.stdout',c));child.stderr.on('data',c=>sendData(key==='native'?'native.stderr':'docker.stderr',c));
  child.once('exit',(code,signal)=>{record('owned-child-exit',{key,pid:child.pid,code,signal});send({kind:key==='native'?'native.exit':'docker.exit',invocationId,...(key==='native'?{}:{jobId:key}),code,signal});if(key==='native'){const end=death?death+5_000_000_000n:ns()+5_000_000_000n;for(const job of jobs.values())removeJob(job,end).catch(error=>record('native-exit-worker-cleanup-failed',{message:error.message}));}});
  child.once('close',(code,signal)=>send({kind:key==='native'?'native.close':'docker.close',invocationId,...(key==='native'?{}:{jobId:key}),code,signal}));
 }
 function send(value){if(broker.connected)broker.send(value,error=>{if(error&&state==='ACTIVE')record('channel-send-error',{message:error.message});});}
 function reply(id,value,error){send({kind:'reply',invocationId,id,...(error?{error}:{value})});}
 async function dispatch(m){
  if(!exact(m,['kind','invocationId','id','operation','payload'])||m.kind!=='request'||m.invocationId!==invocationId||!Number.isSafeInteger(m.id))throw Error('Invalid private frame');
  active();if(m.id<1||requestIds.has(m.id)||requestIds.size>=256)throw Error('Private request replay/limit');requestIds.add(m.id);
  if(m.operation==='native.launch'){
   if(launchReserved)throw Error('One native invocation only');launchReserved=true;validateLaunch(m.payload);
   if(await realpath(m.payload.cwd)!==m.payload.cwd||await realpath(m.payload.env.HOME)!==m.payload.env.HOME)throw Error('Canonical native roots required');active();
   const invocationDirectory=path.dirname(m.payload.cwd);if(path.basename(invocationDirectory)==='active'){const a=await lstat(invocationDirectory),r=await lstat(path.dirname(invocationDirectory));recoveryBinding={active:invocationDirectory,root:path.dirname(invocationDirectory),activeIdentity:`${a.dev}:${a.ino}`,rootIdentity:`${r.dev}:${r.ino}`};active();}
   cli=spawn(CLI,m.payload.argv,{cwd:m.payload.cwd,env:m.payload.env,stdio:['pipe','pipe','pipe']});
   cli.on('error',error=>record('native-launch-error',{message:error.message}));streamChild(cli,'native');
   record('native-launch',{pid:cli.pid,executable:CLI,environmentKeys:Object.keys(m.payload.env)});return {pid:cli.pid};
  }
  if(m.operation==='native.input'){
   if(!cli||cli.exitCode!==null||cli.signalCode!==null||cli.inputUsed||!exact(m.payload,['data'])||typeof m.payload.data!=='string'||Buffer.byteLength(m.payload.data)>65536)throw Error('Bounded native input required');cli.inputUsed=true;cli.stdin.end(m.payload.data);return {};
  }
  if(m.operation==='native.signal'){
   if(!cli||!exact(m.payload,['signal'])||!['SIGTERM','SIGKILL'].includes(m.payload.signal))throw Error('Fixed native signal required');return {signaled:cli.kill(m.payload.signal)};
  }
  if(m.operation==='native.observe-host'){
   if(!cli||!exact(m.payload,['pid'])||!Number.isSafeInteger(m.payload.pid))throw Error('Host identity required');
   const p=identity(m.payload.pid);if(!p||p.parent!==cli.pid||/^[ZX]/.test(p.status)||!p.binding.endsWith(HOST))throw Error('Not the owned CLI host');
   const previous=hosts.get(m.payload.pid);if(previous&&previous!==p.binding)throw Error('Host identity changed');hosts.set(m.payload.pid,p.binding);record('native-host-bound',{pid:m.payload.pid,binding:p.binding});return {};
  }
  if(m.operation==='docker.prepare'){
   cliLive();const p=m.payload;
   if(!exact(p,['args','context'])||!Array.isArray(p.args)||!exact(p.context,['sourceSha','sessionBindingId','requestSha256','payloadSha256','workerRoot']))throw Error('Closed Docker preparation required');
   if(p.context.sourceSha!=='99fc3f98e01c1a6d6f2549cc36b21af6f5eede04'||!['sessionBindingId','requestSha256','payloadSha256'].every(k=>/^[a-f0-9]{64}$/.test(p.context[k])))throw Error('Docker source/session/request binding required');
   if([...jobs.values()].some(j=>!j.absent))throw Error('One outstanding worker only');
   const id=randomUUID(),job={id,context:p.context,creation:null,started:false,absent:false};jobs.set(id,job);
   job.creation=(async()=>{
    const root=await realpath(p.context.workerRoot);cliLive();
    if(root!==p.context.workerRoot||path.dirname(root)!==path.dirname(await realpath(cli.spawnargs[cli.spawnargs.indexOf('--cd')+1]))||!path.basename(root).startsWith('worker-stage-'))throw Error('Invocation-scoped staging required');
    const name=p.args[p.args.indexOf('--name')+1];if(!/^showdar-tool-[a-f0-9-]{36}$/.test(name))throw Error('Fixed worker name required');
    const expected=buildSandboxToolArgs({workspace:root,imageId:IMAGE,name,request:{tool:'artifact.write',path:'artifacts/decision-brief.md',content:''}});
    if(JSON.stringify(p.args)!==JSON.stringify(expected))throw Error('Docker executable/argument override refused');
    job.name=name;await onBoundary('before-docker-create',{jobId:id,name,context:job.context});cliLive();job.createAdmitted=true;record('docker-create-admitted',{jobId:id,sourceSha:p.context.sourceSha,sessionBindingId:p.context.sessionBindingId,requestSha256:p.context.requestSha256,workerRoot:root});
    const creating=dockerCommand(['create',...p.args.slice(1).filter(v=>v!=='--rm')],15000);
    creating.catch(()=>{});await onBoundary('docker-create-in-flight',{jobId:id,name,context:job.context});job.cid=(await creating).trim();
    if(!/^[a-f0-9]{64}$/.test(job.cid))throw Error('Immutable container ID missing');await verifyContainer(job);
    record('container-id-bound',{jobId:id,containerId:job.cid});await onBoundary('after-container-id-bound',{jobId:id,containerId:job.cid,context:job.context});
   })();
   await job.creation;
   if(state!=='ACTIVE'||broker.exitCode!==null||broker.signalCode!==null){await removeJob(job,death+5_000_000_000n);throw Error('Revoked creation cannot start');}
   cliLive();return {jobId:id,containerId:job.cid};
  }
  if(m.operation==='docker.start'){
   cliLive();if(!exact(m.payload,['jobId']))throw Error('Closed worker start required');const job=jobs.get(m.payload.jobId);
   if(!job||!job.cid||job.started||job.absent)throw Error('Unknown/replayed worker start');job.started=true;
   job.client=spawn(DOCKER,['start','--attach','--interactive',job.cid],{env:dockerEnv,stdio:['pipe','pipe','pipe']});streamChild(job.client,job.id);
   record('worker-started',{jobId:job.id,containerId:job.cid,pid:job.client.pid});return {pid:job.client.pid};
  }
  if(m.operation==='docker.input'){
   cliLive();if(!exact(m.payload,['jobId','data'])||typeof m.payload.data!=='string'||Buffer.byteLength(m.payload.data)>65536)throw Error('Bounded worker input required');const job=jobs.get(m.payload.jobId);
   if(!job?.client||job.inputUsed||createHash('sha256').update(m.payload.data).digest('hex')!==job.context.payloadSha256)throw Error('Worker payload binding failed');
   job.inputUsed=true;job.client.stdin.end(m.payload.data);return {};
  }
  if(m.operation==='docker.release'){
   if(!exact(m.payload,['jobId']))throw Error('Closed worker cleanup required');const job=jobs.get(m.payload.jobId);if(!job)throw Error('Unowned worker cleanup refused');await removeJob(job);return {absent:true};
  }
  throw Error('Unsupported private operation');
 }
 broker.on('message',m=>{
  if(exact(m,['kind'])&&m.kind==='client.ready'){try{active();send({kind:'owner.ready',invocationId});}catch{}return;}
  if(!exact(m,['kind','invocationId','id','operation','payload'])||Buffer.byteLength(JSON.stringify(m))>65536){record('private-frame-denied');broker.kill('SIGKILL');return;}
  const job=dispatch(m).then(value=>{active();reply(m.id,value);},error=>reply(m.id,null,error.message));pending.add(job);job.finally(()=>pending.delete(job)).catch(()=>{});
 });
 async function cleanup(){
  if(state!=='ACTIVE')return completion;death=ns();state='REVOKED';record('broker-death-revocation',{brokerPid:broker.pid});
  const deadline=death+5_000_000_000n;
  // Signal only our unreaped ChildProcess. Observed host PIDs are never signal targets.
  if(cli&&cli.exitCode===null&&cli.signalCode===null){record('native-termination-requested',{pid:cli.pid,signal:'SIGINT'});cli.kill('SIGINT');}
  let forced=false,absent=false,dockerSettled=false,dockerFailed=false;
  Promise.all([...jobs.values()].map(j=>removeJob(j,deadline))).then(()=>{dockerSettled=true;},error=>{dockerSettled=true;dockerFailed=true;record('docker-cleanup-failed',{message:error.message});});
  while(ns()<deadline){
   if(cli&&cli.exitCode===null&&cli.signalCode===null&&!forced&&ns()-death>=2_000_000_000n){forced=true;record('native-owned-handle-force',{pid:cli.pid});cli.kill('SIGKILL');}
   const live=[];for(const [pid,binding]of hosts){const p=identity(pid);if(p&&p.binding===binding&&!/^[ZX]/.test(p.status))live.push(pid);}
   const cliExited=!cli||cli.exitCode!==null||cli.signalCode!==null;
   record('cleanup-observation',{cliExited,liveHostPids:live});
   if(cliExited&&!live.length&&(!cli||hosts.size>0)&&dockerSettled&&!dockerFailed&&[...jobs.values()].every(j=>j.absent&&(!j.client||j.client.exitCode!==null||j.client.signalCode!==null))){absent=true;break;}await pause(20);
  }
  state='CLOSED';const elapsedMs=Number(ns()-death)/1e6;
  cleanupQualified=absent&&elapsedMs<=5000;
  const result={invocationId,state,nativeCleanupPass:cleanupQualified,cleanupMs:elapsedMs,cliPid:cli?.pid??null,hostBindings:[...hosts],dockerJobs:[...jobs.values()].map(j=>({jobId:j.id,name:j.name??null,containerId:j.cid??null,absent:j.absent,clientPid:j.client?.pid??null})),events};
  record('cleanup-complete',{pass:result.nativeCleanupPass,cleanupMs:elapsedMs});return result;
 }
 const done=new Promise((resolve,reject)=>{broker.once('exit',()=>{completion=cleanup();completion.then(resolve,reject);});broker.once('error',reject);});
 send({kind:'owner.ready',invocationId});record('broker-launch',{pid:broker.pid,file,brokerSha256});
 return Object.freeze({broker,done,get state(){return state;},invocationId,events,
  async recover(root,options){
   await done;if(!cleanupQualified||!recoveryBinding||root!==recoveryBinding.root)throw Error('No quiescent invocation ownership for recovery');
   const r=await lstat(root);if(`${r.dev}:${r.ino}`!==recoveryBinding.rootIdentity)throw Error('Recovery root substituted');
   try{const a=await lstat(recoveryBinding.active);if(`${a.dev}:${a.ino}`!==recoveryBinding.activeIdentity)throw Error('Stale owner cannot recover a new invocation');}catch(e){if(e.code!=='ENOENT')throw e;}
   return quarantineInterruptedInvocation(root,options);
  }});
}
