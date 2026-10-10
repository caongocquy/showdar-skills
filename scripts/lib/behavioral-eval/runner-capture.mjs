import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSandboxObservation } from './sandbox-tool-runtime.mjs';

const hash = bytes=>createHash('sha256').update(bytes).digest('hex');

/** Host session integrity only. Durable origin authentication still requires the trusted CI signer. */
export function createRunnerCapture({directory,scenarioId,sourceSha,modelIdentity}) {
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
  return Object.freeze({
    observeResponse(response, redactedOutput) {
      active();
      // Caller-injected model transports are permanently simulated, regardless of their JSON fields.
      responses.push({id:typeof response.id==='string'?response.id:null,
        model:typeof response.model==='string'?response.model:null,
        requestId:typeof response.requestId==='string'?response.requestId:null,
        outputSha256:hash(JSON.stringify(redactedOutput)),output:structuredClone(redactedOutput),origin:'simulated'});
    },
    observeTool(request, result) {
      active();
      const receipt = getSandboxObservation(result);
      if (receipt && (receipt.sourceSha !== sourceSha || receipt.tool !== request.tool)) throw new Error('Sandbox capture binding mismatch');
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
      const trace = {schemaVersion:1,scenarioId,sourceSha,modelIdentity,complete:complete === true,
        execution:{kind:'simulated',agentLaunched:false},behavioralStatus:'BLOCKED',events,responses};
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
