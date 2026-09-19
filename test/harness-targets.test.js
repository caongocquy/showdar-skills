import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSkillRoot, globalSkillRootFor, skillRootFor } from '../src/adapters.js';
import { initGlobal, initProject, inspectGlobal, inspectProject } from '../src/project.js';
import { resolveProfile } from '../src/catalog.js';

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-harness-'));
  const packageRoot = path.join(base, 'package');
  const projectRoot = path.join(base, 'project');
  const homeRoot = path.join(base, 'home');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  for (const skillId of [...resolveProfile('minimal'), ...resolveProfile('developer'), ...resolveProfile('product'), ...resolveProfile('full')]) {
    await mkdir(path.join(packageRoot, 'skills', skillId), { recursive: true });
    await writeFile(path.join(packageRoot, 'skills', skillId, 'SKILL.md'), `---\nname: ${skillId}\ndescription: Harness matrix fixture skill used only for installer testing.\n---\n`);
  }
  await mkdir(path.join(packageRoot, 'commands', 'opencode', 'showdar'), { recursive: true });
  await writeFile(path.join(packageRoot, 'commands', 'opencode', 'showdar', 'debug.md'), 'Use $showdar-debug for $ARGUMENTS\n');
  return { base, packageRoot, projectRoot, homeRoot };
}

const PROJECT_MATRIX = {
  universal: '.agents/skills',
  codex: '.agents/skills',
  opencode: '.opencode/skills',
  cursor: '.cursor/skills',
  claude: '.claude/skills',
};

const GLOBAL_MATRIX = {
  universal: ['.agents', 'skills'],
  codex: ['.agents', 'skills'],
  opencode: ['.config', 'opencode', 'skills'],
  cursor: ['.cursor', 'skills'],
  claude: ['.claude', 'skills'],
};

test('resolveSkillRoot returns the canonical project root per harness', () => {
  for (const [ai, relative] of Object.entries(PROJECT_MATRIX)) {
    assert.equal(resolveSkillRoot({ ai, scope: 'project', cwd: '/repo' }), path.join('/repo', relative));
  }
});

test('resolveSkillRoot returns the canonical global root per harness', () => {
  for (const [ai, parts] of Object.entries(GLOBAL_MATRIX)) {
    assert.equal(resolveSkillRoot({ ai, scope: 'global', cwd: '/repo', home: '/home/user' }), path.join('/home/user', ...parts));
  }
});

test('resolveSkillRoot rejects unknown targets and scopes without side effects', () => {
  assert.throws(() => resolveSkillRoot({ ai: 'wat', scope: 'project', cwd: '/repo' }), /Unknown AI target/);
  assert.throws(() => resolveSkillRoot({ ai: 'cursor', scope: 'nope', cwd: '/repo' }), /Unknown scope/);
});

test('project install writes to exactly one canonical harness root', async () => {
  for (const [ai, relative] of Object.entries(PROJECT_MATRIX)) {
    const { base, packageRoot, projectRoot } = await fixture();
    try {
      await initProject({ projectRoot, packageRoot, profile: 'minimal', ai, skillIds: ['showdar-debug'], packageVersion: '0.2.3' });
      await access(path.join(projectRoot, relative, 'showdar-debug', 'SKILL.md'));
      const others = new Set(Object.values(PROJECT_MATRIX));
      others.delete(relative);
      for (const other of others) {
        if (other === relative) continue;
        await assert.rejects(access(path.join(projectRoot, other, 'showdar-understand')));
      }
      const status = await inspectProject(projectRoot);
      assert.equal(status.healthy, true);
      assert.deepEqual(status.targets, [ai]);
    } finally { await rm(base, { recursive: true, force: true }); }
  }
});

test('global install writes to exactly one canonical harness root', async () => {
  for (const [ai, parts] of Object.entries(GLOBAL_MATRIX)) {
    const { base, packageRoot, homeRoot } = await fixture();
    try {
      await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai, skillIds: ['showdar-debug'], packageVersion: '0.2.3' });
      await access(path.join(homeRoot, ...parts, 'showdar-debug', 'SKILL.md'));
      const status = await inspectGlobal({ homeRoot });
      assert.equal(status.healthy, true);
      assert.deepEqual(status.targets, [ai]);
    } finally { await rm(base, { recursive: true, force: true }); }
  }
});

test('representative profiles behave identically across harness targets', async () => {
  for (const profile of ['minimal', 'developer', 'product', 'full']) {
    const skillIds = resolveProfile(profile);
    for (const ai of Object.keys(PROJECT_MATRIX)) {
      const { base, packageRoot, projectRoot } = await fixture();
      try {
        const result = await initProject({ projectRoot, packageRoot, profile, ai, skillIds, packageVersion: '0.2.3' });
        assert.equal(result.requestedSkills, skillIds.length);
        assert.equal(result.installedSkills, skillIds.length);
        assert.equal((await inspectProject(projectRoot)).healthy, true);
      } finally { await rm(base, { recursive: true, force: true }); }
    }
  }
});

test('default --ai behavior remains universal', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  try {
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'universal', skillIds: ['showdar-debug'], packageVersion: '0.2.3' });
    await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
    assert.equal(skillRootFor('universal', projectRoot), skillRootFor('codex', projectRoot));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('reinstall is idempotent and switching harness installs only the new root', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  try {
    const skillIds = ['showdar-debug'];
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'universal', skillIds, packageVersion: '0.2.3' });
    const before = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'universal', skillIds, packageVersion: '0.2.3' });
    const after = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.equal(after.files.length, before.files.length);

    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds, packageVersion: '0.2.3' });
    await access(path.join(projectRoot, '.cursor/skills/showdar-debug/SKILL.md'));
    const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.deepEqual(manifest.targets, ['cursor']);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('doctor validates the configured harness root only', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  try {
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.2.3' });
    await mkdir(path.join(projectRoot, '.agents/skills/user-skill'), { recursive: true });
    await writeFile(path.join(projectRoot, '.agents/skills/user-skill/SKILL.md'), 'user');
    const status = await inspectProject(projectRoot);
    assert.equal(status.healthy, true);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('unrelated user skills are preserved', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  try {
    await mkdir(path.join(projectRoot, '.cursor/skills/user-skill'), { recursive: true });
    await writeFile(path.join(projectRoot, '.cursor/skills/user-skill/SKILL.md'), 'user');
    await initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.2.3' });
    await access(path.join(projectRoot, '.cursor/skills/user-skill/SKILL.md'));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('path traversal through skill ids is rejected', async () => {
  const { base, packageRoot, projectRoot } = await fixture();
  try {
    await assert.rejects(
      initProject({ projectRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds: ['../escape'], packageVersion: '0.2.3' }),
      /Skill asset not found|Invalid managed path/,
    );
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('global HOME resolution matches the canonical matrix', () => {
  for (const [ai, parts] of Object.entries(GLOBAL_MATRIX)) {
    assert.equal(globalSkillRootFor(ai, { homeRoot: '/home/user' }), path.join('/home/user', ...parts));
  }
});
