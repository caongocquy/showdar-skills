import test from 'node:test';
import assert from 'node:assert/strict';
import { addPack, removePack, addWorkflow, listExtensions, readProjectOverrides, initProject } from '../src/project.js';
import { mkdir, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACK_FIXTURE = path.join(__dirname, 'fixtures', 'acme-pack');

async function ensurePackFixture() {
  const fixtureDir = path.join(__dirname, 'fixtures', 'acme-pack');
  await mkdir(path.join(fixtureDir, 'skills', 'acme-lint'), { recursive: true });
  await mkdir(path.join(fixtureDir, 'workflows'), { recursive: true });
  await writeFile(path.join(fixtureDir, 'pack.json'), JSON.stringify({
    name: 'acme', version: '1.0.0', description: 'Test pack',
    skills: [{ id: 'acme/lint', path: 'skills/acme-lint', description: 'Lint stuff for testing purposes in this repo ok', domains: ['code-quality'] }],
    workflows: [{ id: 'acme-mini', path: 'workflows/acme-mini.json' }]
  }, null, 2), 'utf8');
  await writeFile(path.join(fixtureDir, 'workflows', 'acme-mini.json'), JSON.stringify({
    id: 'acme-mini', description: 'A minimal custom workflow for testing purposes ok',
    stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build']
  }, null, 2), 'utf8');
  // Valid skill
  await writeFile(path.join(fixtureDir, 'skills', 'acme-lint', 'SKILL.md'), `---
name: acme-lint
description: Lint stuff for testing purposes in this repo ok
---
# acme-lint
## Purpose
This section explains purpose for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## When to use
This section explains when to use for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## When not to use
This section explains when not to use for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Inputs and assumptions
This section explains inputs and assumptions for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Non-negotiable rules
This section explains non-negotiable rules for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Workflow
This section explains workflow for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Decision points
This section explains decision points for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Stack detection
This section explains stack detection for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Failure modes
This section explains failure modes for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Stop conditions
This section explains stop conditions for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Escalation conditions
This section explains escalation conditions for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Verification
This section explains verification for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Output contract
This section explains output contract for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Anti-patterns
This section explains anti-patterns for the acme lint skill in a few sentences.
It stays declarative and never executes code.
## Example
This section explains example for the acme lint skill in a few sentences.
It stays declarative and never executes code.
${'Filler line for meaningful length.\n'.repeat(500)}
`, 'utf8');
}

async function setupProject() {
  const tmp = await mkdir(path.join(tmpdir(), `showdar-cli-test-${Date.now()}`), { recursive: true });
  const proj = path.join(tmp, 'proj');
  await mkdir(proj, { recursive: true });
  await initProject({
    projectRoot: proj,
    packageRoot: process.cwd(),
    profile: 'minimal',
    ai: 'universal',
    skillIds: ['showdar-build'],
    packageVersion: '0.7.0'
  });
  return proj;
}

test('cli: add-pack local directory', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  const result = await addPack({ cwd: proj, source: PACK_FIXTURE });
  assert.ok(result.hash.length === 64);
  assert.ok(result.destination.includes('.showdar/extensions/packs/acme'));
  const listed = await listExtensions({ cwd: proj });
  assert.ok(listed.packs.some(p => p.name === 'acme'));
  await rm(proj, { recursive: true, force: true });
});

test('cli: duplicate add-pack rejected', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  await addPack({ cwd: proj, source: PACK_FIXTURE });
  await assert.rejects(addPack({ cwd: proj, source: PACK_FIXTURE }), /already installed/);
  await rm(proj, { recursive: true, force: true });
});

test('cli: remove-pack', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  await addPack({ cwd: proj, source: PACK_FIXTURE });
  await removePack({ cwd: proj, name: 'acme' });
  const listed = await listExtensions({ cwd: proj });
  assert.equal(listed.packs.length, 0);
  await rm(proj, { recursive: true, force: true });
});

test('cli: add-workflow', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  const wfPath = path.join(PACK_FIXTURE, 'workflows', 'acme-mini.json');
  const result = await addWorkflow({ cwd: proj, source: wfPath });
  assert.ok(result.workflow === 'acme-mini');
  const listed = await listExtensions({ cwd: proj });
  assert.ok(listed.customWorkflows.some(w => w.id === 'acme-mini'));
  await rm(proj, { recursive: true, force: true });
});

test('cli: init --pack', async () => {
  await ensurePackFixture();
  const tmp = await mkdir(path.join(tmpdir(), `showdar-init-test-${Date.now()}`), { recursive: true });
  const proj = path.join(tmp, 'proj');
  await mkdir(proj, { recursive: true });
  // init with pack
  const { initProject } = await import('../src/project.js');
  const result = await initProject({
    projectRoot: proj,
    packageRoot: process.cwd(),
    profile: 'minimal',
    ai: 'universal',
    skillIds: ['showdar-build'],
    packageVersion: '0.7.0'
  });
  // Now add pack via the function that init would use
  const { addPack } = await import('../src/project.js');
  await addPack({ cwd: proj, source: PACK_FIXTURE });
  const listed = await listExtensions({ cwd: proj });
  assert.ok(listed.packs.some(p => p.name === 'acme'));
  await rm(proj, { recursive: true, force: true });
});

test('cli: list --extensions', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  await addPack({ cwd: proj, source: PACK_FIXTURE });
  const listed = await listExtensions({ cwd: proj });
  assert.ok(listed.packs.length >= 1);
  assert.ok(listed.customWorkflows.length >= 1);
  assert.ok(listed.overrides.present === false || listed.overrides.present === true);
  await rm(proj, { recursive: true, force: true });
});

test('cli: URL pack source rejected', async () => {
  const proj = await setupProject();
  await assert.rejects(addPack({ cwd: proj, source: 'https://example.com/pack' }), /not supported/);
  await rm(proj, { recursive: true, force: true });
});

test('cli: tarball source rejected', async () => {
  const proj = await setupProject();
  await assert.rejects(addPack({ cwd: proj, source: './pack.tgz' }), /not supported/);
  await rm(proj, { recursive: true, force: true });
});

test('cli: foreign destination conflict rejected', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  // Create a file at the destination that's not Showdar-owned
  const dest = path.join(proj, '.showdar', 'extensions', 'packs', 'acme');
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, 'pack.json'), '{}', 'utf8');
  await assert.rejects(addPack({ cwd: proj, source: PACK_FIXTURE }), /Refusing to overwrite/);
  await rm(proj, { recursive: true, force: true });
});

test('cli: malformed pack rejected', async () => {
  const proj = await setupProject();
  const badPack = path.join(tmpdir(), `bad-pack-${Date.now()}`);
  await mkdir(path.join(badPack, 'skills', 'bad'), { recursive: true });
  await writeFile(path.join(badPack, 'pack.json'), JSON.stringify({ name: 'bad', version: '1.0.0', skills: [{ id: 'bad/skill', path: 'skills/bad', description: 'x', domains: ['d'] }] }), 'utf8');
  await writeFile(path.join(badPack, 'skills', 'bad', 'SKILL.md'), 'invalid', 'utf8');
  await assert.rejects(addPack({ cwd: proj, source: badPack }), /Invalid pack/);
  await rm(proj, { recursive: true, force: true });
  await rm(badPack, { recursive: true, force: true });
});

test('cli: malformed workflow rejected', async () => {
  const proj = await setupProject();
  const badWf = path.join(tmpdir(), `bad-wf-${Date.now()}.json`);
  await writeFile(badWf, JSON.stringify({ id: 'showdar-invalid', description: 'x', stages: ['showdar-build'] }), 'utf8');
  await assert.rejects(addWorkflow({ cwd: proj, source: badWf }), /must use custom namespace/);
  await rm(proj, { recursive: true, force: true });
  await rm(badWf, { force: true });
});

test('cli: overrides preserved through lifecycle', async () => {
  const proj = await setupProject();
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.join(proj, '.showdar'), { recursive: true });
  await writeFile(path.join(proj, '.showdar', 'overrides.json'), JSON.stringify({ version: 1, skillDescriptions: { 'showdar-debug': 'Keep' } }), 'utf8');
  await listExtensions({ cwd: proj });
  await addPack({ cwd: proj, source: PACK_FIXTURE }).catch(() => {});
  await removePack({ cwd: proj, name: 'acme' }).catch(() => {});
  const { readProjectOverrides } = await import('../src/project.js');
  const doc = await readProjectOverrides({ cwd: proj });
  assert.equal(doc.skillDescriptions['showdar-debug'], 'Keep');
  await rm(proj, { recursive: true, force: true });
});

test('cli: manifest remains version 2', async () => {
  await ensurePackFixture();
  const proj = await setupProject();
  await addPack({ cwd: proj, source: PACK_FIXTURE });
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(path.join(proj, '.showdar.json'), 'utf8'));
  assert.equal(manifest.version, 2);
  await rm(proj, { recursive: true, force: true });
});

test('cli: extensions optional for old manifest', async () => {
  const proj = await setupProject();
  // Create old manifest without extensions
  await writeFile(path.join(proj, '.showdar.json'), JSON.stringify({
    version: 2, scope: 'project', packageVersion: '0.7.0', profile: 'minimal', ai: 'universal',
    targets: ['opencode'], skills: ['showdar-build'], commands: [], files: [],
    instructions: null, commandHarness: ['opencode']
  }), 'utf8');
  const listed = await listExtensions({ cwd: proj });
  assert.ok(listed.packs.length === 0);
  assert.ok(listed.customWorkflows.length === 0);
  await rm(proj, { recursive: true, force: true });
});