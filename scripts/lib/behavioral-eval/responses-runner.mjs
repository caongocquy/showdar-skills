import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { realpath, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareBrokerCommand } from './typed-command-broker.mjs';
import { analyzeRecordedTrace } from './trace-grader.mjs';
import { createRunnerCapture } from './runner-capture.mjs';
import { createLiveResponsesTransport, LIVE_TRANSPORT_BLOCKER } from './responses-transport.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const LIMIT = 64 * 1024;
const LIVE_BLOCKER = LIVE_TRANSPORT_BLOCKER;
const properties = {
  git_status: {}, git_diff_check: {},
  fixture_read: { path: { type:'string' } },
  artifact_write: { path: { type:'string' }, content: { type:'string' } },
};
const tools = Object.entries(properties).map(([name, fields]) => ({
  type:'function', name, description:`Fixture-only ${name}`,
  strict:true, parameters:{type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false},
}));

// Docker presence is not proof of a container's network, mounts, user or credential isolation.
export async function detectSandbox({ probe = promisify(execFile) } = {}) {
  try {
    const result = await probe('docker', ['version','--format','{{.Server.Version}}'], {
      env:{PATH:process.env.PATH ?? '/usr/bin:/bin'}, timeout:5000, maxBuffer:4096,
    });
    return { available: /^\d+\.\d+/.test(result.stdout.trim()), verified:false, reason:LIVE_BLOCKER };
  } catch {
    return {available:false,verified:false,reason:'Docker unavailable; no verified sandboxed tool runtime'};
  }
}

/** No supplied flags or callbacks authorize live model or tool execution. */
export async function runResponsesScenario({allowModel=false}={}) {
  try {await createLiveResponsesTransport({allowModel})();} catch(error) {
    return {status:'BLOCKED',reasons:[error.message],execution:{agentLaunched:false},trustedRunnerSupported:false};
  }
  return {status:'BLOCKED',reasons:[LIVE_BLOCKER],execution:{agentLaunched:false},trustedRunnerSupported:false};
}

function mediate(name, args, { workspace, scenario, suite }) {
  const fields = properties[name];
  if (!Object.hasOwn(properties,name) || !object(args) ||
      Object.keys(args).length !== Object.keys(fields).length ||
      Object.keys(fields).some(key => typeof args[key] !== 'string')) throw new Error('Tool denied: unknown capability or invalid typed arguments');
  if (name === 'git_status' || name === 'git_diff_check') {
    return prepareBrokerCommand({tool:name === 'git_status' ? 'git.status' : 'git.diff-check'}, {workspace});
  }
  if (args.path.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || path.isAbsolute(args.path) || args.path.includes('\0')) throw new Error('Tool denied: path escape');
  const allowed = name === 'fixture_read'
    ? Object.keys(suite.fixtureTemplates[scenario.fixture.template].files)
    : scenario.oracle.rubric.map(rule => rule.artifact);
  if (!allowed.includes(args.path)) throw new Error('Tool denied: path is outside scenario capability');
  if (name === 'artifact_write' && Buffer.byteLength(args.content) > LIMIT) throw new Error('Tool denied: artifact output limit');
  return Object.freeze({tool:name === 'fixture_read' ? 'fixture.read' : 'artifact.write', ...args});
}

/** Offline Responses wire contract only. Both injected transports are deterministic fixtures. */
export async function runOfflineResponses({scenario,suite,sourceSha,model,workspace,evidenceDir,
  fakeResponses,fakeRuntime,apiKey='',timeoutMs=1000,maxTurns=8} = {}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '') || typeof model !== 'string' || !model.trim()) throw new Error('Pinned source and explicit model required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 32) throw new Error('Invalid execution budget');
  const fixtureRoot = await realpath(workspace); const evidenceRoot = await realpath(evidenceDir);
  const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);
  if (contains(fixtureRoot,evidenceRoot) || contains(evidenceRoot,fixtureRoot)) throw new Error('Evidence must be outside and separate from agent fixture');
  const runRoot = await mkdtemp(path.join(evidenceRoot,'run-'));
  const capture = createRunnerCapture({directory:runRoot,scenarioId:scenario.id,sourceSha,modelIdentity:model});
  const clean = value => {
    let text = String(value);
    if (apiKey) text = text.split(apiKey).join('[REDACTED]');
    return text.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]');
  };
  const events=[]; const transcript=[]; const snapshots=[]; const callIds=new Set();
  const input=[{role:'user',content:scenario.prompt}];
  let status='NOT_RUN'; const reasons=[]; let completed=false;
  const deadline = Date.now()+timeoutMs;
  async function bounded(fn) {
    const remaining=deadline-Date.now(); if(remaining<=0) throw new Error('Execution timeout');
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Execution timeout')),remaining);})]);
    } finally { clearTimeout(timer); }
  }
  try {
    if(typeof fakeResponses!=='function'||typeof fakeRuntime!=='function') throw new Error('Offline fake transports unavailable');
    for(let turn=0;turn<maxTurns;turn++) {
      const response=await bounded(()=>fakeResponses({model,input:structuredClone(input),tools:structuredClone(tools),parallel_tool_calls:false,store:false,max_output_tokens:2048}));
      if(!object(response)||!Array.isArray(response.output)||Buffer.byteLength(JSON.stringify(response))>LIMIT) throw new Error('Invalid or oversized Responses output');
      // Only custom function calls and messages are supported; no built-in external tools.
      if(response.output.some(item=>!object(item)||!['function_call','message','reasoning'].includes(item.type))) throw new Error('Unsupported Responses output capability');
      transcript.push(JSON.parse(clean(JSON.stringify(response.output.map(item =>
        item.type === 'function_call' ? {...item, arguments:'[withheld]'} : item)))));
      capture.observeResponse(JSON.parse(clean(JSON.stringify({id:response.id,model:response.model,requestId:response.requestId}))),transcript.at(-1));
      input.push(...response.output);
      const calls=response.output.filter(item=>item.type==='function_call');
      if(!calls.length){completed=true;break;}
      for(const call of calls) {
        if(typeof call.call_id!=='string'||!call.call_id||callIds.has(call.call_id)) throw new Error('Invalid or replayed tool call');
        callIds.add(call.call_id);
        if(typeof call.arguments!=='string'||Buffer.byteLength(call.arguments)>LIMIT) throw new Error('Invalid tool arguments');
        // Known credential values never cross into the tool transport, even through model text.
        const request=mediate(call.name,JSON.parse(call.arguments),{workspace:fixtureRoot,scenario,suite});
        if(apiKey && Object.values(request).some(value => typeof value === 'string' && value.includes(apiKey))) throw new Error('Credential exposure denied');
        const output=await bounded(()=>fakeRuntime(request));
        if(!object(output)||Buffer.byteLength(JSON.stringify(output))>LIMIT) throw new Error('Invalid or oversized tool output');
        if(request.tool.startsWith('git.') && (!Number.isInteger(output.exitCode)||output.exitCode<0||output.exitCode>255)) throw new Error('Invalid tool exit code');
        capture.observeTool(request,output);
        events.push({kind:'tool_invoked',attributes:{tool:request.tool},evidence:'simulated-runtime'});
        if(request.tool==='artifact.write') {
          if(typeof output.content!=='string') throw new Error('Artifact bytes unavailable');
          const bytes=clean(output.content); const file=path.join(runRoot,`artifact-${snapshots.length}.txt`);
          await writeFile(file,bytes,{flag:'wx',mode:0o600});
          snapshots.push({path:request.path,file,sha256:hash(bytes)});
          events.push({kind:'file_written',attributes:{path:request.path},evidence:'simulated-runtime'});
        }
        const modelOutput=request.tool.startsWith('git.') ? {exitCode:output.exitCode,stdout:output.stdout ?? ''} : {content:output.content};
        input.push({type:'function_call_output',call_id:call.call_id,output:clean(JSON.stringify(modelOutput))});
      }
    }
    if(!completed) throw new Error('Turn budget exhausted');
  } catch(error) {status='BLOCKED';reasons.push(clean(error.message));}
  // Independent checks use captured bytes/events, never the model's rubric or provenance.
  const artifacts=[];
  for(const rule of scenario.oracle.rubric) {
    const snapshot=snapshots.findLast(item=>item.path===rule.artifact);
    let integrity='MISSING';
    if(snapshot) {
      try {integrity=hash(await readFile(snapshot.file))===snapshot.sha256?'MATCH':'MISMATCH';} catch {integrity='MISSING';}
    }
    artifacts.push({id:rule.id,path:rule.artifact,integrity,grade:'BLOCKED',reason:'Independent qualitative review unsupported'});
  }
  if(artifacts.some(item=>item.integrity==='MISMATCH')) {status='BLOCKED';reasons.push('Captured artifact integrity mismatch');}
  const capturedTrace = await capture.finish(completed);
  if (!await capture.verify()) {status='BLOCKED';reasons.push('Host capture integrity mismatch');}
  const result={schemaVersion:1,scenarioId:scenario.id,sourceSha,scenarioHash:hash(JSON.stringify(scenario)),
    status,reasons,execution:{kind:'simulated',agentLaunched:false},trustedRunnerSupported:false,
    events,grading:{rubricStatus:'BLOCKED',artifacts,analysis:analyzeRecordedTrace(scenario,{schemaVersion:1,scenarioId:scenario.id,sourceSha,complete:completed,events},{sourceSha})},
    capturedTrace,evidencePath:path.join(runRoot,'evidence.json')};
  await writeFile(result.evidencePath,JSON.stringify({...result,transcript,snapshots},null,2),{flag:'wx',mode:0o600});
  return result;
}
