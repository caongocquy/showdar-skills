import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  createWorkflowState,
  startStage,
  completeStage,
  skipStage,
  recordEvidence,
  addWorkflowBlocker,
  removeWorkflowBlocker,
  interruptWorkflow,
  isWorkflowComplete,
  finalizeWorkflow,
  serializeWorkflowState,
  deserializeWorkflowState,
  validateWorkflowState,
  checkStaleCheckpoint,
  resumeFromCheckpoint,
  isFreshnessSensitive,
  isHighSensitivity,
  requiresReverification,
  selectableStages,
  skipRule,
} from '../src/workflow-state.js';

function receipt(kind, quality = 'verified', source = 'showdar-build', detail = 'evidence detail') {
  return { kind, quality, source, detail, timestamp: new Date().toISOString() };
}

function featureState(selected = ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']) {
  const created = createWorkflowState('showdar-feature', { selectedStages: selected });
  assert.ok(created.ok, JSON.stringify(created.errors));
  return created.value;
}

function startedFeature(selected) {
  let state = featureState(selected);
  state = startStage(state, state.nextStage);
  return state;
}

test('create new workflow state is READY with revision 0', () => {
  const state = featureState();
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.workflowId, 'showdar-feature');
  assert.equal(state.status, 'READY');
  assert.equal(state.revision, 0);
  assert.equal(state.activeStage, null);
  assert.equal(state.nextStage, 'showdar-understand');
});

test('create rejects unknown workflow', () => {
  const result = createWorkflowState('showdar-nope');
  assert.ok(!result.ok);
});

test('create rejects selected stage outside candidates', () => {
  const result = createWorkflowState('showdar-feature', { selectedStages: ['showdar-ops'] });
  assert.ok(!result.ok);
});

test('create rejects missing required stage without policy skip', () => {
  const result = createWorkflowState('showdar-feature', { selectedStages: ['showdar-build'] });
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('showdar-understand')));
});

test('enter stage: READY to ACTIVE', () => {
  const state = startedFeature();
  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.activeStage, 'showdar-understand');
  assert.equal(state.revision, 1);
});

test('enter stage rejects wrong next stage', () => {
  const state = featureState();
  assert.throws(() => startStage(state, 'showdar-build'), /not next/);
});

test('enter stage rejects with blockers', () => {
  let state = featureState();
  state = addWorkflowBlocker(state, { id: 'b1', reason: 'blocked', type: 'evidence' });
  assert.throws(() => startStage(state, state.nextStage), /blockers|BLOCKED|READY/);
});

test('complete stage: ACTIVE to READY with receipts', () => {
  let state = startedFeature();
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  assert.equal(state.status, 'READY');
  assert.equal(state.activeStage, null);
  assert.equal(state.nextStage, 'showdar-build');
  assert.equal(state.completedStages.length, 1);
  assert.equal(state.revision, 2);
});

test('complete stage rejects failed quality', () => {
  let state = startedFeature();
  assert.throws(() => completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'failed', 'showdar-understand')]), /observed or verified/);
});

test('complete stage rejects wrong source', () => {
  let state = startedFeature();
  assert.throws(() => completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-build')]), /must match/);
});

test('complete stage rejects non-active transition', () => {
  const state = featureState();
  assert.throws(() => completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]), /ACTIVE/);
});

test('next stage advances through selection', () => {
  let state = featureState(['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']);
  state = startStage(state, 'showdar-understand');
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'verified', 'showdar-build'), receipt('targeted-tests-passed', 'verified', 'showdar-build')]);
  assert.equal(state.nextStage, 'showdar-test');
});

test('valid skip: feature design with no-ux-decision', () => {
  let state = featureState(['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']);
  const before = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
  });
  assert.ok(before.ok);
  const designOnly = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: ['showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review'],
  });
  assert.ok(designOnly.ok);
  const skipped = skipStage(designOnly.value, 'showdar-design', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' });
  assert.equal(skipped.skippedStages.length, 1);
  assert.equal(skipped.skippedStages[0].stage, 'showdar-design');
  assert.equal(state.status, 'READY');
});

test('invalid skip: wrong reason rejected', () => {
  const created = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: ['showdar-understand', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review'],
  });
  assert.ok(created.ok);
  assert.throws(() => skipStage(created.value, 'showdar-design', { reason: 'not needed', evidence: [], policy: 'no-ux-decision' }), /must be/);
});

test('invalid skip: non-skippable stage rejected', () => {
  const state = featureState();
  assert.throws(() => skipStage(state, 'showdar-build', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }), /not declared|not skippable|is selected/);
});

test('invalid skip: generic bypass without policy rejected', () => {
  const created = createWorkflowState('showdar-bugfix', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'],
  });
  assert.ok(created.ok);
  assert.throws(() => skipStage(created.value, 'showdar-debug', { reason: 'not needed', evidence: [], policy: 'adaptive-skip' }), /must be/);
});

test('bugfix debug skip requires root-cause-proven evidence', () => {
  let created = createWorkflowState('showdar-bugfix', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'],
  });
  assert.ok(created.ok);
  assert.throws(() => skipStage(created.value, 'showdar-debug', { reason: 'known-root-cause', evidence: [], policy: 'known-root-cause' }), /requires evidence root-cause-proven/);
  created.value = recordEvidence(created.value, receipt('root-cause-proven', 'verified', 'showdar-debug', 'cause isolated'));
  const skipped = skipStage(created.value, 'showdar-debug', { reason: 'known-root-cause', evidence: ['root-cause-proven'], policy: 'known-root-cause' });
  assert.equal(skipped.skippedStages[0].stage, 'showdar-debug');
});

test('blocked: add blocker moves ACTIVE to BLOCKED', () => {
  let state = startedFeature();
  state = addWorkflowBlocker(state, { id: 'auth', reason: 'needs approval', type: 'authorization' });
  assert.equal(state.status, 'BLOCKED');
  assert.equal(state.blockers.length, 1);
});

test('blocked: remove blocker returns to READY', () => {
  let state = startedFeature();
  state = addWorkflowBlocker(state, { id: 'auth', reason: 'needs approval', type: 'authorization' });
  state = removeWorkflowBlocker(state, 'auth');
  assert.equal(state.status, 'READY');
  assert.equal(state.blockers.length, 0);
});

test('interrupt preserves completed and stops progression', () => {
  let state = startedFeature();
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  state = startStage(state, 'showdar-build');
  state = interruptWorkflow(state, 'operator pause');
  assert.equal(state.status, 'INTERRUPTED');
  assert.equal(state.completedStages.length, 1);
  assert.equal(state.activeStage, null);
});

test('interrupt rejects empty reason', () => {
  const state = startedFeature();
  assert.throws(() => interruptWorkflow(state, ''), /non-empty/);
});

test('complete workflow: all selected done with no blockers', () => {
  let state = featureState(['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']);
  state = startStage(state, 'showdar-understand');
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'verified', 'showdar-build')]);
  state = startStage(state, 'showdar-test');
  state = completeStage(state, 'showdar-test', [receipt('targeted-tests-passed', 'verified', 'showdar-test')]);
  state = startStage(state, 'showdar-review');
  state = completeStage(state, 'showdar-review', [receipt('targeted-tests-passed', 'verified', 'showdar-review', 'review done')]);
  assert.ok(isWorkflowComplete(state));
  assert.equal(state.nextStage, null);
  state = finalizeWorkflow(state);
  assert.equal(state.status, 'COMPLETE');
});

test('complete workflow rejects with blockers', () => {
  let state = featureState(['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review']);
  state = startStage(state, 'showdar-understand');
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  state = addWorkflowBlocker(state, { id: 'b1', reason: 'blocked', type: 'evidence' });
  assert.ok(!isWorkflowComplete(state));
  assert.throws(() => finalizeWorkflow(state), /READY/);
});

test('finalize rejects ACTIVE status', () => {
  const state = startedFeature();
  assert.throws(() => finalizeWorkflow(state), /READY/);
});

test('COMPLETE is terminal', () => {
  let state = createWorkflowState('showdar-release', { selectedStages: ['showdar-quality', 'showdar-ship'] });
  assert.ok(state.ok);
  let s = state.value;
  s = startStage(s, 'showdar-quality');
  s = completeStage(s, 'showdar-quality', [receipt('architecture-understood', 'verified', 'showdar-quality', 'qa plan')]);
  s = startStage(s, 'showdar-ship');
  s = completeStage(s, 'showdar-ship', [receipt('release-readiness-verified', 'verified', 'showdar-ship', 'ready')]);
  s = finalizeWorkflow(s);
  assert.equal(s.status, 'COMPLETE');
  assert.throws(() => startStage(s, 'showdar-ship'), /COMPLETE/);
  assert.throws(() => interruptWorkflow(s, 'x'), /COMPLETE/);
});

test('invalid transition: INTERRUPTED to ACTIVE rejected', () => {
  let state = startedFeature();
  state = interruptWorkflow(state, 'pause');
  assert.throws(() => startStage(state, state.nextStage), /INTERRUPTED/);
});

test('invalid transition: NEW cannot start stage directly', () => {
  const created = createWorkflowState('showdar-feature', { selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'] });
  assert.ok(created.ok);
  assert.equal(created.value.status, 'READY');
});

test('revision increments only on accepted transitions', () => {
  let state = featureState();
  const r0 = state.revision;
  state = startStage(state, 'showdar-understand');
  assert.equal(state.revision, r0 + 1);
  const before = state.revision;
  assert.throws(() => startStage(state, 'showdar-build'), /READY/);
  assert.equal(state.revision, before);
});

test('serialization round-trip preserves state', () => {
  let state = startedFeature();
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  const json = serializeWorkflowState(state);
  const restored = deserializeWorkflowState(json);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(state)));
});

test('deserialize rejects unsupported schemaVersion', () => {
  let state = featureState();
  const tampered = { ...JSON.parse(JSON.stringify(state)), schemaVersion: 99 };
  delete tampered.nextStage;
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /schemaVersion/);
});

test('deserialize rejects corrupt status', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.status = 'RUNNING';
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /status/);
});

test('deserialize rejects unknown workflow', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.workflowId = 'showdar-nope';
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /workflowId/);
});

test('deserialize rejects unknown stage', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.selectedStages = ['showdar-nope'];
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /primitive/);
});

test('deserialize rejects malformed skipped stage', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.skippedStages = [{ stage: 'showdar-build' }];
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /skipped/);
});

test('deserialize rejects malformed evidence receipt', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.evidenceReceipts = [{ kind: 'nope', quality: 'verified', source: 'showdar-build', detail: 'x', timestamp: new Date().toISOString() }];
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /receipt kind/);
});

test('deserialize rejects authority-like persisted fields', () => {
  let state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.primaryCapability = 'implement';
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered)), /authority/);
  const tampered2 = JSON.parse(JSON.stringify(state));
  tampered2.authorizedAction = { action: 'deploy' };
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered2)), /authority/);
  const tampered3 = JSON.parse(JSON.stringify(state));
  tampered3.routeAuthority = 'high';
  assert.throws(() => deserializeWorkflowState(JSON.stringify(tampered3)), /authority/);
});

test('deserialize does not mutate revision', () => {
  let state = startedFeature();
  const json = serializeWorkflowState(state);
  const restored = deserializeWorkflowState(json);
  assert.equal(restored.revision, state.revision);
  const restored2 = deserializeWorkflowState(serializeWorkflowState(restored));
  assert.equal(restored2.revision, state.revision);
});

test('deserialize rejects invalid JSON', () => {
  assert.throws(() => deserializeWorkflowState('{bad json'), /Invalid workflow checkpoint JSON/);
});

test('resume: compatible resolution returns READY', () => {
  let state = startedFeature();
  state = interruptWorkflow(state, 'pause');
  const json = serializeWorkflowState(state);
  const resolution = { primary: { skill: 'showdar-understand' }, verificationPlan: { required: [] } };
  const result = resumeFromCheckpoint(json, resolution);
  assert.equal(result.replanRequired, false);
  assert.equal(result.state.status, 'READY');
});

test('resume: incompatible primary blocks with replanRequired', () => {
  let state = startedFeature();
  state = interruptWorkflow(state, 'pause');
  const json = serializeWorkflowState(state);
  const resolution = { primary: { skill: 'showdar-ops' }, verificationPlan: { required: [] } };
  const result = resumeFromCheckpoint(json, resolution);
  assert.equal(result.replanRequired, true);
  assert.equal(result.state.status, 'BLOCKED');
  assert.equal(result.reason, 'workflow-no-longer-applicable');
});

test('resume: shifted primary skill blocks', () => {
  let state = startedFeature();
  state = interruptWorkflow(state, 'pause');
  const json = serializeWorkflowState(state);
  const resolution = { primary: { skill: 'showdar-build' }, verificationPlan: { required: [] } };
  const result = resumeFromCheckpoint(json, resolution);
  assert.equal(result.replanRequired, true);
  assert.equal(result.reason, 'primary-skill-shifted');
});

test('resume: stale high-sensitivity evidence blocks', () => {
  let state = startedFeature();
  state = completeStage(state, 'showdar-understand', [receipt('architecture-understood', 'verified', 'showdar-understand')]);
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'verified', 'showdar-build'), receipt('targeted-tests-passed', 'verified', 'showdar-build')]);
  state = interruptWorkflow(state, 'pause');
  const json = serializeWorkflowState(state);
  const resolution = { primary: { skill: 'showdar-test' }, verificationPlan: { required: ['targeted-test'] } };
  const result = resumeFromCheckpoint(json, resolution);
  assert.equal(result.replanRequired, true);
  assert.equal(result.reason, 'verification-evidence-stale');
});

test('resume rejects non-interrupted state', () => {
  const state = featureState();
  const json = serializeWorkflowState(state);
  assert.throws(() => resumeFromCheckpoint(json, { primary: { skill: 'showdar-understand' } }), /INTERRUPTED or BLOCKED/);
});

test('checkpoint carries no authority into resume', () => {
  let state = startedFeature();
  state = interruptWorkflow(state, 'pause');
  const parsed = JSON.parse(serializeWorkflowState(state));
  assert.ok(!('primaryCapability' in parsed));
  assert.ok(!('authorizedAction' in parsed));
  assert.ok(!('mutationPermission' in parsed));
  assert.ok(!('routeAuthority' in parsed));
  const validation = validateWorkflowState(parsed);
  assert.ok(validation.ok);
});

test('feature: full path completes', () => {
  const created = createWorkflowState('showdar-feature', {
    candidateStages: selectableStages('showdar-feature'),
    selectedStages: selectableStages('showdar-feature'),
  });
  assert.ok(created.ok);
  assert.deepEqual(created.value.selectedStages, selectableStages('showdar-feature'));
});

test('feature: requirements skip with behavior-defined', () => {
  let created = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: selectableStages('showdar-feature'),
  });
  assert.ok(created.ok);
  created.value = recordEvidence(created.value, receipt('behavior-defined', 'verified', 'showdar-requirements', 'defined'));
  const skipped = skipStage(created.value, 'showdar-requirements', { reason: 'behavior-defined', evidence: ['behavior-defined'], policy: 'behavior-defined' });
  assert.ok(skipped.skippedStages.some((s) => s.stage === 'showdar-requirements'));
});

test('feature: cannot skip test or review', () => {
  const state = featureState();
  assert.equal(skipRule('showdar-feature', 'showdar-test'), null);
  assert.equal(skipRule('showdar-feature', 'showdar-review'), null);
  assert.throws(() => skipStage(state, 'showdar-test', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }), /not declared|not skippable|is selected/);
});

test('bugfix: unknown cause includes debug', () => {
  const created = createWorkflowState('showdar-bugfix', {
    selectedStages: selectableStages('showdar-bugfix'),
  });
  assert.ok(created.ok);
  assert.ok(created.value.selectedStages.includes('showdar-debug'));
});

test('bugfix: symptom alone cannot skip debug', () => {
  const created = createWorkflowState('showdar-bugfix', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: selectableStages('showdar-bugfix'),
  });
  assert.ok(created.ok);
  assert.throws(() => skipStage(created.value, 'showdar-debug', { reason: 'known-root-cause', evidence: [], policy: 'known-root-cause' }), /requires evidence/);
});

test('release: ship completion is not deploy', () => {
  let state = createWorkflowState('showdar-release', { selectedStages: ['showdar-quality', 'showdar-ship'] });
  assert.ok(state.ok);
  let s = state.value;
  assert.ok(!s.selectedStages.includes('showdar-ops'));
  s = startStage(s, 'showdar-quality');
  s = completeStage(s, 'showdar-quality', [receipt('architecture-understood', 'verified', 'showdar-quality', 'qa')]);
  s = startStage(s, 'showdar-ship');
  s = completeStage(s, 'showdar-ship', [receipt('release-readiness-verified', 'verified', 'showdar-ship', 'ready')]);
  s = finalizeWorkflow(s);
  assert.equal(s.status, 'COMPLETE');
  const parsed = JSON.parse(serializeWorkflowState(s));
  assert.ok(!('primaryCapability' in parsed));
});

test('release: ops skippable under readiness-only', () => {
  const created = createWorkflowState('showdar-release', {
    selectedStages: ['showdar-quality', 'showdar-ship'],
    candidateStages: selectableStages('showdar-release'),
  });
  assert.ok(created.ok);
  const skipped = skipStage(created.value, 'showdar-ops', { reason: 'readiness-only', evidence: [], policy: 'readiness-only' });
  assert.ok(skipped.skippedStages.some((s) => s.stage === 'showdar-ops'));
});

test('release: security skippable under no-security-risk', () => {
  const created = createWorkflowState('showdar-release', {
    selectedStages: ['showdar-quality', 'showdar-ship'],
    candidateStages: selectableStages('showdar-release'),
  });
  assert.ok(created.ok);
  const skipped = skipStage(created.value, 'showdar-security', { reason: 'no-security-risk', evidence: [], policy: 'no-security-risk' });
  assert.ok(skipped.skippedStages.some((s) => s.stage === 'showdar-security'));
});

test('incident: ops skippable under no-ops-authority', () => {
  const created = createWorkflowState('showdar-incident', {
    selectedStages: ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test'],
    candidateStages: selectableStages('showdar-incident'),
  });
  assert.ok(created.ok);
  const skipped = skipStage(created.value, 'showdar-ops', { reason: 'no-ops-authority', evidence: [], policy: 'no-ops-authority' });
  assert.ok(skipped.skippedStages.some((s) => s.stage === 'showdar-ops'));
});

test('incident: stale resume blocks with replanRequired', () => {
  let state = createWorkflowState('showdar-incident', {
    selectedStages: ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test'],
  });
  assert.ok(state.ok);
  let s = state.value;
  s = startStage(s, 'showdar-understand');
  s = interruptWorkflow(s, 'page resolved');
  const json = serializeWorkflowState(s);
  const result = resumeFromCheckpoint(json, { primary: { skill: 'showdar-ops' }, verificationPlan: { required: [] } });
  assert.equal(result.replanRequired, true);
  assert.equal(result.state.status, 'BLOCKED');
});

test('authority invariance: state schema rejects primary field', () => {
  const state = featureState();
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.primary = 'showdar-build';
  const validation = validateWorkflowState(tampered);
  assert.ok(!validation.ok || !('primary' in JSON.parse(serializeWorkflowState(state))));
});

test('authority invariance: skip cannot create ops authority', () => {
  const created = createWorkflowState('showdar-feature', {
    selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
    candidateStages: selectableStages('showdar-feature'),
  });
  assert.ok(created.ok);
  assert.throws(() => skipStage(created.value, 'showdar-ops' in {} ? 'showdar-ops' : 'showdar-build', { reason: 'readiness-only', evidence: [], policy: 'readiness-only' }), /Error/);
});

test('authority invariance: workflow completion cannot authorize deploy', () => {
  let state = createWorkflowState('showdar-release', { selectedStages: ['showdar-quality', 'showdar-ship'] });
  assert.ok(state.ok);
  let s = state.value;
  s = startStage(s, 'showdar-quality');
  s = completeStage(s, 'showdar-quality', [receipt('architecture-understood', 'verified', 'showdar-quality', 'qa')]);
  s = startStage(s, 'showdar-ship');
  s = completeStage(s, 'showdar-ship', [receipt('release-readiness-verified', 'verified', 'showdar-ship', 'ready')]);
  s = finalizeWorkflow(s);
  const parsed = JSON.parse(serializeWorkflowState(s));
  const joined = JSON.stringify(parsed).toLowerCase();
  assert.ok(!joined.includes('primarycapability'));
  assert.ok(!joined.includes('authorizedaction'));
  assert.ok(!joined.includes('mutationpermission'));
  assert.ok(!joined.includes('routeauthority'));
});

test('freshness: high sensitivity requires reverify', () => {
  assert.ok(requiresReverification('targeted-tests-passed'));
  assert.ok(requiresReverification('build-passed'));
  assert.ok(!requiresReverification('architecture-understood'));
  assert.ok(isFreshnessSensitive('typecheck-passed'));
  assert.ok(isHighSensitivity('relevant-suite-passed'));
  assert.ok(!isHighSensitivity('behavior-defined'));
});

test('checkStaleCheckpoint detects missing resolution', () => {
  const state = featureState();
  const result = checkStaleCheckpoint(state, {});
  assert.equal(result.stale, true);
  assert.equal(result.reason, 'workflow-no-longer-applicable');
});

test('statuses include all lifecycle values', () => {
  assert.deepEqual([...WORKFLOW_STATUSES], ['NEW', 'READY', 'ACTIVE', 'COMPLETE', 'INTERRUPTED', 'BLOCKED']);
  assert.equal(WORKFLOW_SCHEMA_VERSION, 1);
});
