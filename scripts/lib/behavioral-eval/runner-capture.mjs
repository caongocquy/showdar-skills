import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSandboxObservation } from './sandbox-tool-runtime.mjs';
import { getResponsesObservation } from './responses-transport.mjs';
import { getScenarioActionObservation } from './scenario-actions.mjs';

const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const consumed=new WeakSet();
export const INTERACTION_CHANNELS=Object.freeze(['assistant-text','reasoning-summary','tool-arguments','tool-results','artifact-bytes']);

/** Host session integrity only. Durable origin authentication still requires the trusted CI signer. */
export function createRunnerCapture({directory,scenarioId,sourceSha,modelIdentity,apiKey=''}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '') || typeof scenarioId !== 'string' || typeof modelIdentity !== 'string') {
    throw new Error('Capture requires source, scenario and model binding');
  }
  const key = randomBytes(32);
  const events=[]; const responses=[]; const receipts=[]; const interactions=[]; const coverageIssues=[];
  const responseIds=new Set();
  let calls=0,observedCalls=0;
  let interactionBytes=0;
  const tracePath = path.join(directory,'trace.json');
  let sealed = false;
  let digest;
  const mac = bytes=>createHmac('sha256',key).update(bytes).digest();
  const active = ()=>{if (sealed) throw new Error('Capture already sealed');};
  const clean=value=>JSON.parse(JSON.stringify(value).split(apiKey || '\0').join('[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]'));
  const consume=result=>{if (consumed.has(result)) throw new Error('Capture observation replay');consumed.add(result);};
  function interaction(channel,value) {
    const payload=clean(value);
    if (JSON.stringify(payload)!==JSON.stringify(value)) coverageIssues.push('Semantic content redacted');
    interactionBytes+=Buffer.byteLength(JSON.stringify(payload));
    if (interactionBytes>512*1024) throw new Error('Interaction capture limit exceeded');
    interactions.push({id:`interaction-${interactions.length}`,sequence:events.length,channel,payload,sha256:hash(JSON.stringify(payload))});
  }
  function retainReceipt(receipt) {
    const sanitized=clean(receipt);
    if (JSON.stringify(sanitized)!==JSON.stringify(receipt)) coverageIssues.push('Receipt content redacted');
    receipts.push({sha256:hash(JSON.stringify(sanitized)),receipt:sanitized});
  }
  function toolInteraction(request,result) {
    observedCalls++;
    interaction('tool-arguments',request);
    const payload=request.tool.startsWith('git.')?{exitCode:result.exitCode,stdout:result.stdout ?? ''}:{content:result.content ?? null};
    interaction('tool-results',payload);
    if (request.tool==='artifact.write' || request.tool==='refinement.skip') interaction('artifact-bytes',{path:request.path ?? 'artifacts/decision.json',content:result.content ?? null});
  }
  return Object.freeze({
    observeResponse(response) {
      active();
      const observation=getResponsesObservation(response);
      if (observation?.origin==='responses-live' && observation.modelIdentity!==modelIdentity) throw new Error('Capture model identity mismatch');
      if (!Array.isArray(response.output)) throw new Error('Capture response output unavailable');
      if (observation) consume(response);
      if (response.id) {
        if (responseIds.has(response.id)) throw new Error('Response identity replay');
        responseIds.add(response.id);
      }
      for (const item of response.output) {
        if (item.type==='function_call') {
          calls++;
          if (Object.keys(item).some(key=>!['type','id','name','call_id','arguments','status'].includes(key))) coverageIssues.push('Unobserved function-call channel');
        } else if (item.type==='message' || item.type==='reasoning') {
          const channel=item.type==='message'?'assistant-text':'reasoning-summary';
          const content=item.type==='message'?item.content:item.summary;
          const keys=item.type==='message'?['type','id','role','status','content']:['type','id','status','summary'];
          if (Object.keys(item).some(key=>!keys.includes(key)) || item.role!==undefined && item.role!=='assistant' ||
              item.status!==undefined && item.status!=='completed' || !Array.isArray(content) || content.some(part=>
            !part || !['output_text','refusal','summary_text'].includes(part.type) ||
            typeof (part.text ?? part.refusal)!=='string' || Object.keys(part).some(key=>!['type','text','refusal','annotations'].includes(key)) ||
            (part.annotations!==undefined && (!Array.isArray(part.annotations) || part.annotations.length)))) coverageIssues.push('Unobserved response channel');
          interaction(channel,content ?? null);
        } else coverageIssues.push('Unsupported response channel');
      }
      const redactedOutput=clean(response.output.map(item=>item.type==='function_call'?{...item,arguments:'[withheld]'}:item));
      const redactedIdentity=clean({id:response.id,model:response.model,requestId:response.requestId});
      responses.push({id:typeof redactedIdentity.id==='string'?redactedIdentity.id:null,
        model:typeof redactedIdentity.model==='string'?redactedIdentity.model:null,
        requestId:typeof redactedIdentity.requestId==='string'?redactedIdentity.requestId:null,
        outputSha256:hash(JSON.stringify(redactedOutput)),output:structuredClone(redactedOutput),
        transportReceiptSha256:observation ? hash(JSON.stringify(observation)) : null,
        origin:observation?.origin==='responses-live'?'responses-live':'simulated'});
      if (observation) retainReceipt(observation);
      return structuredClone(redactedOutput);
    },
    observeAction(request,result) {
      active();
      const receipt=getScenarioActionObservation(result);
      if (!receipt || receipt.sourceSha!==sourceSha || receipt.requestSha256!==hash(JSON.stringify(request))) {
        throw new Error('Scenario action capture binding mismatch');
      }
      consume(result);
      toolInteraction(request,result);
      retainReceipt(receipt);
      events.push({...receipt.event,evidence:'host-scenario-runtime',sequence:events.length,
        receiptSha256:hash(JSON.stringify(receipt))});
      if (receipt.artifact) events.push({kind:'file_written',attributes:{path:receipt.artifact.path},
        evidence:'host-scenario-runtime',sequence:events.length,artifactSha256:receipt.artifact.sha256});
    },
    observeTool(request, result) {
      active();
      const receipt = getSandboxObservation(result);
      if (receipt && (receipt.sourceSha !== sourceSha || receipt.tool !== request.tool ||
          receipt.requestSha256!==hash(JSON.stringify(request)))) throw new Error('Sandbox capture binding mismatch');
      if (receipt) consume(result);
      toolInteraction(request,result);
      if (receipt) retainReceipt(receipt);
      const evidence = receipt ? 'host-tool-runtime' : 'simulated-runtime';
      events.push({kind:'tool_invoked',attributes:{tool:request.tool},evidence,
        sequence:events.length,receiptSha256:receipt ? hash(JSON.stringify(receipt)) : null});
      if (request.tool === 'artifact.write') events.push({kind:'file_written',attributes:{path:request.path},evidence,
        sequence:events.length,artifactSha256:receipt?.artifact?.sha256 ?? null});
      if (receipt && request.tool === 'git.diff-check') events.push({kind:'verification_observed',
        attributes:{command:'git diff --check',exitCode:result.exitCode},evidence,sequence:events.length,receiptSha256:hash(JSON.stringify(receipt))});
    },
    async finish(complete) {
      active();sealed=true;
      const live=responses.length>0 && responses.every(response=>response.origin==='responses-live');
      if (calls!==observedCalls) coverageIssues.push('Function-call arguments or outcomes were not observed');
      const trace = {schemaVersion:1,scenarioId,sourceSha,modelIdentity,complete:complete === true,
        execution:{kind:live?'responses-live':'simulated',agentLaunched:live},behavioralStatus:'BLOCKED',events,responses,receipts,interactions,
        coverage:{version:1,channels:[...INTERACTION_CHANNELS],complete:complete===true && coverageIssues.length===0,issues:coverageIssues}};
      const bytes = Buffer.from(JSON.stringify(trace));
      const envelope = {...trace,authentication:{kind:'host-session-hmac-sha256',mac:mac(bytes).toString('hex')}};
      const saved = Buffer.from(JSON.stringify(envelope,null,2)+'\n');
      if (saved.length>1024*1024) throw new Error('Capture evidence limit exceeded');
      digest=hash(saved);
      await writeFile(tracePath,saved,{flag:'wx',mode:0o600});
      return {tracePath,traceSha256:digest,authentication:'local-session-integrity',behavioralStatus:'BLOCKED'};
    },
    async verify() {
      if (!sealed || !digest) return false;
      try {
        const bytes=await readFile(tracePath);
        const {authentication,...trace}=JSON.parse(bytes);
        const signature=Buffer.from(authentication?.mac ?? '', 'hex');
        return hash(bytes) === digest && authentication?.kind === 'host-session-hmac-sha256' &&
          signature.length === 32 && timingSafeEqual(mac(Buffer.from(JSON.stringify(trace))),signature);
      } catch {return false;}
    },
  });
}
