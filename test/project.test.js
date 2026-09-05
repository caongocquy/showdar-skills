import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initGlobal, initProject, inspectGlobal, inspectProject, removeGlobal, removeProject } from '../src/project.js';
import { globalCommandRootFor, globalSkillRootFor, resolveTargets, skillRootFor } from '../src/adapters.js';
import { resolveProfile } from '../src/catalog.js';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

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

async function withFixture(run) {
  const data = await fixture();
  try { return await run(data); } finally { await rm(data.base, { recursive: true, force: true }); }
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

test('project init deduplicates globally owned skills and preserves the requested profile', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });

  const result = await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });
  assert.equal(result.requestedSkills, 12);
  assert.equal(result.installedSkills, 4);
  assert.equal(result.satisfiedByGlobal, 8);
  assert.equal(result.skippedDuplicates, 8);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
  assert.deepEqual(manifest.skills, resolveProfile('developer'));
  assert.equal(manifest.satisfiedByGlobal.length, 8);
  assert.equal(manifest.files.filter(({ path: file }) => file.startsWith('.agents/skills/')).length, 4);
  await assert.rejects(access(path.join(projectRoot, '.agents/skills/showdar-understand')));
  await access(path.join(projectRoot, '.agents/skills/showdar-security/SKILL.md'));
  const status = await inspectProject(projectRoot, { homeRoot });
  assert.equal(status.healthy, true);
  assert.equal(status.skills, 12);
  assert.equal(status.satisfiedByGlobal, 8);

  const repeat = await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });
  assert.equal(repeat.installedSkills, 4);
  assert.equal(repeat.satisfiedByGlobal, 8);
  assert.equal(repeat.skippedDuplicates, 8);
});

test('project removal preserves globally satisfied Showdar skills', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-remove-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });
  await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });

  await removeProject(projectRoot);
  await access(path.join(homeRoot, '.agents/skills/showdar-debug/SKILL.md'));
  await assert.rejects(access(path.join(projectRoot, '.agents/skills/showdar-security')));
});

test('project doctor reports missing global satisfaction after global removal', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-missing-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });
  await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });
  await removeGlobal({ homeRoot });

  const status = await inspectProject(projectRoot, { homeRoot });
  assert.equal(status.healthy, false);
  assert.ok(status.issues.some((issue) => /global.*showdar-understand|globally satisfied.*missing/i.test(issue)));
});

test('project doctor reports duplicate Showdar-owned project and global skills without deleting them', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-duplicate-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });

  const status = await inspectProject(projectRoot, { homeRoot });
  assert.equal(status.healthy, true);
  assert.ok(status.warnings.some((warning) => /Duplicate Showdar skill discovery[\s\S]*showdar-debug/i.test(warning)));
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  await access(path.join(homeRoot, '.agents/skills/showdar-debug/SKILL.md'));
});

test('project init preserves foreign same-name skills and rejects overwrite', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-foreign-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  const target = path.join(projectRoot, '.agents/skills/showdar-debug');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'SKILL.md'), 'user-owned');
  await assert.rejects(
    initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' }),
    /Refusing to overwrite existing non-Showdar-managed skill/,
  );
  assert.equal(await readFile(path.join(target, 'SKILL.md'), 'utf8'), 'user-owned');
});

test('project init refuses a symlinked AGENTS.md without changing its target', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const external = path.join(base, 'external-agents.md');
    const sentinel = 'external AGENTS sentinel\n';
    await writeFile(external, sentinel);
    await symlink(external, path.join(projectRoot, 'AGENTS.md'));

    await assert.rejects(
      initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' }),
      /symlink/i,
    );
    assert.equal(await readFile(external, 'utf8'), sentinel);
  });
});

test('project init refuses symlinked managed roots without changing external contents', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const external = path.join(base, 'external-skills');
    const sentinel = path.join(external, 'sentinel.txt');
    await mkdir(external, { recursive: true });
    await writeFile(sentinel, 'sentinel\n');
    await symlink(external, path.join(projectRoot, '.agents'));

    await assert.rejects(
      initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' }),
      /symlink/i,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'sentinel\n');
  });
});

test('project init refuses a symlinked nested managed directory', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const external = path.join(base, 'external-skills');
    const sentinel = path.join(external, 'sentinel.txt');
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(external, { recursive: true });
    await writeFile(sentinel, 'sentinel\n');
    await symlink(external, path.join(projectRoot, '.agents', 'skills'));

    await assert.rejects(
      initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' }),
      /symlink/i,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'sentinel\n');
  });
});

test('stale project cleanup refuses a symlinked managed path before removal', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const external = path.join(base, 'external-skills');
    const sentinel = path.join(external, 'sentinel.txt');
    await mkdir(external, { recursive: true });
    await writeFile(sentinel, 'sentinel\n');
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' });
    await rm(path.join(projectRoot, '.agents', 'skills'), { recursive: true, force: true });
    await symlink(external, path.join(projectRoot, '.agents', 'skills'));

    await assert.rejects(
      initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: [], packageVersion: '0.2.2' }),
      /symlink/i,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'sentinel\n');
  });
});

test('status and doctor integrity checks refuse a symlinked managed file', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const homeRoot = path.join(base, 'home');
    const external = path.join(base, 'external-skill.md');
    const sentinel = 'external skill sentinel\n';
    await writeFile(external, sentinel);
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' });
    const managedFile = path.join(projectRoot, '.agents', 'skills', 'showdar-debug', 'SKILL.md');
    await rm(managedFile);
    await symlink(external, managedFile);

    await assert.rejects(inspectProject(projectRoot, { homeRoot }), /symlink/i);
    assert.equal(await readFile(external, 'utf8'), sentinel);
  });
});

test('project remove refuses a symlinked managed parent without changing external contents', async () => {
  await withFixture(async ({ base, packageRoot, projectRoot }) => {
    const external = path.join(base, 'external-skills');
    const sentinel = path.join(external, 'sentinel.txt');
    await mkdir(external, { recursive: true });
    await writeFile(sentinel, 'sentinel\n');
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: ['showdar-debug'], packageVersion: '0.2.2' });
    await rm(path.join(projectRoot, '.agents'), { recursive: true, force: true });
    await symlink(external, path.join(projectRoot, '.agents'));

    await assert.rejects(removeProject(projectRoot), /symlink/i);
    assert.equal(await readFile(sentinel, 'utf8'), 'sentinel\n');
  });
});

test('project status warns when global Showdar exposes skills outside its profile', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-extra-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initGlobal({ homeRoot, packageRoot, profile: 'full', ai: 'codex', skillIds: resolveProfile('full'), packageVersion: '0.2.1' });
  await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });

  const status = await inspectProject(projectRoot, { homeRoot });
  assert.equal(status.healthy, true);
  assert.ok(status.warnings.some((warning) => /outside project profile.*developer/i.test(warning)));
});

test('changing a project profile removes only stale project-owned skills', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-profile-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initProject({ projectRoot, homeRoot, packageRoot, profile: 'full', ai: 'codex', skillIds: resolveProfile('full'), packageVersion: '0.2.1' });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });

  await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'codex', skillIds: resolveProfile('developer'), packageVersion: '0.2.1' });
  await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  await assert.rejects(access(path.join(projectRoot, '.agents/skills/showdar-ops')));
  await access(path.join(homeRoot, '.agents/skills/showdar-debug/SKILL.md'));
});

test('project init deduplicates shared .agents paths in --ai all mode', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-cross-scope-all-'));
  const homeRoot = path.join(base, 'home');
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds: resolveProfile('minimal'), packageVersion: '0.2.1' });
  const result = await initProject({ projectRoot, homeRoot, packageRoot, profile: 'developer', ai: 'all', skillIds: resolveProfile('developer'), commandNames: ['debug', 'security'], packageVersion: '0.2.1' });

  assert.equal(result.satisfiedByGlobal, 8);
  assert.equal(result.skippedDuplicates, 8);
  await assert.rejects(access(path.join(projectRoot, '.agents/skills/showdar-understand')));
  await access(path.join(projectRoot, '.opencode/skills/showdar-understand/SKILL.md'));
  await access(path.join(projectRoot, '.claude/skills/showdar-understand/SKILL.md'));
});
