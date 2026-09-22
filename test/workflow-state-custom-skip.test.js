import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionCatalog } from '../src/extension-catalog.js';
import {
  createWorkflowState,
  startStage,
  completeStage,
  skipStage,
  interruptWorkflow,
  serializeWorkflowState,
  deserializeWorkflowState,
  resumeFromCheckpoint,
  validateWorkflowState,
  finalizeWorkflow,
  isWorkflowComplete,
} from '../src/workflow-state.js';

function customCatalog() {
  return createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-skip', path: 'w.json' }] },
      workflows: {
        'acme-skip': {
          description: 'Custom workflow with a skippable optional stage for regression testing',
          stages: ['showdar-build', 'showdar-test', 'showdar-review'],
          requiredStages: ['showdar-build', 'showdar-test'],
          allowedSkips: [{ stage: 'showdar-review', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }],
        },
      },
    }],
  }).value;
}

function receipt(kind, source) {
  return { kind, quality: 'verified', source, detail: 'regression', timestamp: new Date().toISOString() };
}

test('regression: valid custom skip survives checkpoint round-trip with matching catalog', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'showdar-build')]);
  state = skipStage(state, 'showdar-review', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  assert.ok(state.skippedStages.some((s) => s.stage === 'showdar-review'));
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const parsed = JSON.parse(checkpoint);
  assert.equal(parsed.schemaVersion, 1);
  assert.ok(!('extensionCatalog' in parsed) && !('catalog' in parsed));
  const validation = validateWorkflowState(parsed, { extensionCatalog: cat });
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.ok);
  const restored = deserializeWorkflowState(checkpoint, { extensionCatalog: cat });
  assert.equal(restored.workflowId, 'acme-skip');
  assert.ok(restored.skippedStages.some((s) => s.stage === 'showdar-review'));
});

test('regression: same custom skip checkpoint rejected without catalog', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'showdar-build')]);
  state = skipStage(state, 'showdar-review', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  const checkpoint = JSON.stringify(state);
  assert.throws(() => deserializeWorkflowState(checkpoint), /acme-skip|unknown|not skippable|Invalid workflow checkpoint/);
});

test('regression: invalid custom skip rejected even with matching catalog', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  assert.throws(() => skipStage(state, 'showdar-debug', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat }), /not declared/);
  assert.throws(() => skipStage(state, 'showdar-review', { reason: 'behavior-defined', evidence: [], policy: 'behavior-defined' }, { extensionCatalog: cat }), /must be no-ux-decision/);
});

test('regression: required custom stage cannot be skipped via checkpoint', () => {
  const cat = customCatalog();
  const state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  const forged = {
    ...JSON.parse(JSON.stringify(state)),
    skippedStages: [{ stage: 'showdar-build', reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision', skippedAt: new Date().toISOString() }],
  };
  const validation = validateWorkflowState(forged, { extensionCatalog: cat });
  assert.equal(validation.ok, false);
});

test('regression: resume after valid custom skip with matching catalog', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'showdar-build')]);
  state = skipStage(state, 'showdar-review', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  state = interruptWorkflow(state, 'regression pause');
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const resumed = resumeFromCheckpoint(checkpoint, { primary: { skill: 'showdar-test' }, verificationPlan: { required: [] } }, { extensionCatalog: cat });
  assert.equal(resumed.replanRequired, false);
  assert.equal(resumed.state.status, 'READY');
  let next = startStage(resumed.state, 'showdar-test');
  next = completeStage(next, 'showdar-test', [receipt('targeted-tests-passed', 'showdar-test')]);
  next = finalizeWorkflow(next);
  assert.equal(next.status, 'COMPLETE');
  assert.ok(isWorkflowComplete(next));
});

test('regression: built-in skip checkpoint behavior unchanged', () => {
  let state = createWorkflowState('showdar-bugfix', { selectedStages: ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'] }).value;
  state = skipStage(state, 'showdar-debug', { reason: 'known-root-cause', evidence: [{ kind: 'root-cause-proven', quality: 'verified', source: 'showdar-debug', detail: 'proven', timestamp: new Date().toISOString() }], policy: 'known-root-cause' });
  assert.ok(state.skippedStages.some((s) => s.stage === 'showdar-debug'));
  const checkpoint = serializeWorkflowState(state);
  const restored = deserializeWorkflowState(checkpoint);
  assert.ok(restored.skippedStages.some((s) => s.stage === 'showdar-debug'));
});

test('regression: stale resume still requires replan after valid custom skip', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'showdar-build')]);
  state = skipStage(state, 'showdar-review', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  state = interruptWorkflow(state, 'regression pause');
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const resumed = resumeFromCheckpoint(checkpoint, { primary: { skill: 'showdar-build' }, verificationPlan: { required: [] } }, { extensionCatalog: cat });
  assert.equal(resumed.replanRequired, true);
  assert.equal(resumed.reason, 'primary-skill-shifted');
});

test('regression: wrong catalog rejects custom skip checkpoint', () => {
  const cat = customCatalog();
  let state = createWorkflowState('acme-skip', { extensionCatalog: cat, selectedStages: ['showdar-build', 'showdar-test'] }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [receipt('change-implemented', 'showdar-build')]);
  state = skipStage(state, 'showdar-review', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  const checkpoint = JSON.stringify(state);
  const other = createExtensionCatalog({
    packs: [{
      manifest: { name: 'other', version: '1.0.0', skills: [], workflows: [{ id: 'other-flow', path: 'w.json' }] },
      workflows: {
        'other-flow': {
          description: 'Unrelated custom workflow for negative catalog testing purposes',
          stages: ['showdar-build', 'showdar-test'],
          requiredStages: ['showdar-build'],
        },
      },
    }],
  }).value;
  assert.throws(() => deserializeWorkflowState(checkpoint, { extensionCatalog: other }), /acme-skip|unknown|Invalid workflow checkpoint/);
});
