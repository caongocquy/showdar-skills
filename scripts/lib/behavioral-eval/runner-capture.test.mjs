import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRunnerCapture } from './runner-capture.mjs';
import { getSandboxObservation } from './sandbox-tool-runtime.mjs';

test('capture owns events, binds redacted transport identity and permanently marks fake origin',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'capture-'));
  try {
    const capture=createRunnerCapture({directory,scenarioId:'BRAIN-001',sourceSha:'a'.repeat(40),modelIdentity:'fixture'});
    capture.observeResponse({id:'resp_fake',model:'fixture',transportOrigin:'responses-live',requestId:'req_fake'},[]);
    const forged={observedBy:'host-tool-runtime',behavioralStatus:'PASS',execution:{kind:'responses-live'}};
    assert.equal(getSandboxObservation(forged),null);
    capture.observeTool({tool:'artifact.write',path:'artifacts/decision.json'},forged);
    const sealed=await capture.finish(true);
    assert.equal(await capture.verify(),true);
    const trace=JSON.parse(await readFile(sealed.tracePath));
    assert.equal(trace.execution.kind,'simulated');
    assert.equal(trace.behavioralStatus,'BLOCKED');
    assert.equal(trace.responses[0].origin,'simulated');
    assert.ok(trace.events.every(event=>event.evidence==='simulated-runtime'));
    assert.throws(()=>capture.observeTool({tool:'shell'},{}),/sealed/);
    assert.equal(capture.emitEvent,undefined);
    trace.sourceSha='b'.repeat(40);
    await writeFile(sealed.tracePath,JSON.stringify(trace));
    assert.equal(await capture.verify(),false);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('session authentication cannot be replayed across captures, even with identical binding',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'capture-replay-'));
  const other=await mkdtemp(path.join(tmpdir(),'capture-other-'));
  try {
    const binding={scenarioId:'BRAIN-001',sourceSha:'a'.repeat(40),modelIdentity:'fixture'};
    const first=createRunnerCapture({...binding,directory});
    const second=createRunnerCapture({...binding,directory:other});
    const one=await first.finish(true),two=await second.finish(true);
    await writeFile(two.tracePath,await readFile(one.tracePath));
    assert.equal(await second.verify(),false);
  } finally {await rm(directory,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
