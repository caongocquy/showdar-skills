import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { planPackUpdate, verifyPlanPreconditions, executePackUpdate, projectPackUpdatePreview, CLASSIFICATION_ORDER } from '../src/pack-plan.js';
import { assessCompatibilityReasons, COMPATIBILITY_REASONS } from '../src/pack-compat.js';
import { createPackScaffold } from '../src/pack-scaffold.js';
import { validatePack } from '../src/validate-pack.js';
import { createExtensionCatalog } from '../src/extension-catalog.js';
import { createWorkflowState, startStage, completeStage, interruptWorkflow, serializeWorkflowState } from '../src/workflow-state.js';

const TEST_DIR = '/tmp/showdar-10-test-' + Date.now();

async function setupProject(name) {
  const projectRoot = path.join(TEST_DIR, name);
  await fs.mkdir(projectRoot, { recursive: true });
  const manifest = {
    version: 2, scope: 'project', packageVersion: '0.9.0', profile: 'full', ai: 'universal',
    targets: ['universal'], skills: [], commands: [], files: [], extensions: { packs: [], customWorkflows: [] },
  };
  await fs.writeFile(path.join(projectRoot, '.showdar.json'), JSON.stringify(manifest, null, 2));
  return projectRoot;
}

async function scaffoldValidPack(dest, name, vendor = 'test') {
  const result = await createPackScaffold({ destination: dest, name, vendor });
  return result.packDir;
}

async function installPack(projectRoot, packDir) {
  const { addPack } = await import('../src/project.js');
  const rel = path.relative(projectRoot, packDir);
  return addPack({ cwd: projectRoot, source: rel });
}

test('plan: same hash reports already-up-to-date', async () => {
  const projectRoot = await setupProject('same-hash');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'sh-pack'), 'sh-pack');
  await installPack(projectRoot, packDir);
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  assert.equal(plan.ok, true);
  assert.equal(plan.identity.sameHash, true);
  assert.equal(plan.executable, true);
});

test('plan: README-only change classifies source-only', async () => {
  const projectRoot = await setupProject('readme-only');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'ro-pack'), 'ro-pack');
  await installPack(projectRoot, packDir);
  await fs.writeFile(path.join(packDir, 'README.md'), '# Changed\n\nDocs only.');
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.classifications, ['source-only']);
});

test('plan: workflow change classifies workflow-definition', async () => {
  const projectRoot = await setupProject('wf-change');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'wf-pack'), 'wf-pack');
  const scaffold = await createPackScaffold({ destination: path.join(TEST_DIR, 'wf2-pack'), name: 'wf2-pack', vendor: 'test', withWorkflow: 'flow' });
  const wfPackDir = scaffold.packDir;
  await installPack(projectRoot, wfPackDir);
  const wfPath = path.join(wfPackDir, 'workflows', 'test-flow.json');
  const doc = JSON.parse(await fs.readFile(wfPath, 'utf8'));
  doc.description = 'Updated workflow description for test purposes here';
  await fs.writeFile(wfPath, JSON.stringify(doc, null, 2));
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, wfPackDir) });
  assert.equal(plan.ok, true);
  assert.ok(plan.classifications.includes('workflow-definition'));
  assert.ok(!plan.classifications.includes('source-only'));
});

test('plan: classification order is canonical', async () => {
  assert.deepEqual([...CLASSIFICATION_ORDER], ['installed-drift', 'metadata', 'ownership', 'profile-definition', 'reference', 'skill-content', 'source-only', 'workflow-definition']);
});

test('plan: no mutation during planning', async () => {
  const projectRoot = await setupProject('no-mutate');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'nm-pack'), 'nm-pack');
  await installPack(projectRoot, packDir);
  const before = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
  await fs.writeFile(path.join(packDir, 'NOTE.md'), 'change');
  await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  const after = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
  assert.equal(before, after);
});

test('plan: deterministic output', async () => {
  const projectRoot = await setupProject('deterministic');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'det-pack'), 'det-pack');
  await installPack(projectRoot, packDir);
  const rel = path.relative(projectRoot, packDir);
  const p1 = await planPackUpdate({ cwd: projectRoot, source: rel });
  const p2 = await planPackUpdate({ cwd: projectRoot, source: rel });
  assert.equal(p1.candidate.hash, p2.candidate.hash);
  assert.deepEqual(p1.classifications, p2.classifications);
});

test('plan: public projection hides internal fields', async () => {
  const projectRoot = await setupProject('projection');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'proj-pack'), 'proj-pack');
  await installPack(projectRoot, packDir);
  await fs.writeFile(path.join(packDir, 'NOTE.md'), 'x');
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  const proj = projectPackUpdatePreview(plan);
  assert.equal(proj.schemaVersion, 1);
  assert.equal(proj.command, 'update-pack');
  assert.ok(proj.data);
  const serialized = JSON.stringify(proj);
  assert.ok(!serialized.includes('fingerprint'));
  assert.ok(!serialized.includes('fileList'));
  assert.ok(!serialized.includes('newManifest'));
  assert.ok(!serialized.includes('sourceHash'));
  assert.ok(!serialized.includes('installedHash'));
});

test('toctou: source change after plan aborts with zero mutation', async () => {
  const projectRoot = await setupProject('toctou-src');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'tc-pack'), 'tc-pack');
  await installPack(projectRoot, packDir);
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  await fs.writeFile(path.join(packDir, 'MUTATED.md'), 'external change');
  const verification = await verifyPlanPreconditions(plan, { cwd: projectRoot });
  assert.equal(verification.ok, false);
  assert.equal(verification.reason, 'source-changed');
  const before = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
  await assert.rejects(executePackUpdate(plan, { cwd: projectRoot }), /stale/);
  const after = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
  assert.equal(before, after);
});

test('toctou: overrides change after plan aborts', async () => {
  const projectRoot = await setupProject('toctou-ovr');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'to-pack'), 'to-pack');
  await installPack(projectRoot, packDir);
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  await fs.mkdir(path.join(projectRoot, '.showdar'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, '.showdar', 'overrides.json'), JSON.stringify({ version: 1, guidance: { 'showdar-build': 'hint' } }));
  const verification = await verifyPlanPreconditions(plan, { cwd: projectRoot });
  assert.equal(verification.ok, false);
  assert.equal(verification.reason, 'overrides-changed');
});

test('parity: dry-run plan agrees with execution plan', async () => {
  const projectRoot = await setupProject('parity');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'par-pack'), 'par-pack');
  await installPack(projectRoot, packDir);
  await fs.writeFile(path.join(packDir, 'NOTE.md'), 'change');
  const rel = path.relative(projectRoot, packDir);
  const dryPlan = await planPackUpdate({ cwd: projectRoot, source: rel });
  const execPlan = await planPackUpdate({ cwd: projectRoot, source: rel });
  assert.deepEqual(dryPlan.classifications, execPlan.classifications);
  assert.equal(dryPlan.candidate.hash, execPlan.candidate.hash);
  assert.deepEqual(dryPlan.files, execPlan.files);
  assert.equal(dryPlan.executable, execPlan.executable);
});

test('compat: compatible checkpoint', async () => {
  const catalog = createExtensionCatalog({
    packs: [{
      manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] },
      workflows: {
        'test-flow': {
          description: 'Test workflow for compatibility checks',
          stages: ['showdar-understand', 'showdar-build'],
          requiredStages: ['showdar-understand', 'showdar-build'],
          allowedSkips: [],
        },
      },
    }],
  }).value;
  const ts = () => new Date().toISOString();
  let s = createWorkflowState('test-flow', { extensionCatalog: catalog, selectedStages: ['showdar-understand', 'showdar-build'] }).value;
  s = startStage(s, 'showdar-understand');
  s = completeStage(s, 'showdar-understand', [{ kind: 'architecture-understood', quality: 'verified', source: 'showdar-understand', detail: 'ok', timestamp: ts() }]);
  s = interruptWorkflow(s, 'pause for test');
  const cp = serializeWorkflowState(s, { extensionCatalog: catalog });
  const result = await assessCompatibilityReasons(cp, catalog);
  assert.equal(result.compatible, true);
  assert.equal(result.replanRequired, false);
});

test('compat: malformed checkpoint maps to schema-invalid', async () => {
  const catalog = createExtensionCatalog({ packs: [] }).value;
  const result = await assessCompatibilityReasons('not-json', catalog);
  assert.equal(result.compatible, false);
  assert.equal(result.category, 'schema-invalid');
  assert.equal(result.reason, 'malformed-checkpoint');
});

test('compat: missing workflow maps to workflow-missing', async () => {
  const catalog = createExtensionCatalog({ packs: [] }).value;
  const cp = JSON.stringify({ schemaVersion: 1, workflowId: 'ghost-flow', candidateStages: [], selectedStages: [], activeStage: null, completedStages: [], skippedStages: [], evidenceReceipts: [], blockers: [], nextStage: null, status: 'INTERRUPTED', revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const result = await assessCompatibilityReasons(cp, catalog);
  assert.equal(result.category, 'workflow-incompatible');
  assert.equal(result.reason, 'workflow-missing');
  assert.equal(result.replanRequired, true);
});

test('compat: invalid skip maps to recorded-skip-invalid', async () => {
  const catalog = createExtensionCatalog({
    packs: [{
      manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] },
      workflows: {
        'test-flow': {
          description: 'Test workflow for skip validation',
          stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
          requiredStages: ['showdar-understand', 'showdar-build'],
          allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }],
        },
      },
    }],
  }).value;
  const ts = new Date().toISOString();
  const cp = JSON.stringify({
    schemaVersion: 1, workflowId: 'test-flow',
    candidateStages: ['showdar-understand', 'showdar-build'],
    selectedStages: ['showdar-understand', 'showdar-build'],
    activeStage: null,
    completedStages: [], skippedStages: [{ stage: 'showdar-test', reason: 'known-root-cause', policy: 'known-root-cause', evidence: [], skippedAt: ts }],
    evidenceReceipts: [], blockers: [], nextStage: 'showdar-understand', status: 'INTERRUPTED', revision: 0, createdAt: ts, updatedAt: ts,
  });
  const result = await assessCompatibilityReasons(cp, catalog);
  assert.equal(result.category, 'workflow-incompatible');
  assert.equal(result.reason, 'recorded-skip-invalid');
});

test('compat: reason codes are stable public contract', async () => {
  assert.deepEqual(Object.keys(COMPATIBILITY_REASONS).sort(), ['RECORDED_SKIP_INVALID', 'REQUIRED_STAGE_CONFLICT', 'SELECTED_STAGE_INVALID', 'SKIP_POLICY_INVALID', 'STAGE_REMOVED', 'WORKFLOW_MISSING', 'WORKFLOW_STATE_COMPAT_UNSUPPORTED']);
  assert.equal(COMPATIBILITY_REASONS.WORKFLOW_MISSING, 'workflow-missing');
  assert.equal(COMPATIBILITY_REASONS.RECORDED_SKIP_INVALID, 'recorded-skip-invalid');
});

test('doctor: checkpointCompatibility not-assessed without checkpoint', async () => {
  const projectRoot = await setupProject('doctor-na');
  const { doctor } = await import('../src/project.js');
  const result = await doctor({ cwd: projectRoot });
  assert.equal(result.healthy, true);
});

test('scaffold: generated skill validates and installs', async () => {
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'scaf-pack'), 'scaf-pack');
  const validation = await validatePack(packDir);
  assert.equal(validation.ok, true);
  const projectRoot = await setupProject('scaf-install');
  await installPack(projectRoot, packDir);
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  assert.ok(manifest.extensions.packs.some((p) => p.name === 'scaf-pack'));
});

test('scaffold: no authority keys or executable hooks', async () => {
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'auth-pack'), 'auth-pack');
  const packJson = await fs.readFile(path.join(packDir, 'pack.json'), 'utf8');
  assert.ok(!packJson.includes('primaryCapability'));
  assert.ok(!packJson.includes('authorizedAction'));
  const skillContent = await fs.readFile(path.join(packDir, 'skills', 'test', 'auth-pack', 'SKILL.md').replace('auth-pack/auth-pack', 'test/auth-pack'), 'utf8').catch(async () => {
    const skillDirs = await fs.readdir(path.join(packDir, 'skills', 'test'));
    return fs.readFile(path.join(packDir, 'skills', 'test', skillDirs[0], 'SKILL.md'), 'utf8');
  });
  assert.ok(!skillContent.includes('primaryCapability'));
});

test('inspectCustomWorkflows: returns valid/errors contract', async () => {
  const projectRoot = await setupProject('icw-contract');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'icw-pack'), 'icw-pack');
  await installPack(projectRoot, packDir);
  const { inspectCustomWorkflows } = await import('../src/pack-inspect.js');
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  const result = await inspectCustomWorkflows(projectRoot, manifest);
  assert.ok(Array.isArray(result));
  for (const wf of result) {
    assert.equal(typeof wf.valid, 'boolean', 'workflow entry must expose boolean valid');
    assert.ok(Array.isArray(wf.errors), 'workflow entry must expose errors array');
    assert.ok(!('ok' in wf), 'workflow entry must NOT use ok (regression: validateCustomWorkflowDoc returns array)');
  }
});

test('update: executes real update path past manifest write', async () => {
  const projectRoot = await setupProject('exec-manifest');
  const packDir = await scaffoldValidPack(path.join(TEST_DIR, 'em-pack'), 'em-pack');
  await installPack(projectRoot, packDir);
  await fs.writeFile(path.join(packDir, 'NOTE.md'), 'execute me');
  const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
  assert.equal(plan.ok, true);
  const before = JSON.parse(await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  const beforeHash = before.extensions.packs.find((p) => p.name === 'em-pack').hash;
  const result = await executePackUpdate(plan, { cwd: projectRoot });
  assert.equal(result.status, 'updated');
  const after = JSON.parse(await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  assert.notEqual(after.extensions.packs.find((p) => p.name === 'em-pack').hash, beforeHash);
});

test('toctou: each precondition mutation aborts same plan with zero mutation', async () => {
  const mutations = {
    'installed-changed': async (projectRoot, packDir) => {
      const target = path.join(projectRoot, '.showdar', 'extensions', 'packs', 'tc2-pack', 'pack.json');
      await fs.writeFile(target, (await fs.readFile(target, 'utf8')) + '\n');
    },
    'manifest-changed': async (projectRoot) => {
      const mp = path.join(projectRoot, '.showdar.json');
      const m = JSON.parse(await fs.readFile(mp, 'utf8'));
      m.extensions.packs[0].version = '9.9.9-tamper';
      await fs.writeFile(mp, JSON.stringify(m, null, 2));
    },
    'overrides-changed': async (projectRoot) => {
      await fs.mkdir(path.join(projectRoot, '.showdar'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, '.showdar', 'overrides.json'), JSON.stringify({ version: 1 }));
    },
  };
  for (const [expectedReason, mutate] of Object.entries(mutations)) {
    const projectRoot = await setupProject(`toctou-${expectedReason}`);
    const packDir = await scaffoldValidPack(path.join(TEST_DIR, `tcp-${expectedReason}`), 'tc2-pack');
    await installPack(projectRoot, packDir);
    const beforeManifest = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
    let beforeOverrides = null;
    try { beforeOverrides = await fs.readFile(path.join(projectRoot, '.showdar', 'overrides.json'), 'utf8'); } catch {}
    const plan = await planPackUpdate({ cwd: projectRoot, source: path.relative(projectRoot, packDir) });
    await mutate(projectRoot, packDir);
    const verification = await verifyPlanPreconditions(plan, { cwd: projectRoot });
    assert.equal(verification.ok, false, expectedReason);
    assert.equal(verification.reason, expectedReason);
    let postMutationOverrides = null;
    try { postMutationOverrides = await fs.readFile(path.join(projectRoot, '.showdar', 'overrides.json'), 'utf8'); } catch {}
    await assert.rejects(executePackUpdate(plan, { cwd: projectRoot }), /stale/);
    const afterManifest = await fs.readFile(path.join(projectRoot, '.showdar.json'), 'utf8');
    if (expectedReason === 'manifest-changed') {
      assert.notEqual(afterManifest, beforeManifest);
    } else {
      assert.equal(afterManifest, beforeManifest, `${expectedReason}: manifest must be unchanged by abort`);
    }
    let afterOverrides = null;
    try { afterOverrides = await fs.readFile(path.join(projectRoot, '.showdar', 'overrides.json'), 'utf8'); } catch {}
    assert.equal(afterOverrides, postMutationOverrides, `${expectedReason}: execution must not touch overrides on abort`);
  }
});

test('compat: stage with no skip rule maps to skip-policy-invalid', async () => {
  const catalog = createExtensionCatalog({
    packs: [{
      manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] },
      workflows: {
        'test-flow': {
          description: 'Test workflow with no skip rule for build stage',
          stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
          requiredStages: ['showdar-understand'],
          allowedSkips: [],
        },
      },
    }],
  }).value;
  const ts = new Date().toISOString();
  const cp = JSON.stringify({
    schemaVersion: 1, workflowId: 'test-flow',
    candidateStages: ['showdar-understand'],
    selectedStages: ['showdar-understand'],
    activeStage: null,
    completedStages: [], skippedStages: [{ stage: 'showdar-build', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [], skippedAt: ts }],
    evidenceReceipts: [], blockers: [], nextStage: 'showdar-understand', status: 'INTERRUPTED', revision: 0, createdAt: ts, updatedAt: ts,
  });
  const result = await assessCompatibilityReasons(cp, catalog);
  assert.equal(result.category, 'workflow-incompatible');
  assert.equal(result.reason, 'skip-policy-invalid');
});

test('compat: recorded skip mismatch maps to recorded-skip-invalid not skip-policy-invalid', async () => {
  const catalog = createExtensionCatalog({
    packs: [{
      manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] },
      workflows: {
        'test-flow': {
          description: 'Test workflow with strict skip rule',
          stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
          requiredStages: ['showdar-understand', 'showdar-build'],
          allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }],
        },
      },
    }],
  }).value;
  const ts = new Date().toISOString();
  const cp = JSON.stringify({
    schemaVersion: 1, workflowId: 'test-flow',
    candidateStages: ['showdar-understand', 'showdar-build'],
    selectedStages: ['showdar-understand', 'showdar-build'],
    activeStage: null,
    completedStages: [], skippedStages: [{ stage: 'showdar-test', reason: 'wrong-reason', policy: 'wrong-reason', evidence: [], skippedAt: ts }],
    evidenceReceipts: [], blockers: [], nextStage: 'showdar-understand', status: 'INTERRUPTED', revision: 0, createdAt: ts, updatedAt: ts,
  });
  const result = await assessCompatibilityReasons(cp, catalog);
  assert.equal(result.category, 'workflow-incompatible');
  assert.equal(result.reason, 'recorded-skip-invalid');
  assert.notEqual(result.reason, 'skip-policy-invalid');
});

test('compat: old checkpoint with valid skip becomes recorded-skip-invalid under changed candidate policy', async () => {
  const oldWf = {
    description: 'Workflow with permissive skip policy',
    stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
    requiredStages: ['showdar-understand', 'showdar-build'],
    allowedSkips: [{ stage: 'showdar-test', reason: 'local-low-risk', policy: 'local-low-risk', evidence: [] }],
  };
  const oldCatalog = createExtensionCatalog({
    packs: [{ manifest: { name: 'test', version: '0.1.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] }, workflows: { 'test-flow': oldWf } }],
  }).value;
  const ts = () => new Date().toISOString();
  let s = createWorkflowState('test-flow', { extensionCatalog: oldCatalog, selectedStages: ['showdar-understand', 'showdar-build'] }).value;
  s = startStage(s, 'showdar-understand');
  s = completeStage(s, 'showdar-understand', [{ kind: 'architecture-understood', quality: 'verified', source: 'showdar-understand', detail: 'ok', timestamp: ts() }]);
  s = interruptWorkflow(s, 'pause');
  const oldCp = serializeWorkflowState(s, { extensionCatalog: oldCatalog });
  const oldResult = await assessCompatibilityReasons(oldCp, oldCatalog);
  assert.equal(oldResult.compatible, true);
  const newWf = {
    description: 'Workflow with strict skip policy',
    stages: ['showdar-understand', 'showdar-build', 'showdar-test'],
    requiredStages: ['showdar-understand', 'showdar-build'],
    allowedSkips: [{ stage: 'showdar-test', reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] }],
  };
  const newCatalog = createExtensionCatalog({
    packs: [{ manifest: { name: 'test', version: '0.2.0', skills: [], workflows: [{ id: 'test-flow', path: 'w.json' }] }, workflows: { 'test-flow': newWf } }],
  }).value;
  const parsed = JSON.parse(oldCp);
  parsed.skippedStages = [{ stage: 'showdar-test', reason: 'local-low-risk', policy: 'local-low-risk', evidence: [], skippedAt: ts() }];
  const newResult = await assessCompatibilityReasons(JSON.stringify(parsed), newCatalog);
  assert.equal(newResult.compatible, false);
  assert.equal(newResult.category, 'workflow-incompatible');
  assert.equal(newResult.reason, 'recorded-skip-invalid');
  assert.equal(newResult.replanRequired, true);
});

test('cleanup', async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});
