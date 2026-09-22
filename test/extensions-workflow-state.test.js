import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionCatalog, getCatalogSkill, getCatalogWorkflow, resolveCatalogProfile, BUILTIN_SNAPSHOT } from '../src/extension-catalog.js';
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
  deserializeWorkflowState,
  isWorkflowComplete,
  selectableStages,
  skipRule,
  requiredStages,
  resumeFromCheckpoint
} from '../src/workflow-state.js';

function makeReceipt(kind, quality = 'verified', source = 'showdar-build') {
  return { kind, quality, source, detail: 'test', timestamp: new Date().toISOString() };
}

test('workflow-state: create custom workflow via extension catalog', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  const created = createWorkflowState('acme-mini', { extensionCatalog: cat });
  assert.ok(created.ok);
  const state = created.value;
  assert.equal(state.workflowId, 'acme-mini');
  assert.deepEqual([...state.selectedStages].sort(), ['showdar-build', 'showdar-test'].sort());
});

test('workflow-state: custom workflow stage selection', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  const created = createWorkflowState('acme-mini', { extensionCatalog: cat });
  const state = created.value;
  assert.ok(state.candidateStages.includes('showdar-build'));
  assert.ok(state.candidateStages.includes('showdar-test'));
});

test('workflow-state: enter custom workflow stage', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  assert.equal(state.activeStage, 'showdar-build');
  assert.equal(state.status, 'ACTIVE');
});

test('workflow-state: record evidence in custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = recordEvidence(state, makeReceipt('change-implemented', 'verified', 'showdar-build'));
  assert.equal(state.evidenceReceipts.length, 1);
});

test('workflow-state: complete custom workflow stage', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [makeReceipt('change-implemented', 'verified', 'showdar-build')]);
  assert.ok(state.completedStages.some(c => c.stage === 'showdar-build'));
  assert.equal(state.status, 'READY');
});

test('workflow-state: valid skip in custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'], allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat, selectedStages: ['showdar-build'] }).value;
  state = skipStage(state, 'showdar-test', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat });
  assert.ok(state.skippedStages.some(s => s.stage === 'showdar-test'));
});

test('workflow-state: invalid skip rejected in custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat, selectedStages: ['showdar-build'] }).value;
  assert.throws(() => skipStage(state, 'showdar-test', { reason: 'no-ux-decision', evidence: [], policy: 'no-ux-decision' }, { extensionCatalog: cat }), /not skippable/);
});

test('workflow-state: blocker in custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = addWorkflowBlocker(state, { id: 'auth-required', reason: 'Need approval', type: 'authorization' });
  assert.ok(state.blockers.some(b => b.id === 'auth-required'));
  assert.equal(state.status, 'BLOCKED');
});

test('workflow-state: interrupt custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = interruptWorkflow(state, 'User cancelled');
  assert.equal(state.status, 'INTERRUPTED');
});

test('workflow-state: resume custom workflow from interrupt', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = interruptWorkflow(state, 'User cancelled');
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const result = resumeFromCheckpoint(checkpoint, { primary: { skill: 'showdar-build' }, verificationPlan: { required: [] } }, { extensionCatalog: cat });
  assert.ok(result.replanRequired === false);
  assert.equal(result.state.status, 'READY');
});

test('workflow-state: stale resume blocks custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = interruptWorkflow(state, 'Cancelled');
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const result = resumeFromCheckpoint(checkpoint, { primary: { skill: 'showdar-test' }, verificationPlan: { required: [] } }, { extensionCatalog: cat });
  assert.ok(result.replanRequired);
  assert.equal(result.reason, 'primary-skill-shifted');
});

test('workflow-state: complete custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [makeReceipt('change-implemented', 'verified', 'showdar-build')]);
  state = startStage(state, 'showdar-test');
  state = completeStage(state, 'showdar-test', [makeReceipt('targeted-tests-passed', 'verified', 'showdar-test')]);
  state = finalizeWorkflow(state);
  assert.equal(state.status, 'COMPLETE');
  assert.ok(isWorkflowComplete(state));
});

test('workflow-state: serialize/deserialize custom workflow round-trip', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  state = completeStage(state, 'showdar-build', [makeReceipt('change-implemented', 'verified', 'showdar-build')]);
  const checkpoint = serializeWorkflowState(state, { extensionCatalog: cat });
  const restored = deserializeWorkflowState(checkpoint, { extensionCatalog: cat });
  assert.equal(restored.workflowId, 'acme-mini');
  assert.equal(restored.activeStage, null); // activeStage is null after stage completion
  assert.ok(restored.completedStages.some(c => c.stage === 'showdar-build'));
});

test('workflow-state: without extensionCatalog built-in behavior unchanged', () => {
  const created = createWorkflowState('showdar-bugfix', {});
  assert.ok(created.ok);
  const state = created.value;
  assert.ok(state.selectedStages.includes('showdar-debug'));
  assert.ok(selectableStages('showdar-bugfix').includes('showdar-debug'));
});

test('workflow-state: schemaVersion remains 1', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  const created = createWorkflowState('acme-mini', { extensionCatalog: cat });
  assert.ok(created.ok);
  assert.equal(created.value.schemaVersion, 1);
});

test('workflow-state: state shape unchanged for custom workflows', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  const created = createWorkflowState('acme-mini', { extensionCatalog: cat });
  const state = created.value;
  assert.ok(typeof state.workflowId === 'string');
  assert.ok(Array.isArray(state.selectedStages));
  assert.ok(Array.isArray(state.candidateStages));
  assert.ok(Array.isArray(state.completedStages));
  assert.ok(Array.isArray(state.skippedStages));
  assert.ok(Array.isArray(state.evidenceReceipts));
  assert.ok(Array.isArray(state.blockers));
  assert.ok(typeof state.revision === 'number');
  assert.ok(typeof state.createdAt === 'string');
  assert.ok(typeof state.updatedAt === 'string');
});

test('workflow-state: extension catalog not serialized in checkpoint', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }]
  }).value;
  let state = createWorkflowState('acme-mini', { extensionCatalog: cat }).value;
  state = startStage(state, 'showdar-build');
  const serialized = serializeWorkflowState(state, { extensionCatalog: cat });
  const parsed = JSON.parse(serialized);
  assert.ok(!parsed.extensionCatalog);
  assert.ok(!parsed.catalog);
});

test('workflow-state: selectableStages/skipRule/requiredStages with custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini', path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'], allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }] } }
    }]
  }).value;
  assert.deepEqual(selectableStages('acme-mini', cat).sort(), ['showdar-build', 'showdar-test'].sort());
  const rule = skipRule('acme-mini', 'showdar-test', cat);
  assert.ok(rule);
  assert.equal(rule.reason, 'no-ux-decision');
  assert.deepEqual(requiredStages('acme-mini', cat), ['showdar-build']);
});

test('workflow-state: built-in workflows work without catalog', () => {
  assert.ok(selectableStages('showdar-bugfix').includes('showdar-debug'));
  assert.ok(skipRule('showdar-bugfix', 'showdar-debug'));
  assert.deepEqual(requiredStages('showdar-bugfix'), ['showdar-understand', 'showdar-test', 'showdar-review']);
});