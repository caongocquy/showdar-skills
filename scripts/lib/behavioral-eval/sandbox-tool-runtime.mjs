import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { buildSandboxProbeArgs, SANDBOX_IMAGE } from './container-sandbox.mjs';
import { BrokerPolicyError, prepareBrokerCommand } from './typed-command-broker.mjs';
import { requireToolImage } from './tool-image-provenance.mjs';

const exec = promisify(execFile);
const observations = new WeakMap();
/** Only objects returned by this host runtime carry an observation; JSON flags cannot forge one. */
export function getSandboxObservation(result) {
  const receipt = observations.get(result);
  if (receipt) {
    const {evidenceFile,observedBy,behavioralStatus,...outcome} = result;
    if (createHash('sha256').update(JSON.stringify(outcome)).digest('hex') !== receipt.resultSha256) {
      throw new BrokerPolicyError('Sandbox observation result was modified');
    }
  }
  return receipt ? structuredClone(receipt) : null;
}
const MAX_BYTES = 65536;
const DOCKER_PATHS = ['/usr/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker'];
const TOOL_SCRIPT = "\n'use strict';\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst { spawnSync } = require('node:child_process');\nconst root = '/workspace';\nconst result = value => { process.stdout.write(JSON.stringify(value)); };\nconst request = JSON.parse(fs.readFileSync(0, 'utf8'));\nfunction checkedPath(relative) {\n  if (typeof relative !== 'string' || !relative || relative.includes('\\0') ||\n      path.isAbsolute(relative) || relative.includes('\\\\') ||\n      relative.split('/').some(part => !part || part === '.' || part === '..')) {\n    throw new Error('invalid relative path');\n  }\n  const parts = relative.split('/');\n  let current = root;\n  for (let i = 0; i < parts.length; i += 1) {\n    current = path.join(current, parts[i]);\n    try {\n      const info = fs.lstatSync(current);\n      if (info.isSymbolicLink()) throw new Error('symlink refused');\n      if (i < parts.length - 1 && !info.isDirectory()) throw new Error('non-directory path segment');\n    } catch (error) {\n      if (error.code !== 'ENOENT') throw error;\n    }\n  }\n  return path.join(root, ...parts);\n}\ntry {\n  if (request.tool === 'git.status' || request.tool === 'git.diff-check') {\n    const expected = request.tool === 'git.status' ? ['status','--short','--branch'] : ['diff','--check'];\n    const git = spawnSync('/usr/bin/git', expected, {\n      cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 65536, shell: false,\n      env: { PATH:'/usr/bin:/bin', HOME:'/tmp', GIT_CONFIG_NOSYSTEM:'1',\n        GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_COUNT:'1',\n        GIT_CONFIG_KEY_0:'safe.directory', GIT_CONFIG_VALUE_0:root,\n        GIT_OPTIONAL_LOCKS:'0' },\n    });\n    if (git.error || git.signal || !Number.isInteger(git.status)) throw new Error('git unavailable or timed out');\n    result({exitCode:git.status, stdout:git.stdout.slice(0,60000)});\n  } else if (request.tool === 'fixture.read') {\n    const target = checkedPath(request.path);\n    const file = fs.readFileSync(target);\n    if (file.length > 65536) throw new Error('file size exceeded');\n    result({content:file.toString('utf8')});\n  } else if (request.tool === 'artifact.write') {\n    const target = checkedPath(request.path);\n    const bytes = Buffer.from(request.content, 'utf8');\n    if (bytes.length > 65536) throw new Error('artifact size exceeded');\n    const parent = path.dirname(target);\n    // Parent directories may be created only under the mounted fixture.\n    // A newly created path is rechecked before opening with O_NOFOLLOW.\n    fs.mkdirSync(parent,{recursive:true});\n    checkedPath(request.path);\n    const fd = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL |\n      fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o644);\n    try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }\n    result({content: request.content});\n  } else {\n    throw new Error('unknown typed tool');\n  }\n} catch (error) {\n  process.stderr.write(String(error?.message ?? 'tool failed'));\n  process.exitCode = 2;\n}\n";
const within = (root, child) => child === root || child.startsWith(root + path.sep);

function denied(reason) { throw new BrokerPolicyError('Sandbox tool denied: ' + reason); }
export async function assertSourceRevision(sourceRoot, sourceSha) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) denied('full pinned source revision required');
  let actual, dirty;
  try {
    const result=await exec('/usr/bin/git',['-C',sourceRoot,'rev-parse','--verify','HEAD^{commit}'],{
      env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},
      timeout:3000,maxBuffer:4096,windowsHide:true,
    });
    actual=result.stdout.trim();
    const status=await exec('/usr/bin/git',['-c','core.fsmonitor=false','-C',sourceRoot,'status','--porcelain','--untracked-files=all'],{
      env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},
      timeout:3000,maxBuffer:4096,windowsHide:true,
    });
    dirty=Boolean(status.stdout.trim());
  } catch {
    denied('source checkout revision unavailable');
  }
  if (dirty) denied('source checkout has uncommitted changes');
  if (actual!==sourceSha) denied('source checkout revision mismatch');
}
function validatedPath(value, allowed) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) ||
      value.includes('\\') || value.includes('\0') ||
      value.split('/').some(x => !x || x === '.' || x === '..') || !allowed.includes(value)) {
    denied('unapproved or unsafe fixture path');
  }
}
function validateRequest(input, workspace, readPaths, writePaths) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) denied('typed object required');
  if (input.tool === 'git.status' || input.tool === 'git.diff-check') {
    const expected = prepareBrokerCommand({ tool: input.tool }, {workspace});
    if (Object.keys(input).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([key,value]) => JSON.stringify(input[key]) !== JSON.stringify(value))) {
      denied('git invocation was not issued by the exact-argv broker');
    }
    return {tool:input.tool};
  }
  if (input.tool === 'fixture.read') {
    if (Object.keys(input).length !== 2) denied('unexpected read arguments');
    validatedPath(input.path, readPaths);
    return {tool:input.tool,path:input.path};
  }
  if (input.tool === 'artifact.write') {
    if (Object.keys(input).length !== 3 || typeof input.content !== 'string' ||
        Buffer.byteLength(input.content) > MAX_BYTES) denied('invalid artifact payload');
    validatedPath(input.path, writePaths);
    return {tool:input.tool,path:input.path,content:input.content};
  }
  denied('unapproved tool');
}

async function inspectPath(workspace, relative, allowMissing) {
  let current=workspace;
  for (const [i,part] of relative.split('/').entries()) {
    current=path.join(current,part);
    try {
      const stat=await lstat(current);
      if (stat.isSymbolicLink()) denied('symlink in fixture path');
      if (i < relative.split('/').length-1 && !stat.isDirectory()) denied('non-directory ancestor');
    } catch(error) {
      if (error.code !== 'ENOENT') throw error;
      if (!allowMissing) denied('fixture file not found');
      break;
    }
  }
}

export function buildSandboxToolArgs({workspace,imageId,name,request}={}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) denied('immutable image ID required');
  const safety=buildSandboxProbeArgs({imageDigest:SANDBOX_IMAGE,workspace,name,probe:'identity'});
  const boundary=safety.indexOf('--entrypoint=node');
  if (boundary < 0) throw new Error('Sandbox policy arguments unavailable');
  if (Buffer.byteLength(JSON.stringify(request))>MAX_BYTES*2) denied('tool arguments exceed transport limit');
  // Tool payload stays on stdin, never in Docker argv or process listings.
  return [safety[0], '-i', ...safety.slice(1,boundary), '--entrypoint=node', imageId, '-e', TOOL_SCRIPT];
}

async function runDockerPayload(binary,args,env,payload) {
  return new Promise((resolve,reject) => {
    let child;
    try { child=spawn(binary,args,{env,stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true}); }
    catch(error) { reject(error);return; }
    let stdout='',stderr='',received=0,done=false;
    const settle=(error,output) => {
      if(done) return;
      done=true;clearTimeout(timer);
      if(error) reject(error); else resolve(output);
    };
    const timer=setTimeout(()=>{
      child.kill('SIGKILL');
      settle(new Error('Docker tool deadline exceeded'));
    },15000);
    const append=(where,chunk) => {
      received+=chunk.length;
      if(received>MAX_BYTES*2) {
        child.kill('SIGKILL');
        settle(new Error('Docker tool output limit exceeded'));
        return;
      }
      if(where==='stdout') stdout+=chunk.toString('utf8'); else stderr+=chunk.toString('utf8');
    };
    child.stdout.on('data',chunk=>append('stdout',chunk));
    child.stderr.on('data',chunk=>append('stderr',chunk));
    child.on('error',error=>settle(error));
    child.on('close',(code,signal)=>{
      if(code!==0) settle(Object.assign(new Error('Docker tool exited with code '+(code ?? signal)),{stderr}));
      else settle(null,{stdout,stderr});
    });
    child.stdin.on('error',()=>{}); // An early-denied tool can close stdin.
    child.stdin.end(payload);
  });
}

/**
 * Model-free execution of a strictly mediated typed tool inside Docker.
 * No model API key or host environment is inherited. Evidence is written by
 * the host into a separately mounted (never agent-mounted) evidence directory.
 * This is not a whole-agent attestation and cannot yield behavioral PASS.
 */
export async function runSandboxedTool({
  request,workspace,sourceRoot,evidenceDir,imageId,imageApproval,sourceSha,readPaths=[],writePaths=[],
}={}) {
  if (typeof sourceRoot !== 'string' || !sourceRoot) denied('pinned source checkout required');
  const root=await realpath(workspace);
  const source=await realpath(sourceRoot);
  const evidence=await realpath(evidenceDir);
  if (within(root,evidence)||within(evidence,root)||within(root,source)||within(source,root)||
      within(source,evidence)||within(evidence,source)) denied('source, fixture and evidence must be separate');
  const typed=validateRequest(request,root,readPaths,writePaths);
  if (typed.path) await inspectPath(root,typed.path,typed.tool==='artifact.write');
  await assertSourceRevision(source,sourceSha);
  let imageProvenance;
  try {imageProvenance=requireToolImage(imageApproval,imageId);} catch(error) {denied(error.message);}
  const docker=await (async()=>{
    for(const candidate of DOCKER_PATHS) { try {await access(candidate);return candidate;} catch {} }
    return null;
  })();
  if (!docker) denied('Docker CLI unavailable');
  const name='showdar-tool-'+randomUUID();
  const args=buildSandboxToolArgs({workspace:root,imageId,name,request:typed});
  const env={PATH:'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin'};
  let outcome;
  try {
    const result=await runDockerPayload(docker,args,env,JSON.stringify(typed));
    await assertSourceRevision(source,sourceSha);
    outcome=JSON.parse(String(result.stdout));
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) denied('invalid container output');
    if (typed.tool.startsWith('git.')) {
      if (!Number.isInteger(outcome.exitCode) || outcome.exitCode<0 || outcome.exitCode>255 ||
          typeof outcome.stdout !== 'string' || Buffer.byteLength(outcome.stdout)>MAX_BYTES) denied('invalid git result');
    } else if (typeof outcome.content!=='string' || Buffer.byteLength(outcome.content)>MAX_BYTES) denied('invalid file result');
  } catch(error) {
    denied('container execution failed: '+String(error?.stderr || error?.message || 'unknown').slice(0,300));
  } finally {
    try {await exec(docker,['rm','--force',name],{env,timeout:3000,maxBuffer:4096,windowsHide:true});} catch {}
  }
  let artifact;
  if (typed.tool==='artifact.write') {
    await inspectPath(root,typed.path,false);
    const bytes=await readFile(path.join(root,typed.path));
    if (bytes.length>MAX_BYTES || bytes.toString('utf8')!==typed.content) denied('captured artifact differs from mediated payload');
    const snapshotFile=path.join(evidence,'artifact-'+randomUUID()+'.bin');
    await writeFile(snapshotFile,bytes,{flag:'wx',mode:0o600});
    const verifiedBytes=await readFile(snapshotFile);
    if (!verifiedBytes.equals(bytes)) denied('host-owned artifact snapshot mismatch');
    artifact={path:typed.path,snapshotFile,bytes:bytes.length,
      sha256:createHash('sha256').update(verifiedBytes).digest('hex')};
  }
  const receipt={
    schemaVersion:1,kind:'sandbox-tool-observation',tool:typed.tool,
    observedAt:new Date().toISOString(),sourceSha,imageId,imageProvenance,
    requestSha256:createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    resultSha256:createHash('sha256').update(JSON.stringify(outcome)).digest('hex'),
    artifact:artifact ?? null,
    behavioralGrade:'NOT_EVALUATED',
  };
  const evidenceFile=path.join(evidence,'tool-'+randomUUID()+'.json');
  await writeFile(evidenceFile,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
  const result = { ...outcome, evidenceFile, observedBy:'host-tool-runtime', behavioralStatus:'NOT_RUN' };
  observations.set(result,receipt);
  return result;
}
