import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSandboxObservation } from './sandbox-tool-runtime.mjs';
import { getResponsesObservation } from './responses-transport.mjs';
import { getScenarioActionObservation } from './scenario-actions.mjs';

const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const consumed=new WeakSet();

/** Host session integrity only. Durable origin authentication still requires the trusted CI signer. */
export function createRunnerCapture({directory,scenarioId,sourceSha,modelIdentity,apiKey=''}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '') || typeof scenarioId !== 'string' || typeof modelIdentity !== 'string') {
    throw new Error('Capture requires source, scenario and model binding');
  }
  const key = randomBytes(32);
  const events=[]; const responses=[];
  const tracePath = path.join(directory,'trace.json');
  let sealed = false;
  let digest;
  const mac = bytes=>createHmac('sha256',key).update(bytes).digest();
  const active = ()=>{if (sealed) throw new Error('Capture already sealed');};
  const clean=value=>JSON.parse(JSON.stringify(value).split(apiKey || '\0').join('[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]'));
  const consume=result=>{if (consumed.has(result)) throw new Error('Capture observation replay');consumed.add(result);};
  return Object.freeze({
    observeResponse(response) {
      active();
      const observation=getResponsesObservation(response);
      if (observation?.origin==='responses-live' && observation.modelIdentity!==modelIdentity) throw new Error('Capture model identity mismatch');
      if (!Array.isArray(response.output)) throw new Error('Capture response output unavailable');
      if (observation) consume(response);
      const redactedOutput=clean(response.output.map(item=>item.type==='function_call'?{...item,arguments:'[withheld]'}:item));
      const redactedIdentity=clean({id:response.id,model:response.model,requestId:response.requestId});
      responses.push({id:typeof redactedIdentity.id==='string'?redactedIdentity.id:null,
        model:typeof redactedIdentity.model==='string'?redactedIdentity.model:null,
        requestId:typeof redactedIdentity.requestId==='string'?redactedIdentity.requestId:null,
        outputSha256:hash(JSON.stringify(redactedOutput)),output:structuredClone(redactedOutput),
        transportReceiptSha256:observation ? hash(JSON.stringify(observation)) : null,
        origin:observation?.origin==='responses-live'?'responses-live':'simulated'});
      return structuredClone(redactedOutput);
    },
    observeAction(request,result) {
      active();
      const receipt=getScenarioActionObservation(result);
      if (!receipt || receipt.sourceSha!==sourceSha || receipt.requestSha256!==hash(JSON.stringify(request))) {
        throw new Error('Scenario action capture binding mismatch');
      }
      consume(result);
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
      const evidence = receipt ? 'host-tool-runtime' : 'simulated-runtime';
      events.push({kind:'tool_invoked',attributes:{tool:request.tool},evidence,
        sequence:events.length,receiptSha256:receipt ? hash(JSON.stringify(receipt)) : null});
      if (request.tool === 'artifact.write') events.push({kind:'file_written',attributes:{path:request.path},evidence,
        sequence:events.length,artifactSha256:receipt?.artifact?.sha256 ?? null});
      if (receipt && request.tool === 'git.diff-check') events.push({kind:'verification_observed',
        attributes:{command:'git diff --check',exitCode:result.exitCode},evidence,sequence:events.length});
    },
    async finish(complete) {
      active();sealed=true;
      const live=responses.length>0 && responses.every(response=>response.origin==='responses-live');
      const trace = {schemaVersion:1,scenarioId,sourceSha,modelIdentity,complete:complete === true,
        execution:{kind:live?'responses-live':'simulated',agentLaunched:live},behavioralStatus:'BLOCKED',events,responses};
      const bytes = Buffer.from(JSON.stringify(trace));
      const envelope = {...trace,authentication:{kind:'host-session-hmac-sha256',mac:mac(bytes).toString('hex')}};
      const saved = Buffer.from(JSON.stringify(envelope,null,2)+'\n');
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
