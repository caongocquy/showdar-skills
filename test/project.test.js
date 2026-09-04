import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initGlobal, initProject, inspectGlobal, inspectProject, removeGlobal, removeProject } from '../src/project.js';
import { globalCommandRootFor, globalSkillRootFor, resolveTargets, skillRootFor } from '../src/adapters.js';

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-v02-'));
  const packageRoot = path.join(base, 'package');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(path.join(packageRoot, 'skills', 'showdar-debug'), { recursive: true });
  await mkdir(path.join(packageRoot, 'commands', 'opencode', 'showdar'), { recursive: true });
  await writeFile(path.join(packageRoot, 'skills', 'showdar-debug', 'SKILL.md'), '---\nname: showdar-debug\ndescription: A deep debugging workflow used only for installer fixture testing.\n---\n');
  await writeFile(path.join(packageRoot, 'commands', 'opencode', 'showdar', 'debug.md'), 'Use $showdar-debug for $ARGUMENTS\n');
  return { base, packageRoot, projectRoot };
}

const nativeRoots = {
  codex: '.agents/skills',
  opencode: '.opencode/skills',
  claude: '.claude/skills',
  universal: '.agents/skills',
};

test('adapter resolves native target roots and all mode', () => {
  const root = '/repo';
  for (const [target, relative] of Object.entries(nativeRoots)) {
    assert.equal(skillRootFor(target, root), path.join(root, relative));
  }
  assert.equal(skillRootFor('codex', root), skillRootFor('universal', root));
  assert.equal(globalSkillRootFor('codex', { homeRoot: '/home/user' }), globalSkillRootFor('universal', { homeRoot: '/home/user' }));
  assert.doesNotMatch(skillRootFor('codex', root), /\.codex/);
  assert.deepEqual(resolveTargets('all'), ['codex', 'opencode', 'claude', 'universal']);
  assert.throws(() => resolveTargets('wat'), /Unknown AI target/);
});

test('init installs skills into each native target and writes ownership manifest', async () => {
  const { packageRoot, projectRoot } = await fixture();
  await writeFile(path.join(projectRoot, 'AGENTS.md'), '# Existing\n\nKeep this rule.\n');

  await initProject({
    projectRoot,
    packageRoot,
    profile: 'full',
    ai: 'all',
    skillIds: ['showdar-debug'],
    commandNames: ['debug'],
    packageVersion: '0.2.0',
  });

  for (const relative of Object.values(nativeRoots)) {
    await access(path.join(projectRoot, relative, 'showdar-debug', 'SKILL.md'));
  }
  await access(path.join(projectRoot, '.opencode/commands/showdar/debug.md'));

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.profile, 'full');
  assert.equal(manifest.ai, 'all');
  assert.equal(manifest.scope, 'project');
  assert.deepEqual(manifest.targets, ['codex', 'opencode', 'claude', 'universal']);
  assert.equal(manifest.skills.length, 1);
  assert.equal(new Set(manifest.files.map(({ path: file }) => file)).size, manifest.files.length);
  assert.equal(manifest.files.filter(({ path: file }) => file === '.agents/skills/showdar-debug').length, 1);

  const agents = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Keep this rule/);
  assert.match(agents, /showdar-debug/);
  assert.equal((agents.match(/showdar-skills:start/g) ?? []).length, 1);
});

test('init is idempotent and changing targets removes only stale Showdar-owned copies', async () => {
  const { packageRoot, projectRoot } = await fixture();
  await initProject({ projectRoot, packageRoot, profile: 'full', ai: 'all', skillIds: ['showdar-debug'], commandNames: ['debug'], packageVersion: '0.2.0' });
  await mkdir(path.join(projectRoot, '.claude/skills/user-skill'), { recursive: true });
  await writeFile(path.join(projectRoot, '.claude/skills/user-skill/SKILL.md'), 'user');

  await initProject({ projectRoot, packageRoot, profile: 'full', ai: 'codex', skillIds: ['showdar-debug'], commandNames: [], packageVersion: '0.2.0' });
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  await assert.rejects(access(path.join(projectRoot, '.codex/skills/showdar-debug/SKILL.md')));
  await assert.rejects(access(path.join(projectRoot, '.opencode/skills/showdar-debug/SKILL.md')));
  await assert.rejects(access(path.join(projectRoot, '.claude/skills/showdar-debug/SKILL.md')));
  await access(path.join(projectRoot, '.claude/skills/user-skill/SKILL.md'));

  const agents = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  assert.equal((agents.match(/showdar-skills:start/g) ?? []).length, 1);
});

test('init refuses to overwrite a same-name skill not owned by Showdar', async () => {
  const { packageRoot, projectRoot } = await fixture();
  const target = path.join(projectRoot, '.agents/skills/showdar-debug');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'SKILL.md'), 'user-owned');

  await assert.rejects(
    initProject({ projectRoot, packageRoot, profile: 'full', ai: 'codex', skillIds: ['showdar-debug'], commandNames: [], packageVersion: '0.2.0' }),
    /Refusing to overwrite existing non-Showdar-managed skill/,
  );
});

test('doctor detects drift and remove preserves unrelated files and AGENTS content', async () => {
  const { packageRoot, projectRoot } = await fixture();
  await writeFile(path.join(projectRoot, 'AGENTS.md'), '# User rules\n');
  await initProject({ projectRoot, packageRoot, profile: 'full', ai: 'opencode', skillIds: ['showdar-debug'], commandNames: ['debug'], packageVersion: '0.2.0' });

  let status = await inspectProject(projectRoot);
  assert.equal(status.healthy, true);
  assert.equal(status.skills, 1);
  assert.equal(status.targets.length, 1);

  await writeFile(path.join(projectRoot, '.opencode/skills/showdar-debug/SKILL.md'), 'drifted');
  status = await inspectProject(projectRoot);
  assert.equal(status.healthy, false);
  assert.ok(status.issues.some((issue) => issue.includes('drift')));

  await mkdir(path.join(projectRoot, '.opencode/skills/user-skill'), { recursive: true });
  await writeFile(path.join(projectRoot, '.opencode/skills/user-skill/SKILL.md'), 'user');
  await removeProject(projectRoot);

  await access(path.join(projectRoot, '.opencode/skills/user-skill/SKILL.md'));
  await assert.rejects(access(path.join(projectRoot, '.showdar.json')));
  const agents = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  assert.equal(agents.trim(), '# User rules');
  const after = await inspectProject(projectRoot);
  assert.equal(after.installed, false);
});

test('global init uses verified native user roots and a separate manifest without project files', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  const homeRoot = path.join(base, 'home');

  await initGlobal({
    homeRoot,
    packageRoot,
    profile: 'minimal',
    ai: 'all',
    skillIds: ['showdar-debug'],
    commandNames: ['debug'],
    packageVersion: '0.2.0',
  });

  for (const target of ['codex', 'opencode', 'claude', 'universal']) {
    await access(path.join(globalSkillRootFor(target, { homeRoot }), 'showdar-debug', 'SKILL.md'));
  }
  await access(path.join(globalCommandRootFor({ homeRoot }), 'debug.md'));
  await access(path.join(homeRoot, '.showdar', 'global.json'));
  await assert.rejects(access(path.join(projectRoot, '.showdar.json')));
  await assert.rejects(access(path.join(projectRoot, 'AGENTS.md')));

  const status = await inspectGlobal({ homeRoot });
  assert.equal(status.scope, 'global');
  assert.equal(status.healthy, true);
  assert.equal(status.skills, 1);
  const manifest = JSON.parse(await readFile(path.join(homeRoot, '.showdar', 'global.json'), 'utf8'));
  assert.equal(new Set(manifest.files.map(({ path: file }) => file)).size, manifest.files.length);
  assert.equal(manifest.files.filter(({ path: file }) => file === '.agents/skills/showdar-debug').length, 1);
  assert.ok(manifest.files.every(({ path: file }) => !file.includes('.codex')));
});

test('global init is idempotent, switches targets safely, and preserves unrelated skills', async () => {
  const { base, packageRoot } = await fixture();
  const homeRoot = path.join(base, 'home');
  await initGlobal({ homeRoot, packageRoot, profile: 'full', ai: 'all', skillIds: ['showdar-debug'], commandNames: ['debug'], packageVersion: '0.2.0' });

  const userSkill = path.join(homeRoot, '.agents', 'skills', 'user-skill');
  await mkdir(userSkill, { recursive: true });
  await writeFile(path.join(userSkill, 'SKILL.md'), 'user-owned');

  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], commandNames: [], packageVersion: '0.2.0' });
  await access(path.join(globalSkillRootFor('codex', { homeRoot }), 'showdar-debug', 'SKILL.md'));
  await assert.rejects(access(path.join(globalSkillRootFor('claude', { homeRoot }), 'showdar-debug')));
  await assert.rejects(access(path.join(globalCommandRootFor({ homeRoot }), 'debug.md')));
  await access(path.join(userSkill, 'SKILL.md'));
  assert.equal((await inspectGlobal({ homeRoot })).healthy, true);
});

test('project and global ownership manifests do not collide and removal is scoped', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  const homeRoot = path.join(base, 'home');
  await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], commandNames: [], packageVersion: '0.2.0' });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], commandNames: [], packageVersion: '0.2.0' });

  const projectManifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  const globalManifest = JSON.parse(await readFile(path.join(homeRoot, '.showdar', 'global.json'), 'utf8'));
  assert.equal(projectManifest.scope, 'project');
  assert.equal(globalManifest.scope, 'global');

  await removeGlobal({ homeRoot });
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  await assert.rejects(access(path.join(homeRoot, '.agents/skills/showdar-debug')));
  await assert.rejects(access(path.join(homeRoot, '.showdar/global.json')));
  assert.equal((await inspectProject(projectRoot)).healthy, true);
});
