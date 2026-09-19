import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addSkill, initProject, inspectProject, inspectGlobal } from '../src/project.js';
import { normalizeSkillName, resolveProfile } from '../src/catalog.js';

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-add-'));
  const packageRoot = path.join(base, 'package');
  const projectRoot = path.join(base, 'project');
  const homeRoot = path.join(base, 'home');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  for (const skillId of resolveProfile('full')) {
    await mkdir(path.join(packageRoot, 'skills', skillId), { recursive: true });
    await writeFile(path.join(packageRoot, 'skills', skillId, 'SKILL.md'), `---\nname: ${skillId}\ndescription: Add command fixture skill used only for installer testing.\n---\n`);
  }
  return { base, packageRoot, projectRoot, homeRoot };
}

test('normalizeSkillName accepts short and canonical names', () => {
  assert.equal(normalizeSkillName('debug'), 'showdar-debug');
  assert.equal(normalizeSkillName('showdar-debug'), 'showdar-debug');
  assert.equal(normalizeSkillName('security'), 'showdar-security');
  assert.throws(() => normalizeSkillName('nope'), /Unknown skill/);
  assert.throws(() => normalizeSkillName(''), /required/i);
  assert.throws(() => normalizeSkillName('../escape'), /Unknown skill/);
});

test('add debug installs to default universal project root', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    const r = await addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    assert.equal(r.skill, 'showdar-debug');
    assert.equal(r.scope, 'project');
    assert.equal(r.ai, 'universal');
    await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add showdar-debug canonical name works across all project targets', async () => {
  const matrix = { universal: '.agents/skills', codex: '.agents/skills', opencode: '.opencode/skills', cursor: '.cursor/skills', claude: '.claude/skills' };
  for (const [ai, rel] of Object.entries(matrix)) {
    const { base, packageRoot, projectRoot, homeRoot } = await fixture();
    try {
      const r = await addSkill({ cwd: projectRoot, skill: 'showdar-security', ai, scope: 'project', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
      assert.equal(r.ai, ai);
      await access(path.join(projectRoot, rel, 'showdar-security/SKILL.md'));
    } finally { await rm(base, { recursive: true, force: true }); }
  }
});

test('add works across all global targets', async () => {
  const matrix = { universal: ['.agents', 'skills'], codex: ['.agents', 'skills'], opencode: ['.config', 'opencode', 'skills'], cursor: ['.cursor', 'skills'], claude: ['.claude', 'skills'] };
  for (const [ai, parts] of Object.entries(matrix)) {
    const { base, packageRoot, projectRoot, homeRoot } = await fixture();
    try {
      const r = await addSkill({ cwd: projectRoot, skill: 'test', ai, scope: 'global', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
      assert.equal(r.scope, 'global');
      await access(path.join(homeRoot, ...parts, 'showdar-test/SKILL.md'));
      assert.equal((await inspectGlobal({ homeRoot })).healthy, true);
    } finally { await rm(base, { recursive: true, force: true }); }
  }
});

test('add is idempotent', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    const first = await addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    assert.equal(first.added, true);
    const second = await addSkill({ cwd: projectRoot, skill: 'showdar-debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    assert.equal(second.added, false);
    const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.equal(manifest.skills.filter((s) => s === 'showdar-debug').length, 1);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add preserves unrelated skills', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    await mkdir(path.join(projectRoot, '.agents/skills/user-skill'), { recursive: true });
    await writeFile(path.join(projectRoot, '.agents/skills/user-skill/SKILL.md'), 'user');
    await addSkill({ cwd: projectRoot, skill: 'review', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    await access(path.join(projectRoot, '.agents/skills/user-skill/SKILL.md'));
    await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
    await access(path.join(projectRoot, '.agents/skills/showdar-review/SKILL.md'));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add inherits config ai/scope and explicit flags override', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'product', ai: 'universal', skillIds: resolveProfile('product'), packageVersion: '0.2.3' });
    const inherited = await addSkill({ cwd: projectRoot, skill: 'ops', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    assert.equal(inherited.ai, 'universal');
    const overridden = await addSkill({ cwd: projectRoot, skill: 'git', ai: 'cursor', scope: 'project', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    assert.equal(overridden.ai, 'cursor');
    await access(path.join(projectRoot, '.cursor/skills/showdar-git/SKILL.md'));
    const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.equal(manifest.profile, 'product');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add after init product keeps profile and extends skills', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'product', ai: 'universal', skillIds: resolveProfile('product'), packageVersion: '0.2.3' });
    await addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.equal(manifest.profile, 'product');
    assert.ok(manifest.skills.includes('showdar-debug'));
    assert.ok(manifest.skills.includes('showdar-plan'));
    await addSkill({ cwd: projectRoot, skill: 'security', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    await addSkill({ cwd: projectRoot, skill: 'quality', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    const status = await inspectProject(projectRoot, { homeRoot });
    assert.equal(status.profile, 'product');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add refuses ownership conflicts', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    const target = path.join(projectRoot, '.agents/skills/showdar-debug');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), 'user-owned');
    await assert.rejects(
      addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' }),
      /Refusing to overwrite/,
    );
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('add rejects traversal and missing packaged source', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await assert.rejects(addSkill({ cwd: projectRoot, skill: '../escape', packageRoot, home: homeRoot }), /Unknown skill/);
    await assert.rejects(addSkill({ cwd: projectRoot, skill: '/abs/path', packageRoot, home: homeRoot }), /Unknown skill/);
    await assert.rejects(addSkill({ cwd: projectRoot, skill: 'debug', ai: 'wat', scope: 'project', packageRoot, home: homeRoot }), /Unknown AI target/);
    await rm(path.join(packageRoot, 'skills', 'showdar-debug'), { recursive: true, force: true });
    await assert.rejects(addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot }), /Packaged skill source missing/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('re-init product after add preserves explicit addition', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'product', ai: 'universal', skillIds: resolveProfile('product'), packageVersion: '0.2.3' });
    await addSkill({ cwd: projectRoot, skill: 'debug', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    await access(path.join(projectRoot, '.agents/skills/showdar-debug/SKILL.md'));
    const manifest = JSON.parse(await readFile(path.join(projectRoot, '.showdar.json'), 'utf8'));
    assert.ok(manifest.skills.includes('showdar-debug'));
    assert.equal(manifest.profile, 'product');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('doctor recognizes added skill', async () => {
  const { base, packageRoot, projectRoot, homeRoot } = await fixture();
  try {
    await addSkill({ cwd: projectRoot, skill: 'ship', packageRoot, home: homeRoot, packageVersion: '0.2.3' });
    const status = await inspectProject(projectRoot, { homeRoot });
    assert.equal(status.healthy, true);
    assert.ok(status.skills >= 1);
  } finally { await rm(base, { recursive: true, force: true }); }
});
