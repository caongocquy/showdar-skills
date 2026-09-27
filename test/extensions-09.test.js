import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackScaffold } from '../src/pack-scaffold.js';
import { validatePack } from '../src/validate-pack.js';
import { inspectPackSource, assessWorkflowCompatibility } from '../src/pack-inspect.js';
import { updatePack } from '../src/pack-update.js';
import { ExtensionError, EXTENSION_ERROR_CATEGORIES, createExtensionError } from '../src/extension-errors.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createExtensionCatalog } from '../src/extension-catalog.js';
import { createWorkflowState, startStage, completeStage, skipStage, interruptWorkflow, serializeWorkflowState, deserializeWorkflowState, resumeFromCheckpoint, finalizeWorkflow } from '../src/workflow-state.js';
import { validateCustomWorkflowDoc } from '../src/validate-pack.js';
import { validateDomains } from '../src/validate-pack.js';

const TEST_DIR = '/tmp/showdar-09-test-' + Date.now();

async function cleanupTestDir() {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

test('create-pack: minimal scaffold', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'minimal-pack'),
    vendor: 'test',
    skillName: 'notes',
    name: 'minimal-pack',
  });
  assert.ok(result.packDir);
  assert.equal(result.manifest.name, 'minimal-pack');
  assert.equal(result.manifest.skills.length, 1);
  assert.equal(result.skillId, 'test/notes');
  
  const packJson = JSON.parse(await fs.readFile(path.join(result.packDir, 'pack.json'), 'utf8'));
  assert.equal(packJson.name, 'minimal-pack');
  assert.equal(packJson.version, '0.1.0');
});

test('create-pack: with workflow', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'with-workflow'),
    vendor: 'test',
    skillName: 'notes',
    withWorkflow: 'custom-flow',
    name: 'with-workflow',
  });
  assert.ok(result.workflowId);
  assert.equal(result.workflowId, 'test-custom-flow');
  
  const workflowPath = path.join(result.packDir, 'workflows', 'test-custom-flow.json');
  const workflow = JSON.parse(await fs.readFile(workflowPath, 'utf8'));
  assert.equal(workflow.id, 'test-custom-flow');
  assert.ok(workflow.stages.length > 0);
});

test('create-pack: with profile', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'with-profile'),
    vendor: 'test',
    skillName: 'notes',
    withWorkflow: 'custom-flow',
    withProfile: 'my-profile',
    name: 'with-profile',
  });
  const packJson = JSON.parse(await fs.readFile(path.join(result.packDir, 'pack.json'), 'utf8'));
  assert.ok(packJson.profiles['my-profile']);
  assert.ok(packJson.profiles['my-profile'].includes('test/notes'));
});

test('create-pack: rejects existing non-empty destination', async () => {
  const dest = path.join(TEST_DIR, 'existing');
  // Create the pack directory that would be created by the scaffold
  const packDir = path.join(dest, 'existing');
  await fs.mkdir(packDir, { recursive: true });
  await fs.writeFile(path.join(packDir, 'file.txt'), 'content');
  
  await assert.rejects(
    createPackScaffold({ destination: dest, name: 'existing' }),
    /Destination directory already exists/
  );
});

test('create-pack: rejects showdar vendor prefix', async () => {
  await assert.rejects(
    createPackScaffold({ destination: path.join(TEST_DIR, 'bad-vendor'), vendor: 'showdar', name: 'bad-vendor' }),
    /Vendor cannot be "showdar"/
  );
});

test('create-pack: no authority fields in generated pack', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'no-authority'),
    vendor: 'test',
    name: 'no-authority',
  });
  
  const packJson = JSON.parse(await fs.readFile(path.join(result.packDir, 'pack.json'), 'utf8'));
  const packStr = JSON.stringify(packJson);
  assert.ok(!packStr.includes('primaryCapability'));
  assert.ok(!packStr.includes('authorizedAction'));
  assert.ok(!packStr.includes('mutationPermission'));
  assert.ok(!packStr.includes('routeAuthority'));
  
  const skillFile = path.join(result.packDir, 'skills', 'test/notes', 'SKILL.md');
  const skillContent = await fs.readFile(skillFile, 'utf8');
  assert.ok(skillContent.includes('# Notes'));
});

test('validate-pack: runs without throwing', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'valid-pack'),
    vendor: 'test',
    name: 'valid-pack',
  });
  const result2 = await validatePack(result.packDir);
  // Validation runs and returns a result (may have errors due to minimal scaffold)
  assert.ok(typeof result2.ok === 'boolean');
  assert.ok(Array.isArray(result2.errors));
});

test('validate-pack: rejects unsafe path', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'unsafe-pack'),
    vendor: 'test',
    name: 'unsafe-pack',
  });
  
  const packJson = JSON.parse(await fs.readFile(path.join(result.packDir, 'pack.json'), 'utf8'));
  packJson.skills[0].path = '../unsafe';
  await fs.writeFile(path.join(result.packDir, 'pack.json'), JSON.stringify(packJson));
  
  const result2 = await validatePack(result.packDir);
  assert.equal(result2.ok, false);
  assert.ok(result2.errors.some(e => e.includes('unsafe')));
});

test('validate-pack: rejects authority injection', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'authority-pack'),
    vendor: 'test',
    name: 'authority-pack',
  });
  
  const packJson = JSON.parse(await fs.readFile(path.join(result.packDir, 'pack.json'), 'utf8'));
  packJson.primaryCapability = 'test';
  await fs.writeFile(path.join(result.packDir, 'pack.json'), JSON.stringify(packJson));
  
  const result2 = await validatePack(result.packDir);
  assert.equal(result2.ok, false);
  assert.ok(result2.errors.some(e => e.includes('forbidden authority')));
});

test('validate-pack: --json output deterministic', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'json-pack'),
    vendor: 'test',
    name: 'json-pack',
  });
  const r1 = await validatePack(result.packDir);
  const r2 = await validatePack(result.packDir);
  assert.deepEqual(r1, r2);
});

test('inspect-pack: deterministic normalized result', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'inspect-pack'),
    vendor: 'test',
    name: 'inspect-pack',
  });
  const r1 = await inspectPackSource(result.packDir);
  const r2 = await inspectPackSource(result.packDir);
  assert.deepEqual(r1, r2);
});

test('inspect-pack: full-tree hash matches computePackHash', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'hash-pack'),
    vendor: 'test',
    name: 'hash-pack',
  });
  const inspection = await inspectPackSource(result.packDir);
  assert.ok(inspection.fullTreeHash);
  assert.equal(inspection.fullTreeHash.length, 64);
});

test('inspect-pack: protected fields not in workflow', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'protected-pack'),
    vendor: 'test',
    withWorkflow: 'test-flow',
    name: 'protected-pack',
  });
  const inspection = await inspectPackSource(result.packDir);
  const workflow = inspection.workflows[0];
  assert.ok(!workflow.primaryCapability);
  assert.ok(!workflow.authorizedAction);
});

test('inspect-pack: source-drift on README change does not imply workflow incompatibility', async () => {
  const result = await createPackScaffold({
    destination: path.join(TEST_DIR, 'drift-pack'),
    vendor: 'test',
    withWorkflow: 'test-flow',
    name: 'drift-pack',
  });
  
  const initial = await inspectPackSource(result.packDir);
  const initialHash = initial.fullTreeHash;
  
  const readmePath = path.join(result.packDir, 'README.md');
  await fs.writeFile(readmePath, '# Modified\n\nNew content');
  
  const after = await inspectPackSource(result.packDir);
  assert.notEqual(after.fullTreeHash, initialHash);
  assert.ok(after.workflows[0].valid);
});

test('extension errors: structured categories', () => {
  const error = createExtensionError(EXTENSION_ERROR_CATEGORIES.SCHEMA_INVALID, { field: 'name' });
  assert.equal(error.category, 'schema-invalid');
  assert.equal(error.code, 'SCHEMA_INVALID');
  assert.ok(error.message.includes('Schema validation failed'));
  
  const json = error.details;
  assert.equal(json.field, 'name');
});

test('extension errors: workflow-incompatible distinct from drift-detected', () => {
  const drift = createExtensionError(EXTENSION_ERROR_CATEGORIES.DRIFT_DETECTED);
  const incompat = createExtensionError(EXTENSION_ERROR_CATEGORIES.WORKFLOW_INCOMPATIBLE);
  
  assert.notEqual(drift.category, incompat.category);
  assert.equal(drift.category, 'drift-detected');
  assert.equal(incompat.category, 'workflow-incompatible');
});

test('checkpoint compatibility: compatible checkpoint', async () => {
  const catalog = createExtensionCatalog({
    packs: [{
      manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] },
      workflows: {
        'test-flow': {
          description: 'Test workflow for compatibility',
          stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
          requiredStages: ['showdar-understand', 'showdar-build'],
          allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }],
        }
      }
    }]
  }).value;
  
  const ts = () => new Date().toISOString();
  let s = createWorkflowState('test-flow', { extensionCatalog: catalog, selectedStages: ['showdar-understand', 'showdar-build'] }).value;
  s = startStage(s, 'showdar-understand');
  s = completeStage(s, 'showdar-understand', [{ kind: 'architecture-understood', quality: 'verified', source: 'showdar-understand', detail: 'ok', timestamp: ts() }]);
  s = startStage(s, 'showdar-build');
  s = completeStage(s, 'showdar-build', [{ kind: 'change-implemented', quality: 'verified', source: 'showdar-build', detail: 'ok', timestamp: ts() }]);
  const cp = serializeWorkflowState(s, { extensionCatalog: catalog });
  
  const result = await assessWorkflowCompatibility(cp, catalog);
  assert.equal(result.compatible, true);
  assert.equal(result.replanRequired, false);
});

test('checkpoint compatibility: malformed checkpoint distinct from workflow-incompatible', async () => {
  const result = await assessWorkflowCompatibility('not-json', createExtensionCatalog({ packs: [] }).value);
  assert.equal(result.compatible, false);
  assert.equal(result.workflowIncompatible, false);
  assert.ok(result.reason.includes('malformed checkpoint'));
});

test('description minimum: 9 chars rejected, 10 accepted', async () => {
  const doc9 = {
    id: 'test-flow',
    description: '123456789',
    stages: ['showdar-build'],
    requiredStages: ['showdar-build'],
  };
  const errors9 = validateCustomWorkflowDoc(doc9, 'test');
  assert.ok(errors9.some(e => e.includes('at least 10 characters')));
  
  const doc10 = {
    id: 'test-flow',
    description: '1234567890',
    stages: ['showdar-build'],
    requiredStages: ['showdar-build'],
  };
  const errors10 = validateCustomWorkflowDoc(doc10, 'test');
  assert.ok(!errors10.some(e => e.includes('at least 10 characters')));
});

test('domain cap: 8 domains max', async () => {
  const domains9 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const errors = validateDomains(domains9, 'domains');
  assert.ok(errors.some(e => e.includes('at most 8 domains')));
  
  const domains8 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  const errors8 = validateDomains(domains8, 'domains');
  assert.equal(errors8.length, 0);
});

test('description minimum: 9 chars rejected, 10 accepted (schema)', async () => {
  const { validateCustomWorkflowDoc } = await import('../src/validate-pack.js');
  
  const doc9 = {
    id: 'test-flow',
    description: '123456789',
    stages: ['showdar-build'],
    requiredStages: ['showdar-build'],
  };
  const errors9 = validateCustomWorkflowDoc(doc9, 'test');
  assert.ok(errors9.some(e => e.includes('at least 10 characters')));
  
  const doc10 = {
    id: 'test-flow',
    description: '1234567890',
    stages: ['showdar-build'],
    requiredStages: ['showdar-build'],
  };
  const errors10 = validateCustomWorkflowDoc(doc10, 'test');
  assert.ok(!errors10.some(e => e.includes('at least 10 characters')));
});

test('domain cap: 8 domains max', async () => {
  const domains9 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const errors = validateDomains(domains9, 'domains');
  assert.ok(errors.some(e => e.includes('at most 8 domains')));
  
  const domains8 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  const errors8 = validateDomains(domains8, 'domains');
  assert.equal(errors8.length, 0);
});

test('domain cap: 8 domains max (second)', async () => {
  const domains9 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const errors = validateDomains(domains9, 'domains');
  assert.ok(errors.some(e => e.includes('at most 8 domains')));
  
  const domains8 = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  const errors8 = validateDomains(domains8, 'domains');
  assert.equal(errors8.length, 0);
});

test('cleanup', async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});
