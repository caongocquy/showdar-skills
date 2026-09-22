import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outRoot = process.argv[2] ?? path.join(process.cwd(), '.tmp', 'custom-eval-fixture');
const packDir = path.join(outRoot, 'acme-pack');
const scenarioDir = path.join(outRoot, 'custom-scenarios');
await mkdir(path.join(packDir, 'workflows'), { recursive: true });
await mkdir(scenarioDir, { recursive: true });
await writeFile(path.join(packDir, 'pack.json'), JSON.stringify({
  name: 'acme',
  version: '1.0.0',
  description: 'Deterministic custom-eval fixture pack',
  skills: [],
  workflows: [{ id: 'acme-mini', path: 'workflows/acme-mini.json' }],
}, null, 2), 'utf8');
await writeFile(path.join(packDir, 'workflows', 'acme-mini.json'), JSON.stringify({
  id: 'acme-mini',
  description: 'A minimal custom workflow fixture for testing purposes',
  stages: ['showdar-build', 'showdar-test'],
  requiredStages: ['showdar-build'],
}, null, 2), 'utf8');
await writeFile(path.join(scenarioDir, 'acme-mini-basic.json'), JSON.stringify({
  id: 'acme-mini-basic',
  workflow: 'acme-mini',
  selection: { selectedStages: ['showdar-build', 'showdar-test'] },
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
    selectedStages: ['showdar-build', 'showdar-test'],
    completedStages: ['showdar-build', 'showdar-test'],
    skippedStages: [],
    trace: [
      { type: 'workflow-created', stage: null, detail: { selectedStages: ['showdar-build', 'showdar-test'], candidateStages: ['showdar-build', 'showdar-test'] } },
      { type: 'stage-entered', stage: 'showdar-build', detail: {} },
      { type: 'stage-completed', stage: 'showdar-build', detail: { receiptKinds: ['change-implemented'], receiptQualities: ['verified'] } },
      { type: 'stage-entered', stage: 'showdar-test', detail: {} },
      { type: 'stage-completed', stage: 'showdar-test', detail: { receiptKinds: ['targeted-tests-passed'], receiptQualities: ['verified'] } },
      { type: 'workflow-completed', stage: null, detail: { completedStages: ['showdar-build', 'showdar-test'], skippedStages: [] } },
      { type: 'workflow-completed', stage: null, detail: { completedStages: ['showdar-build', 'showdar-test'], skippedStages: [] } },
    ],
  },
}, null, 2), 'utf8');
console.log(`scenarios=${scenarioDir} pack=${path.join(packDir, 'pack.json')}`);
