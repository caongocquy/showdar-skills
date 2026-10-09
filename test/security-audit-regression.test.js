import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, removeProject, addSkill, createPack } from '../src/project.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'bin', 'showdar.js');

async function isolated(run) {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-security-audit-'));
  const projectRoot = path.join(base, 'project');
  const homeRoot = path.join(base, 'home');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  try { await run({ base, projectRoot, homeRoot }); }
  finally { await rm(base, { recursive: true, force: true }); }
}

const install = (projectRoot, homeRoot, skillIds, ai = 'universal') =>
  initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai, skillIds, packageVersion: '0.15.0' });

test('corrupted manifest cannot remove project root or unrelated files', () => isolated(async ({ projectRoot, homeRoot }) => {
  await install(projectRoot, homeRoot, ['showdar-debug']);
  const sentinel = path.join(projectRoot, 'keep-me.txt');
  await writeFile(sentinel, 'important source file');
  const manifestPath = path.join(projectRoot, '.showdar.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.push({ path: '.', hash: 'untrusted' });
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(removeProject(projectRoot), /Unsafe Showdar manifest deletion path/);
  assert.equal(await readFile(sentinel, 'utf8'), 'important source file');
  await access(manifestPath);
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
}));

test('installation refuses symlinked command root without writes outside project', () => isolated(async ({ projectRoot, homeRoot, base }) => {
  const external = path.join(base, 'external');
  await mkdir(external);
  await mkdir(path.join(projectRoot, '.opencode'));
  await symlink(external, path.join(projectRoot, '.opencode/commands'));
  await assert.rejects(install(projectRoot, homeRoot, ['showdar-debug'], 'opencode'));
  assert.deepEqual(await readdir(external), []);
}));

test('foreign skill collision leaves previously installed skill and manifest intact', () => isolated(async ({ projectRoot, homeRoot }) => {
  await install(projectRoot, homeRoot, ['showdar-debug']);
  const manifestPath = path.join(projectRoot, '.showdar.json');
  const before = await readFile(manifestPath, 'utf8');
  const foreign = path.join(projectRoot, '.agents/skills/showdar-build');
  await mkdir(foreign);
  await writeFile(path.join(foreign, 'SKILL.md'), 'foreign');
  await assert.rejects(install(projectRoot, homeRoot, ['showdar-build']), /Refusing to overwrite existing non-Showdar-managed/);
  assert.equal(await readFile(manifestPath, 'utf8'), before);
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  assert.equal(await readFile(path.join(foreign, 'SKILL.md'), 'utf8'), 'foreign');
}));

test('adding an existing skill for a new AI target materializes its native copy', () => isolated(async ({ projectRoot, homeRoot }) => {
  await install(projectRoot, homeRoot, ['showdar-debug']);
  await addSkill({ cwd: projectRoot, home: homeRoot, packageRoot, skill: 'debug', ai: 'claude', packageVersion: '0.15.0' });
  await access(path.join(projectRoot, '.claude/skills/showdar-debug/SKILL.md'));
  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  assert.ok(manifest.targets.includes('claude'));
}));

test('invalid pack JSON diagnostics exit nonzero', () => isolated(async ({ projectRoot }) => {
  const bad = path.join(projectRoot, 'bad-pack');
  await mkdir(bad);
  const result = spawnSync(process.execPath, [cli, 'validate-pack', bad, '--json'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, false);
}));

test('create-pack uses the exact requested directory', () => isolated(async ({ projectRoot }) => {
  const result = await createPack({ cwd: projectRoot, path: 'requested-pack', vendor: 'test', description: 'Regression pack' });
  await access(path.join(projectRoot, 'requested-pack', 'pack.json'));
  await assert.rejects(access(path.join(projectRoot, 'requested-pack', 'requested-pack', 'pack.json')));
  assert.ok(result.packDir.endsWith('requested-pack'));
}));

test('Codex benchmark module imports the current routing contract', async () => {
  const module = await import('../benchmark/adapters/codex.js');
  assert.equal(typeof module.buildVariantPrompt, 'function');
});
