import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, createPack, addPack, doctor } from '../src/project.js';
import { planPackUpdate, executePackUpdate } from '../src/pack-plan.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-pack-audit-'));
  const cwd = path.join(root, 'project');
  const homeRoot = path.join(root, 'home');
  await mkdir(cwd, { recursive: true });
  await mkdir(homeRoot);
  try {
    await initProject({ projectRoot: cwd, homeRoot, packageRoot, profile: 'minimal',
      ai: 'universal', skillIds: ['showdar-debug'], packageVersion: '0.15.0' });
    const result = await createPack({ cwd, path: 'example-pack', vendor: 'demo', description: 'Pack integrity regression' });
    await run({ cwd, result });
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function bump(packRoot, version) {
  const file = path.join(packRoot, 'pack.json');
  const doc = JSON.parse(await readFile(file, 'utf8'));
  doc.version = version;
  await writeFile(file, JSON.stringify(doc, null, 2));
}

test('source README does not immediately trigger installed pack drift', () => fixture(async ({ cwd, result }) => {
  await writeFile(path.join(result.packDir, 'README.md'), 'Pack documentation is not shipped');
  await addPack({ cwd, source: 'example-pack', packageVersion: '0.15.0' });
  const inspected = await doctor({ cwd });
  const pack = inspected.packs.find(p => p.name === result.manifest.name);
  assert.ok(pack);
  assert.equal(pack.drift, 'no-drift');
}));

test('local installed edits block pack update with no data loss', () => fixture(async ({ cwd, result }) => {
  await addPack({ cwd, source: 'example-pack', packageVersion: '0.15.0' });
  const installed = path.join(cwd, '.showdar/extensions/packs', result.manifest.name, 'pack.json');
  await writeFile(installed, 'USER EDIT');
  await bump(result.packDir, '0.2.0');
  const plan = await planPackUpdate({ cwd, source: 'example-pack' });
  assert.equal(plan.executable, false);
  await assert.rejects(executePackUpdate(plan, { cwd }), /blocked/);
  assert.equal(await readFile(installed, 'utf8'), 'USER EDIT');
  const manifest = JSON.parse(await readFile(path.join(cwd, '.showdar.json'), 'utf8'));
  assert.notEqual(manifest.extensions.packs[0].version, '0.2.0');
}));

test('successful pack update removes obsolete files and leaves no staging directory', () => fixture(async ({ cwd, result }) => {
  const relative = 'obsolete.txt';
  const skillRoot = path.join(result.packDir, 'skills', result.skillId);
  await writeFile(path.join(skillRoot, relative), 'old instruction');
  await addPack({ cwd, source: 'example-pack', packageVersion: '0.15.0' });
  await unlink(path.join(skillRoot, relative));
  await bump(result.packDir, '0.2.0');
  const plan = await planPackUpdate({ cwd, source: 'example-pack' });
  assert.equal(plan.executable, true);
  const updated = await executePackUpdate(plan, { cwd });
  assert.equal(updated.status, 'updated');
  await assert.rejects(access(path.join(cwd, '.showdar/extensions/packs', result.manifest.name, 'skills', result.skillId, relative)));
  const manifest = JSON.parse(await readFile(path.join(cwd, '.showdar.json'), 'utf8'));
  assert.equal(manifest.extensions.packs[0].version, '0.2.0');
  assert.ok(!manifest.files.some(x => x.path.endsWith('/' + relative)));
  const dirs = await readdir(path.join(cwd, '.showdar/extensions/packs'));
  assert.ok(dirs.every(x => !x.includes('.tmp-') && !x.includes('.backup-')));
}));

test('blocked foreign-file conflict cannot modify the installed pack or manifest', () => fixture(async ({ cwd, result }) => {
  await addPack({ cwd, source: 'example-pack', packageVersion: '0.15.0' });
  const manifestPath = path.join(cwd, '.showdar.json');
  const before = await readFile(manifestPath, 'utf8');
  const installedPack = path.join(cwd, '.showdar/extensions/packs', result.manifest.name);
  const foreign = path.join(installedPack, 'new-instruction.txt');
  await writeFile(foreign, 'FOREIGN USER FILE');
  await writeFile(path.join(result.packDir, 'new-instruction.txt'), 'candidate file');
  await bump(result.packDir, '0.2.0');
  const plan = await planPackUpdate({ cwd, source: 'example-pack' });
  assert.equal(plan.executable, false);
  await assert.rejects(executePackUpdate(plan, { cwd }), /blocked/);
  assert.equal(await readFile(manifestPath, 'utf8'), before);
  assert.equal(await readFile(foreign, 'utf8'), 'FOREIGN USER FILE');
}));

test('unhealthy extension doctor JSON fails with matching ok flag and exit code', () => fixture(async ({ cwd, result }) => {
  await addPack({ cwd, source: 'example-pack', packageVersion: '0.15.0' });
  const installedPack = path.join(cwd, '.showdar/extensions/packs', result.manifest.name);
  await writeFile(path.join(installedPack, 'pack.json'), 'USER EDIT');
  const { spawnSync } = await import('node:child_process');
  const proc = spawnSync(process.execPath,
    [path.join(packageRoot, 'bin/showdar.js'), 'doctor', '--extensions', '--json'],
    { cwd, encoding: 'utf8' });
  assert.equal(proc.status, 1, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.data.healthy, false);
}));
