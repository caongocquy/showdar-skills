import {createInvocationBudgets,readInvocationBody,parseStrictJson} from './budgets.mjs';
import {createV2Actions} from './runtime.mjs';
import {createCliSemanticAdapter as legacyAdapter} from './legacy-adapter.mjs';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { createRunnerCapture } from '../runner-capture.mjs';

const fields = names => ({ type: 'object', properties: Object.fromEntries(names.map(name => [name, { type: 'string' }])), required: names, additionalProperties: false });
const TOOLS = Object.freeze([
  { name: 'select_skill', description: 'Explicitly select an installed pinned skill. Does not grant mutation authority.', inputSchema: fields(['skill']), action: 'selectSkill', tool: 'skill.select' },
  { name: 'skip_refinement', description: 'Record a lifecycle skip against exact runner-approved specification bytes. Requires showdar-build selection and the original approved artifact sandbox. Does not grant mutation authority.', inputSchema: fields(['approvalPath', 'approvalSha256', 'rationale']), action: 'skipRefinement', tool: 'refinement.skip' },
  { name: 'request_approval', description: 'Explicitly request approval of the existing specification; no approval is granted.', inputSchema: fields(['scope', 'message']), action: 'requestApproval', tool: 'interaction.approval' },
  { name: 'change_scope', description: 'Explicitly propose new requirements; no mutation authority is granted.', inputSchema: fields(['decision', 'message']), action: 'changeScope', tool: 'interaction.scope' },
]);
export const COVERAGE = Object.freeze({ complete: false,
  observed: ['authenticated MCP action arguments', 'original scenario-action outcomes', 'mediated decision artifact bytes when written'],
  unobserved: ['assistant-text semantic approvals and scope changes', 'reasoning-summary semantic approvals and scope changes', 'native permission and elicitation requests', 'shell and other tool interactions', 'arbitrary artifact content'],
  absenceVerdict: 'UNOBSERVABLE', actualModel: 'UNVERIFIED' });
export const FRESH_SMOKE_GATE = Object.freeze({ allowed: false, status: 'NOT_RUN',
  reasons: ['Complete approval/scope interaction coverage is not established for codex exec.', 'Successful skip/artifact requires the original approved Docker tool runtime; no native-write fallback is permitted.'] });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validMeta = meta => object(meta) && Buffer.byteLength(JSON.stringify(meta)) <= 4096 && Object.keys(meta).every(key =>
  key === 'progressToken' ? Number.isSafeInteger(meta[key]) || typeof meta[key] === 'string' && meta[key].length < 128 :
  key === 'x-codex-turn-metadata' ? object(meta[key]) :
  ['threadId', 'callId', 'sessionId', 'windowId', 'itemId'].includes(key) && typeof meta[key] === 'string' && meta[key].length < 128);
const error = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Local diagnostic only. Private MCP transport auth and original WeakMap receipts never become signed live origin. */
export async function createCliSemanticAdapter(options) {
  if(options.datasetVersion===undefined||options.datasetVersion==='v1')return legacyAdapter(options);
  if(options.datasetVersion!=='v2')throw Error('Unsupported dataset version');
  const budgets=options.budgets??createInvocationBudgets();let preview;
  const brain=await createV2Actions({...options,budgets,validateActionResult:value=>preview?.(value)}),tools=brain.tools;
  let sourceBindingContract;
  if(brain){
    const contractPath=path.join(options.evidenceDir,'mcp-contract.json');
    const bytes=JSON.stringify({schemaVersion:1,scenarioId:options.scenarioId,sourceSha:options.sourceSha,tools:tools.map(({action,tool,...descriptor})=>descriptor)},null,2)+'\n';
    await writeFile(contractPath,bytes,{flag:'wx',mode:0o600});
    sourceBindingContract={path:contractPath,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const verifyContract=async()=>{if(!sourceBindingContract)return true;try{return !(await lstat(sourceBindingContract.path)).isSymbolicLink()&&createHash('sha256').update(await readFile(sourceBindingContract.path)).digest('hex')===sourceBindingContract.sha256;}catch{return false;}};
  const token = randomBytes(32).toString('hex');
  const capture = createRunnerCapture({ directory: options.evidenceDir, scenarioId: options.scenarioId,
    sourceSha: options.sourceSha, modelIdentity: 'UNVERIFIED', apiKey: token });
  const ids = new Set();
  let server, busy = false, sealed = false, revoked=false;const drains=new Set();
  budgets.onViolation(()=>{revoked=true;if(busy||budgets.inspect().violation)brain.revoke();options.commitFence?.revoke('budget-or-lifecycle');});
  async function dispatch(request,wire){
    try{
      if(!wire){
        if(options.budgets)return error(request?.id,-32000,'Unbound direct dispatch refused');
        const raw=Buffer.from(JSON.stringify(request)),r=budgets.admitRequest();budgets.receive(r,raw.length);budgets.endRequest(r);wire=parseStrictJson(raw);
      }
      budgets.assertActive();
    }catch{return error(request?.id,-32000,'Invocation budget denied');}
    let lease;
    if(object(request)&&request.method==='tools/call')try{lease=budgets.beginAction(wire.argsRaw,request.params?.arguments??null);}catch{return error(request.id,-32000,'Action budget denied');}
    try{const response=await dispatchAdmitted(request,wire,lease);if(lease&&!budgets.inspect().revoked)budgets.finishAction(lease,Buffer.from(JSON.stringify(response)));return response;}finally{if(lease)budgets.closeAction(lease);}
  }
  async function dispatchAdmitted(request,wire,lease){
    if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || Object.keys(request).some(key => !['jsonrpc','id','method','params'].includes(key))) return error(null,-32600,'Invalid request');
    const id=request.id,result=value=>({jsonrpc:'2.0',id,result:value});
    if(sealed||revoked)return error(id,-32000,'Session sealed/revoked');
    if(id===undefined)return request.method==='notifications/initialized'?null:error(null,-32600,'Unsupported notification');
    if(!(typeof id==='string'&&id.length<128||Number.isSafeInteger(id)))return error(null,-32600,'Invalid request id');
    if(ids.has(id))return error(id,-32000,'Replayed request');ids.add(id);
    if(request.method==='initialize'){
      if(!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(request.params?.protocolVersion))return error(id,-32602,'Unsupported MCP protocol');
      return result({protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'showdar-local-semantic-v2-budgeted',version:'0.4-local'}});
    }
    if(request.method==='ping')return result({});
    if(request.method==='tools/list')return result({tools:structuredClone(brain.tools)});
    if(request.method!=='tools/call')return error(id,-32601,'Unsupported method');
    const params=request.params;
    const frame=value=>result(value);
    const refused=()=>frame({isError:true,content:[{type:'text',text:'Action refused by the trusted boundary; no success claimed.'}]});
    try{
      if(!object(params)||Object.keys(params).some(k=>!['arguments','name','_meta'].includes(k))||!object(params.arguments)||params._meta!==undefined&&!validMeta(params._meta))return refused();
      const descriptor=tools.find(tool=>tool.name===params.name);if(!descriptor)return refused();
      const payload=JSON.stringify(params.arguments);
      if(payload.includes(token)||/\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s|\b(?:OPENAI_API_KEY|CODEX_API_KEY|PASSWORD|SECRET)\b/i.test(payload))return refused();
      busy=true;preview=value=>budgets.previewResult(lease,Buffer.from(JSON.stringify(result({content:[{type:'text',text:value.content}]}))));
      await options.authorizeAction?.(params);budgets.assertActive();if(revoked)throw Error('Revoked before action');if(!await verifyContract())throw Error('Contract snapshot tampered');
      const actionResult=await brain.invoke(descriptor.name,params.arguments);budgets.assertActive();if(revoked)throw Error('Revoked during action');
      return frame({content:[{type:'text',text:actionResult.content}]});
    }catch{
      if(budgets.inspect().revoked)return error(id,-32000,'Invocation revoked; no success');
      return refused();
    }finally{preview=undefined;busy=false;for(const resolve of drains)resolve();drains.clear();}
  }
  return Object.freeze({
    dispatch,
    budgetSnapshot:()=>budgets.inspect(),
    revoke(){revoked=true;budgets.revoke('adapter-revoked');if(busy)brain.revoke();},
    drain:()=>busy?new Promise(r=>drains.add(r)):Promise.resolve(),
    async listen() {
      if (server || sealed) throw new Error('Session already listening or sealed');
      server = createServer(async (req, res) => {
        const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(value === null ? '' : JSON.stringify(value)); };
        const supplied = Buffer.from(req.headers.authorization ?? '');
        const expected = Buffer.from('Bearer ' + token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: 'Unauthorized' }); req.resume(); return; }
        let ingress;try{if(!options.budgets)ingress=budgets.admitRequest();}catch{send(403,{error:'Invocation exhausted/revoked'});req.resume();return;}
        if (req.url === '/mcp' && req.method === 'GET' && !req.headers.origin && !Number(req.headers['content-length']??0) && !req.headers['transfer-encoding']) { if(ingress)budgets.endRequest(ingress);send(405, { error: 'Standalone SSE stream is not provided' }); req.resume(); return; }
        try{
          let parsed;
          if(options.budgets){
            // The private broker has already admitted/counts these exact forwarded bytes.
            if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')budgets.invalidate('Forwarded encoding');
            let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)budgets.invalidate('Forwarded ingress ceiling');chunks.push(chunk);}parsed=parseStrictJson(Buffer.concat(chunks));
          }else parsed=await readInvocationBody(req,budgets,ingress);
        if (req.url !== '/mcp' || req.method !== 'POST' || req.headers.origin || req.headers['content-type']?.split(';')[0] !== 'application/json') { send(400, { error: 'Only authenticated JSON MCP POST is supported' }); req.resume(); return; }
          if(!object(parsed.value)){send(400,{error:'Batch requests refused'});return;}
          const response=await dispatch(parsed.value,parsed);send(response===null?202:200,response);
        }catch{send(400,{error:'Invalid/bounded invocation ingress'});}
      });
      server.requestTimeout = 30000;
      server.headersTimeout = 5000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const url = `http://127.0.0.1:${server.address().port}/mcp`;
      return {url,token,nativePermissionsActivated:false};
    },
    async finish() {
      if (busy || sealed || budgets.inspect().violation) throw new Error('Cannot finish an active, sealed or budget-failed session');
      sealed = true;
      const original = await capture.finish(false);
      const saved = brain ? {...await brain.finish(), originalTracePath:original.tracePath} : original;
      return { ...saved, sourceBindingContract, integrityVerified: brain ? await brain.verify() && await capture.verify() && await verifyContract() : await capture.verify(), coverage: structuredClone(COVERAGE), freshSmokeGate: structuredClone(FRESH_SMOKE_GATE),
        execution: 'local diagnostic actions; no signed CLI model origin authenticated', behavioralStatus: 'BLOCKED' };
    },
    verify: async () => budgets.inspect().violation ? false : brain ? await brain.verify() && await capture.verify() && await verifyContract() : await capture.verify(),
    async close() {
      sealed = true;
      if(busy)await new Promise(r=>drains.add(r));await brain.close();
      if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  });
}
