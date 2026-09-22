import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflowScenario, summarizeWorkflowResults } from '../benchmark/lib/workflow-eval-core.js';
import { createExtensionCatalog } from '../src/extension-catalog.js';
import { discoverWorkflowScenarios } from '../benchmark/lib/workflow-scenario-loader.js';

function customCatalog() {
  return createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-mini',path: 'w.json' }] },
      workflows: { 'acme-mini': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build','showdar-test'], requiredStages: ['showdar-build'] } },
    }],
  }).value;
}

function customScenario() {
  return {
    id: 'custom-test',
    workflow: 'acme-mini',
    selection: { selectedStages: ['showdar-build','showdar-test'] },
    resolutionStubs: { 'build-done': { primary: { skill: 'showdar-build' }, verificationPlan: { required: [] } } },
    steps: [
      { op: 'start', stage: 'showdar-build' },
      { op: 'complete', stage: 'showdar-build', receipts: [{ kind: 'change-implemented', quality: 'verified', source: 'showdar-build' }] },
      { op: 'start', stage: 'showdar-test' },
      { op: 'complete', stage: 'showdar-test', receipts: [{ kind: 'targeted-tests-passed', quality: 'verified', source: 'showdar-test' }] },
      { op: 'finalize' },
    ],
    expected: {
      status: 'COMPLETE',
      nextStage: null,
      selectedStages: ['showdar-build','showdar-test'],
      completedStages: ['showdar-build','showdar-test'],
      skippedStages: [],
      trace: [
        { type: 'workflow-created', stage: null, detail: { selectedStages: ['showdar-build','showdar-test'], candidateStages: ['showdar-build','showdar-test'] } },
        { type: 'stage-entered', stage: 'showdar-build', detail: {} },
        { type: 'stage-completed', stage: 'showdar-build', detail: { receiptKinds: ['change-implemented'], receiptQualities: ['verified'] } },
        { type: 'stage-entered', stage: 'showdar-test', detail: {} },
        { type: 'stage-completed', stage: 'showdar-test', detail: { receiptKinds: ['targeted-tests-passed'], receiptQualities: ['verified'] } },
        { type: 'workflow-completed', stage: null, detail: { completedStages: ['showdar-build','showdar-test'], skippedStages: [] } },
        { type: 'workflow-completed', stage: null, detail: { completedStages: ['showdar-build','showdar-test'], skippedStages: [] } },
      ],
    },
  };
}

test('eval: built-in workflow eval still 16/16', async () => {
  const scenarios = await discoverWorkflowScenarios();
  const results = scenarios.map((s) => runWorkflowScenario(s));
  const { passCount, total, failedIds } = summarizeWorkflowResults(scenarios, results);
  assert.equal(total, 16);
  assert.equal(passCount, 16);
  assert.deepEqual(failedIds, []);
});

test('eval: M1-M10 unchanged for built-in workflows', async () => {
  const scenarios = await discoverWorkflowScenarios();
  for (const scenario of scenarios) {
    const result = runWorkflowScenario(scenario);
    assert.ok(result.pass, `Built-in ${scenario.id} failed: ${result.failures.join(', ')}`);
    if (!scenario.expectCreation || scenario.expectCreation.ok) assert.ok(result.keys.length > 0);
  }
});

test('eval: built-in eval deterministic', async () => {
  const scenarios = await discoverWorkflowScenarios();
  const r1 = scenarios.map((s) => runWorkflowScenario(s));
  const r2 = scenarios.map((s) => runWorkflowScenario(s));
  for (let i = 0; i < scenarios.length; i++) {
    assert.equal(r1[i].pass, r2[i].pass);
    assert.deepEqual(r1[i].keys, r2[i].keys);
  }
});

test('eval: custom workflow scenario works through shared core', () => {
  const result = runWorkflowScenario(customScenario(), customCatalog());
  assert.ok(result.pass, `Custom workflow failed: ${result.failures.join(', ')}`);
});

test('eval: malformed custom scenario fails', () => {
  const bad = customScenario();
  bad.selection = { selectedStages: ['showdar-build'] };
  bad.steps = [{ op: 'complete', stage: 'showdar-build' }];
  bad.expected = { status: 'COMPLETE', nextStage: null, selectedStages: ['showdar-build'], completedStages: [], skippedStages: [], trace: [] };
  let threw = false;
  try {
    runWorkflowScenario(bad, customCatalog());
  } catch {
    threw = true;
  }
  assert.ok(threw);
});

test('eval: custom scenario cannot enter built-in closed corpus', async () => {
  const scenarios = await discoverWorkflowScenarios();
  const builtinIds = new Set(scenarios.map((s) => s.workflow));
  assert.ok(builtinIds.has('showdar-feature'));
  assert.ok(!builtinIds.has('acme-mini'));
});

test('eval: npm run eval does not invoke custom eval', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
  assert.ok(pkg.scripts.eval.includes('eval:workflows'));
  assert.ok(!pkg.scripts.eval.includes('eval:custom-workflows'));
});
