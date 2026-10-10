import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineResponsesTransport, createLiveResponsesTransport, getResponsesObservation } from './responses-transport.mjs';

const request = {model:'fixture-model',input:[{role:'user',content:'fixture'}],tools:[],
  store:false,parallel_tool_calls:false,max_output_tokens:2048};
test('live transport opt-in never substitutes for verified safety gates',async()=>{
  let called = false;
  const previous = globalThis.fetch;
  globalThis.fetch = async()=>{called=true;throw new Error('unexpected network');};
  try {
    for (const options of [{},{allowModel:true,apiKey:'test-only-key',verified:true,sandboxVerified:true}]) {
      await assert.rejects(createLiveResponsesTransport(options)(request),/disabled|opt-in/);
    }
    assert.equal(called,false);
  } finally {globalThis.fetch=previous;}
});
test('model-free HTTP contract has fixed endpoint, bounded bodies, cancellation and no redirects',async()=>{
  const transport = createOfflineResponsesTransport({apiKey:'test-only-key',fakeFetch:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.redirect,'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization,'Bearer test-only-key');
    assert.deepEqual(JSON.parse(options.body),request);
    return new Response(JSON.stringify({id:'resp_fixture',status:'completed',model:request.model,output:[]}),
      {headers:{'content-type':'application/json','x-request-id':'req_fixture'}});
  }});
  const result = await transport(request);
  assert.equal(result.model,request.model);
  assert.equal(result.transportOrigin,'simulated');
  assert.equal(result.requestId,'req_fixture');
  assert.doesNotMatch(JSON.stringify(result),/test-only-key/);
  assert.equal(getResponsesObservation(result).origin,'simulated');
  assert.equal(getResponsesObservation(JSON.parse(JSON.stringify(result))),null);
  result.output.push({type:'message',content:'forged'});
  assert.throws(()=>getResponsesObservation(result),/modified/);
});
test('malformed requests and error, incomplete, oversized, credential-bearing HTTP responses fail closed',async()=>{
  let called = false;
  const transport = createOfflineResponsesTransport({fakeFetch:async()=>{called=true;return new Response('{}');}});
  for (const bad of [{...request,store:true},{...request,parallel_tool_calls:true},{...request,endpoint:'https://evil'},
    {...request,tools:[{type:'web_search'}]},{...request,input:'x'.repeat(524289)}]) await assert.rejects(transport(bad));
  assert.equal(called,false);
  for (const response of [new Response('secret',{status:401}),new Response('x'.repeat(65537)),
    new Response(JSON.stringify({id:'r',status:'incomplete',model:'m',output:[]})),
    new Response(JSON.stringify({id:'r',status:'completed',model:'m',output:[{type:'message',content:'test-only-key'}]}))]) {
    const send = createOfflineResponsesTransport({apiKey:'test-only-key',fakeFetch:async()=>response});
    await assert.rejects(send(request),error=>!error.message.includes('test-only-key'));
  }
});
test('HTTP timeout aborts the transport and does not retry',async()=>{
  let calls=0;
  const send=createOfflineResponsesTransport({timeoutMs:5,fakeFetch:async(_url,{signal})=>{
    calls++;
    return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  }});
  await assert.rejects(send(request),/failed/);
  assert.equal(calls,1);
});
test('JSON-escaped credentials and credential-bearing request IDs never become transport observations',async()=>{
  for(const [body,requestId] of [
    [String.raw`{"id":"r","status":"completed","model":"fixture-model","output":[{"type":"message","content":"\u0074est-only-key"}]}`,'req'],
    [JSON.stringify({id:'r',status:'completed',model:'fixture-model',output:[]}),'test-only-key'],
  ]) {
    const send=createOfflineResponsesTransport({apiKey:'test-only-key',fakeFetch:async()=>new Response(body,{headers:{'x-request-id':requestId}})});
    await assert.rejects(send(request),error=>/denied/.test(error.message)&&!error.message.includes('test-only-key'));
  }
});
