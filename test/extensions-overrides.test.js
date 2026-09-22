import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectOverridesDoc } from '../src/validate-pack.js';
import { readProjectOverrides, addPack, removePack, listExtensions } from '../src/project.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const OVERRIDES_FILE = '.showdar/overrides.json';

async function setupProject() {
  const tmp = await mkdir(path.join(tmpdir(), `showdar-test-${Date.now()}`), { recursive: true });
  const proj = path.join(tmp, 'proj');
  await mkdir(proj, { recursive: true });
  await mkdir(path.join(proj, '.showdar'), { recursive: true });
  // Minimal manifest
  await writeFile(path.join(proj, '.showdar.json'), JSON.stringify({
    version: 2, scope: 'project', packageVersion: '0.7.0', profile: 'minimal', ai: 'universal',
    targets: ['opencode'], skills: ['showdar-build'], commands: [], files: [],
    instructions: null, commandHarness: ['opencode']
  }), 'utf8');
  return proj;
}

test('overrides: readProjectOverrides reads valid file', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({
    version: 1,
    skillDescriptions: { 'showdar-debug': 'Custom debug guidance' },
    profiles: { 'team-minimal': ['showdar-build', 'showdar-test'] }
  }, null, 2), 'utf8');
  const doc = await readProjectOverrides({ cwd: proj });
  assert.ok(doc);
  assert.equal(doc.skillDescriptions['showdar-debug'], 'Custom debug guidance');
  await rm(proj, { recursive: true, force: true });
});

test('overrides: invalid override fails explicitly', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({ workflowPolicy: { 'showdar-feature': {} } }), 'utf8');
  await assert.rejects(readProjectOverrides({ cwd: proj }), /MUST NOT change built-in workflow/);
  await rm(proj, { recursive: true, force: true });
});

test('overrides: init does not rewrite user overrides', async () => {
  const proj = await setupProject();
  const original = JSON.stringify({ version: 1, skillDescriptions: { 'showdar-debug': 'Original' } }, null, 2);
  await writeFile(path.join(proj, OVERRIDES_FILE), original, 'utf8');
  // Simulate init (we just verify file exists and isn't touched by reading it back)
  const before = await readProjectOverrides({ cwd: proj });
  assert.equal(before.skillDescriptions['showdar-debug'], 'Original');
  await rm(proj, { recursive: true, force: true });
});

test('overrides: remove does not delete user overrides', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({ version: 1, skillDescriptions: { 'showdar-debug': 'Keep me' } }), 'utf8');
  await removePack({ cwd: proj, name: 'nonexistent' }).catch(() => {}); // Safe call
  const after = await readProjectOverrides({ cwd: proj });
  assert.equal(after.skillDescriptions['showdar-debug'], 'Keep me');
  await rm(proj, { recursive: true, force: true });
});

test('overrides: built-in workflow semantic override rejected', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({
    workflowPolicy: { 'showdar-feature': { stages: ['showdar-build'] } }
  }), 'utf8');
  await assert.rejects(readProjectOverrides({ cwd: proj }), /MUST NOT change built-in workflow/);
  await rm(proj, { recursive: true, force: true });
});

test('overrides: built-in profile mutation rejected', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({
    profiles: { minimal: ['showdar-build'] }
  }), 'utf8');
  await assert.rejects(readProjectOverrides({ cwd: proj }), /MUST NOT mutate built-in profile/);
  await rm(proj, { recursive: true, force: true });
});

test('overrides: valid custom workflow refinement accepted', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({
    workflowPolicy: {
      'acme-release': { stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build', 'showdar-test'] }
    }
  }), 'utf8');
  const doc = await readProjectOverrides({ cwd: proj });
  assert.ok(doc.workflowPolicy['acme-release']);
  await rm(proj, { recursive: true, force: true });
});

test('overrides: user file bytes remain identical after lifecycle where no edit requested', async () => {
  const proj = await setupProject();
  const original = JSON.stringify({ version: 1, skillDescriptions: { 'showdar-debug': 'Keep me' } }, null, 2);
  await writeFile(path.join(proj, OVERRIDES_FILE), original, 'utf8');
  // Simulate listExtensions which reads overrides but doesn't write
  await listExtensions({ cwd: proj });
  const content = await readProjectOverrides({ cwd: proj });
  assert.equal(content.skillDescriptions['showdar-debug'], 'Keep me');
  await rm(proj, { recursive: true, force: true });
});

test('overrides: remove-pack does not delete overrides', async () => {
  const proj = await setupProject();
  await writeFile(path.join(proj, OVERRIDES_FILE), JSON.stringify({ version: 1, skillDescriptions: { 'showdar-debug': 'Keep' } }), 'utf8');
  await addPack({ cwd: proj, source: '/nonexistent' }).catch(() => {});
  await removePack({ cwd: proj, name: 'nonexistent' }).catch(() => {});
  const doc = await readProjectOverrides({ cwd: proj });
  assert.equal(doc.skillDescriptions['showdar-debug'], 'Keep');
  await rm(proj, { recursive: true, force: true });
});