import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFLOW_EVENT_TYPES,
  projectWorkflowEvents,
  eventKey,
  normalizeTrace,
  assertNoAuthority,
  validateWorkflowEvent,
} from '../src/workflow-trace.js';
import {
  createWorkflowState,
  startStage,
  completeStage,
  skipStage,
  recordEvidence,
  addWorkflowBlocker,
  removeWorkflowBlocker,
  interruptWorkflow,
  finalizeWorkflow,
  serializeWorkflowState,
  resumeFromCheckpoint,
  selectableStages,
} from '../src/workflow-state.js';

function receipt(kind, quality = 'verified', source = 'showdar-build', detail = 'd') {
  return { kind, quality, source, detail, timestamp: new Date().toISOString() };
}

function featureState() {
  const created = createWorkflowState('showdar-feature', { selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'] });
  assert.ok(created.ok);
  return created.value;
}

test('event types are the frozen ten', () => {
  assert.deepEqual([...WORKFLOW_EVENT_TYPES], [
    'workflow-created', 'stages-selected', 'stage-entered', 'evidence-recorded',
    'stage-completed', 'stage-skipped', 'workflow-blocked', 'workflow-interrupted',
    'workflow-resumed', 'workflow-completed',
  ]);
});

test('create projects workflow-created plus stages-selected for reduced selection', () => {
  const state = featureState();
  const events = projectWorkflowEvents(null, state, { op: 'create' });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'workflow-created');
  assert.equal(events[0].stage, null);
  assert.deepEqual(events[0].detail.selectedStages, ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']);
  assert.equal(events[1].type, 'stages-selected');
  assert.equal(events[0].revision, 0);
  assert.ok(Object.isFrozen(events) && Object.isFrozen(events[0]));
});

test('create with full selection emits only workflow-created', () => {
  const created = createWorkflowState('showdar-feature', { selectedStages: selectableStages('showdar-feature') });
  assert.ok(created.ok);
  const events = projectWorkflowEvents(null, created.value, { op: 'create' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'workflow-created');
});

test('start projects stage-entered', () => {
  const prev = featureState();
  const next = startStage(prev, 'showdar-understand');
  const events = projectWorkflowEvents(prev, next, { op: 'start', stage: 'showdar-understand' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'stage-entered');
  assert.equal(events[0].stage, 'showdar-understand');
  assert.equal(events[0].revision, next.revision);
});

test('complete projects stage-completed without workflow-completed mid-run', () => {
  let state = featureState();
  state = startStage(state, 'showdar-understand');
  const prev = state;
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  const events = projectWorkflowEvents(prev, state, { op: 'complete' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'stage-completed');
  assert.deepEqual(events[0].detail.receiptKinds, ['architecture-understood']);
  assert.deepEqual(events[0].detail.receiptQualities, ['verified']);
});

test('complete of final stage also emits workflow-completed', () => {
  let state = createWorkflowState('showdar-release', { selectedStages: ['showdar-quality', 'showdar-ship'] }).value;
  state = startStage(state, 'showdar-quality');
  state = completeStage(state, 'showdar-quality', [receipt('architecture-understood', 'verified', 'showdar-quality')]);
  state = startStage(state, 'showdar-ship');
  const prev = state;
  state = completeStage(state, 'showdar-ship', [receipt('release-readiness-verified', 'verified', 'showdar-ship')]);
  const events = projectWorkflowEvents(prev, state, { op: 'complete' });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'stage-completed');
  assert.equal(events[1].type, 'workflow-completed');
  assert.deepEqual(events[1].detail.completedStages, ['showdar-quality', 'showdar-ship']);
});

test('record projects evidence-recorded with kinds only', () => {
  const prev = featureState();
  const next = recordEvidence(prev, receipt('behavior-defined', 'observed', 'showdar-requirements', 'free text must not leak'));
  const events = projectWorkflowEvents(prev, next, { op: 'record', receipts: [receipt('behavior-defined', 'observed', 'showdar-requirements')] });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'evidence-recorded');
  assert.deepEqual(events[0].detail.receiptKinds, ['behavior-defined']);
  assert.ok(!JSON.stringify(events[0]).includes('free text must not leak'));
});

test('skip projects stage-skipped with reason and policy', () => {
  const created = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: selectableStages('showdar-feature'),
  });
  assert.ok(created.ok);
  const prev = created.value;
  const next = skipStage(prev, 'showdar-design', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' });
  const events = projectWorkflowEvents(prev, next, { op: 'skip' });
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].type, events[0].stage], ['stage-skipped', 'showdar-design']);
  assert.deepEqual([events[0].detail.reason, events[0].detail.policy], ['no-ux-decision', 'no-ux-decision']);
});

test('block projects workflow-blocked with ids and types only', () => {
  const prev = featureState();
  const next = addWorkflowBlocker(prev, { id: 'prod-auth', reason: 'secret reason text', type: 'authorization' });
  const events = projectWorkflowEvents(prev, next, { op: 'block' });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail.blockerIds, ['prod-auth']);
  assert.deepEqual(events[0].detail.blockerTypes, ['authorization']);
  assert.ok(!JSON.stringify(events[0]).includes('secret reason text'));
});

test('unblock emits nothing', () => {
  let state = featureState();
  state = addWorkflowBlocker(state, { id: 'b1', reason: 'x', type: 'evidence' });
  const prev = state;
  state = removeWorkflowBlocker(state, 'b1');
  const events = projectWorkflowEvents(prev, state, { op: 'unblock' });
  assert.equal(events.length, 0);
});

test('interrupt projects workflow-interrupted', () => {
  let state = featureState();
  state = startStage(state, 'showdar-understand');
  const prev = state;
  state = interruptWorkflow(state, 'pause');
  const events = projectWorkflowEvents(prev, state, { op: 'interrupt' });
  assert.deepEqual(events.map((e) => e.type), ['workflow-interrupted']);
});

test('compatible resume projects workflow-resumed ready only', () => {
  let state = featureState();
  state = startStage(state, 'showdar-understand');
  state = interruptWorkflow(state, 'pause');
  const prev = state;
  const resumed = resumeFromCheckpoint(serializeWorkflowState(state), { primary: { skill: 'showdar-understand' }, verificationPlan: { required: [] } });
  assert.equal(resumed.replanRequired, false);
  const events = projectWorkflowEvents(prev, resumed.state, { op: 'resume', resolutionOutcome: 'ready', staleReason: null });
  assert.deepEqual(events.map((e) => e.type), ['workflow-resumed']);
  assert.deepEqual(events[0].detail, { outcome: 'ready', staleReason: null });
});

test('stale resume projects resumed-blocked plus workflow-blocked', () => {
  let state = featureState();
  state = startStage(state, 'showdar-understand');
  state = interruptWorkflow(state, 'pause');
  const prev = state;
  const resumed = resumeFromCheckpoint(serializeWorkflowState(state), { primary: { skill: 'showdar-ops' }, verificationPlan: { required: [] } });
  assert.equal(resumed.replanRequired, true);
  const events = projectWorkflowEvents(prev, resumed.state, { op: 'resume', resolutionOutcome: 'blocked', staleReason: resumed.reason });
  assert.deepEqual(events.map((e) => e.type), ['workflow-resumed', 'workflow-blocked']);
  assert.equal(events[0].detail.outcome, 'blocked');
  assert.equal(events[0].detail.staleReason, 'workflow-no-longer-applicable');
});

test('finalize projects workflow-completed', () => {
  let state = createWorkflowState('showdar-release', { selectedStages: ['showdar-quality', 'showdar-ship'] }).value;
  state = startStage(state, 'showdar-quality');
  state = completeStage(state, 'showdar-quality', [receipt('architecture-understood', 'verified', 'showdar-quality')]);
  state = startStage(state, 'showdar-ship');
  state = completeStage(state, 'showdar-ship', [receipt('release-readiness-verified', 'verified', 'showdar-ship')]);
  const prev = state;
  state = finalizeWorkflow(state);
  const events = projectWorkflowEvents(prev, state, { op: 'finalize' });
  assert.deepEqual(events.map((e) => e.type), ['workflow-completed']);
});

test('eventKey strips seq and revision', () => {
  const a = { seq: 0, type: 'stage-entered', workflowId: 'showdar-feature', revision: 1, stage: 'showdar-build', detail: {} };
  const b = { seq: 7, type: 'stage-entered', workflowId: 'showdar-feature', revision: 42, stage: 'showdar-build', detail: {} };
  assert.equal(eventKey(a), eventKey(b));
  assert.deepEqual(normalizeTrace([a, b]), [eventKey(a), eventKey(a)]);
});

test('projected events carry no timestamps', () => {
  let state = featureState();
  state = startStage(state, 'showdar-understand');
  const events = projectWorkflowEvents(featureState(), state, { op: 'start', stage: 'showdar-understand' });
  assert.ok(!JSON.stringify(events).match(/timestamp|Date\.now|durationMs/));
});

test('assertNoAuthority throws on all seven forbidden keys', () => {
  const keys = ['primaryCapability', 'authorizedAction', 'mutationPermission', 'routeAuthority', 'governingAction', 'cachedAuthority', 'authorityDecision'];
  for (const key of keys) {
    assert.throws(() => assertNoAuthority({ type: 'stage-entered', detail: { [key]: 'x' } }), /authority-derived/);
  }
});

test('assertNoAuthority passes on a full real feature trace', () => {
  let state = createWorkflowState('showdar-feature', { selectedStages: selectableStages('showdar-feature') }).value;
  const all = [...projectWorkflowEvents(null, state, { op: 'create' })];
  const kinds = {
    'showdar-understand': ['architecture-understood'], 'showdar-requirements': ['behavior-defined'],
    'showdar-plan': ['architecture-understood'], 'showdar-design': ['targeted-tests-passed'],
    'showdar-build': ['change-implemented'], 'showdar-test': ['targeted-tests-passed'], 'showdar-review': ['targeted-tests-passed'],
  };
  for (const stage of selectableStages('showdar-feature')) {
    const prev = state;
    state = startStage(state, stage);
    all.push(...projectWorkflowEvents(prev, state, { op: 'start', stage }));
    const before = state;
    state = completeStage(state, stage, [receipt(kinds[stage][0], 'verified', stage)]);
    all.push(...projectWorkflowEvents(before, state, { op: 'complete' }));
  }
  for (const event of all) assertNoAuthority(event);
  assert.ok(all.length > 10);
});

test('validateWorkflowEvent rejects bad input', () => {
  assert.ok(!validateWorkflowEvent({ seq: 0, type: 'nope', workflowId: 'w', revision: 0, stage: null, detail: {} }).ok);
  assert.ok(!validateWorkflowEvent({ seq: 0, type: 'stage-entered', workflowId: 'w', revision: 0, stage: 42, detail: {} }).ok);
  assert.ok(!validateWorkflowEvent({ seq: 0, type: 'stage-entered', workflowId: 'w', revision: 0, stage: null, detail: null }).ok);
  assert.ok(!validateWorkflowEvent({ seq: 0, type: 'stage-entered', workflowId: 'w', revision: 0, stage: null, detail: {}, extra: 1 }).ok);
  assert.ok(validateWorkflowEvent({ seq: 0, type: 'stage-entered', workflowId: 'showdar-feature', revision: 1, stage: 'showdar-build', detail: {} }).ok);
});

test('projector rejects missing op and unknown op', () => {
  const state = featureState();
  assert.throws(() => projectWorkflowEvents(null, state, {}), /input\.op/);
  assert.throws(() => projectWorkflowEvents(null, state, { op: 'teleport' }), /Unknown workflow trace op/);
});

test('projector rejects invalid states', () => {
  const state = featureState();
  assert.throws(() => projectWorkflowEvents({ nope: true }, state, { op: 'start' }), /Invalid prev/);
  assert.throws(() => projectWorkflowEvents(null, { nope: true }, { op: 'start' }), /Invalid next/);
});

test('two identical runs produce byte-identical normalized traces', () => {
  function run() {
    let state = featureState();
    const keys = [...normalizeTrace(projectWorkflowEvents(null, state, { op: 'create' }))];
    let prev = state;
    state = startStage(state, 'showdar-understand');
    keys.push(...normalizeTrace(projectWorkflowEvents(prev, state, { op: 'start', stage: 'showdar-understand' })));
    prev = state;
    state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
    keys.push(...normalizeTrace(projectWorkflowEvents(prev, state, { op: 'complete' })));
    return keys;
  }
  assert.deepEqual(run(), run());
});
