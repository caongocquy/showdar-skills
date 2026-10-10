import { createHash } from 'node:crypto';

const ENDPOINT = 'https://api.openai.com/v1/responses';
export const LIVE_TRANSPORT_BLOCKER = 'Live Responses disabled: trusted live producer, observable semantic events and attestation E2E have not been verified';
const REQUEST_LIMIT = 512 * 1024;
const RESPONSE_LIMIT = 64 * 1024;
// Deployment gate changes require the documented real attestation and semantic-observation acceptance.
const LIVE_EXECUTION_GATES_VERIFIED = false;
const nativeFetch = globalThis.fetch.bind(globalThis);
const observations = new WeakMap();
const hash = value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Transport origin is minted here, never imported from response JSON or a caller trust flag. */
export function getResponsesObservation(response) {
  const observation = observations.get(response);
  if (!observation) return null;
  if (hash(response) !== observation.resultSha256) throw new Error('Responses observation was modified');
  return structuredClone(observation);
}

async function send(request, {fetchImpl, apiKey, timeoutMs, origin}) {
  const allowed = ['model','input','tools','store','parallel_tool_calls','max_output_tokens'];
  if (!request || Object.keys(request).some(key=>!allowed.includes(key)) ||
      typeof request.model !== 'string' || !request.model.trim() || !Array.isArray(request.input) ||
      request.store !== false || request.parallel_tool_calls !== false || request.max_output_tokens !== 2048 ||
      !Array.isArray(request.tools) || request.tools.some(tool=>tool.type !== 'function' || tool.strict !== true) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Invalid Responses transport contract');
  const body = JSON.stringify(request);
  if (Buffer.byteLength(body) > REQUEST_LIMIT || (apiKey && body.includes(apiKey))) throw new Error('Responses request denied');
  let reader;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_,reject)=>{
    timer = setTimeout(()=>{controller.abort();reject(new Error('Transport timeout'));},timeoutMs);
  });
  const bounded = promise=>Promise.race([promise,timeout]);
  try {
    const response = await bounded(fetchImpl(ENDPOINT, {method:'POST', redirect:'error', signal:controller.signal,
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'}, body}));
    if (!response.ok || response.redirected || !response.body) throw new Error('HTTP response denied');
    reader = response.body.getReader();
    const chunks=[]; let length=0;
    for (;;) {
      const {done,value} = await bounded(reader.read());
      if (done) break;
      length += value.byteLength;
      if (length > RESPONSE_LIMIT) throw new Error('Response limit exceeded');
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (apiKey && text.includes(apiKey)) throw new Error('Credential exposure denied');
    const value = JSON.parse(text);
    if (apiKey && JSON.stringify(value).includes(apiKey)) throw new Error('Decoded credential exposure denied');
    if (typeof value.id !== 'string' || !value.id || value.status !== 'completed' ||
        value.model !== request.model || !Array.isArray(value.output)) throw new Error('Invalid Responses result');
    const requestId=response.headers.get('x-request-id');
    if (apiKey && requestId?.includes(apiKey)) throw new Error('Credential-bearing response identity denied');
    if (origin==='responses-live' && (!requestId || requestId.length>256)) throw new Error('Live response identity unavailable');
    const result={...value,requestId,transportOrigin:origin};
    observations.set(result,{kind:'responses-transport-observation',origin,modelIdentity:value.model,
      responseId:value.id,requestId,requestSha256:hash(request),resultSha256:hash(result)});
    return result;
  } catch {
    // HTTP error bodies and exception text can contain secrets; never return them as evidence.
    throw new Error('Responses transport failed or response was denied');
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) {reader.cancel().catch(()=>{});reader.releaseLock();}
  }
}

/** A wire-contract fixture cannot mint live provenance, even when it returns API-shaped JSON. */
export function createOfflineResponsesTransport({fakeFetch,apiKey='',timeoutMs=30000} = {}) {
  if (typeof fakeFetch !== 'function') throw new Error('Explicit fake HTTP transport required');
  return request=>send(request,{fetchImpl:fakeFetch,apiKey,timeoutMs,origin:'simulated'});
}

/** Opt-in is necessary; it cannot override the unverified deployment gates. */
export function assertLiveTransportEnabled(allowModel) {
  if (allowModel !== true) throw new Error('Explicit paid-model opt-in required');
  if (!LIVE_EXECUTION_GATES_VERIFIED) throw new Error(LIVE_TRANSPORT_BLOCKER);
}

export function createLiveResponsesTransport({allowModel=false,apiKey='',timeoutMs=30000} = {}) {
  return async request=>{
    assertLiveTransportEnabled(allowModel);
    if (!apiKey) throw new Error('Live credential unavailable');
    return send(request,{fetchImpl:nativeFetch,apiKey,timeoutMs,origin:'responses-live'});
  };
}
