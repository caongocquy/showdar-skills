import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SKILLS, COMPANION_SKILLS, SKILLS, getPrimitive, getSkill, isWorkflowSkill, resolveProfile } from '../src/catalog.js';
import { initProject, addSkill, inspectProject, hashTree } from '../src/project.js';
import { validateSkillDirectory } from '../src/validate.js';
import { renderShowdarInstruction } from '../src/adapter-renderers.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-companion-'));
  const projectRoot = path.join(root, 'project');
  const homeRoot = path.join(root, 'home');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  return { root, projectRoot, homeRoot };
}

function hashFile(text) {
  return createHash('sha256').update('').update('\0').update(text).update('\0').digest('hex');
}

async function seedLegacy({ projectRoot }) {
  const legacy = path.join(projectRoot, '.cursor', 'commands', 'showdar-setup.md');
  await mkdir(path.dirname(legacy), { recursive: true });
  const content = 'Legacy setup command\n';
  await writeFile(legacy, content);
  const manifestPath = path.join(projectRoot, '.showdar.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.push({ path: '.cursor/commands/showdar-setup.md', hash: hashFile(content) });
  manifest.commands.push({ target: 'cursor', name: 'showdar-setup', path: '.cursor/commands/showdar-setup.md' });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { legacy, manifestPath };
}

test('companions are installable first-class skills without changing lifecycle primitive membership', () => {
  assert.equal(SKILLS.length, 18);
  assert.equal(COMPANION_SKILLS.length, 4);
  assert.equal(ALL_SKILLS.length, 26);
  assert.ok(resolveProfile('full').includes('showdar-setup'));
  for (const skill of COMPANION_SKILLS) {
    assert.equal(getSkill(skill.id)?.kind, 'companion');
    assert.equal(getPrimitive(skill.id), null);
    assert.equal(isWorkflowSkill(skill.id), false);
  }
});

test('companion SKILL.md artifacts satisfy native portable format and approval guidance', async () => {
  for (const skill of COMPANION_SKILLS) {
    const dir = path.join(packageRoot, 'skills', skill.id);
    const result = await validateSkillDirectory(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const markdown = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
    assert.match(markdown, /approval/i);
    assert.match(markdown, /CLI is unavailable|without any Showdar executable|skills-only/);
  }
  const refine = await readFile(path.join(packageRoot, 'skills/showdar-brainstorm/SKILL.md'), 'utf8');
  assert.match(refine, /whole.*spec|complete.*spec/i);
  const feature = await readFile(path.join(packageRoot, 'skills/showdar-feature/SKILL.md'), 'utf8');
  assert.match(feature, /Conditional refinement gate/);
});

test('native Cursor setup is installed without a colliding custom slash command', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'developer', ai: 'cursor', skillIds: resolveProfile('developer'), packageVersion: '0.16.0' });
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-setup/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-brainstorm/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-domain-model/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-tdd/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-tdd/references/red-green-refactor.md'));
    await assert.rejects(access(path.join(f.projectRoot, '.cursor/commands/showdar-setup.md')));
    assert.equal((await inspectProject(f.projectRoot, { homeRoot: f.homeRoot })).healthy, true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('legacy owned setup command migrates away during installation refresh', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.15.1' });
    const { legacy, manifestPath } = await seedLegacy(f);
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'developer', ai: 'cursor', skillIds: ['showdar-debug', 'showdar-setup'], packageVersion: '0.16.0' });
    await assert.rejects(access(legacy));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-setup/SKILL.md'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.ok(!manifest.files.some(e => e.path.endsWith('commands/showdar-setup.md')));
    assert.ok(!manifest.commands.some(e => e.name === 'showdar-setup'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('modified legacy setup command prevents destructive migration', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.15.1' });
    const { legacy } = await seedLegacy(f);
    await writeFile(legacy, 'My custom setup edits\n');
    await assert.rejects(initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'developer', ai: 'cursor', skillIds: ['showdar-debug', 'showdar-setup'], packageVersion: '0.16.0' }),
      /Modified legacy Showdar setup command/);
    assert.equal(await readFile(legacy, 'utf8'), 'My custom setup edits\n');
    await assert.rejects(access(path.join(f.projectRoot, '.cursor/skills/showdar-setup/SKILL.md')));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('addSkill migrates an owned legacy setup command without affecting existing skills', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.15.1' });
    const { legacy } = await seedLegacy(f);
    await addSkill({ cwd: f.projectRoot, home: f.homeRoot, packageRoot, skill: 'showdar-setup', packageVersion: '0.16.0' });
    await assert.rejects(access(legacy));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-setup/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-debug/SKILL.md'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('companions are not added to canonical lifecycle primary routes', () => {
  const rendered = renderShowdarInstruction(['showdar-build', ...COMPANION_SKILLS.map(x => x.id)]);
  assert.match(rendered, /Companions are portable and do not compete for canonical lifecycle primary/);
});

async function seedRetiredSkill({ projectRoot, ai = 'cursor' }) {
  const prefix = ai === 'opencode' ? '.opencode' : '.cursor';
  const oldRel = prefix + '/skills/showdar-refine';
  const target = path.join(projectRoot, oldRel);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'SKILL.md'), '# Legacy refine skill (managed)\n');
  const manifestPath = path.join(projectRoot, '.showdar.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.skills.push('showdar-refine');
  manifest.files.push({ path: oldRel, hash: await hashTree(target) });
  let oldCommand = null;
  if (ai === 'opencode') {
    const commandRel = '.opencode/commands/showdar/refine.md';
    oldCommand = path.join(projectRoot, commandRel);
    const commandContent = 'Load and follow showdar-refine.\n';
    await mkdir(path.dirname(oldCommand), { recursive: true });
    await writeFile(oldCommand, commandContent);
    manifest.files.push({ path: commandRel, hash: hashFile(commandContent) });
    manifest.commands.push({ target: ai, name: 'refine', path: commandRel });
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { target, oldCommand, manifestPath };
}

test('init migrates pristine CLI-owned v0.16 refine skill and OpenCode command', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'opencode', skillIds: ['showdar-debug'], packageVersion: '0.16.0' });
    const previous = await seedRetiredSkill({ projectRoot: f.projectRoot, ai: 'opencode' });
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'developer', ai: 'opencode', skillIds: resolveProfile('developer'), packageVersion: '0.17.0' });
    await assert.rejects(access(previous.target));
    await assert.rejects(access(previous.oldCommand));
    await access(path.join(f.projectRoot, '.opencode/skills/showdar-brainstorm/SKILL.md'));
    await access(path.join(f.projectRoot, '.opencode/commands/showdar/brainstorm.md'));
    const manifest = JSON.parse(await readFile(previous.manifestPath, 'utf8'));
    assert.ok(manifest.skills.includes('showdar-brainstorm'));
    assert.ok(!manifest.skills.includes('showdar-refine'));
    assert.ok(!manifest.files.some(file => /showdar-refine|\/refine\.md$/.test(file.path)));
    assert.equal((await inspectProject(f.projectRoot, { homeRoot: f.homeRoot })).healthy, true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('add brainstorm migrates pristine managed legacy while preserving profile', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.16.0' });
    const previous = await seedRetiredSkill(f);
    await addSkill({ cwd: f.projectRoot, home: f.homeRoot, packageRoot, skill: 'brainstorm', packageVersion: '0.17.0' });
    await assert.rejects(access(previous.target));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-brainstorm/SKILL.md'));
    const manifest = JSON.parse(await readFile(previous.manifestPath, 'utf8'));
    assert.equal(manifest.profile, 'minimal');
    assert.ok(manifest.skills.includes('showdar-brainstorm'));
    assert.ok(!manifest.skills.includes('showdar-refine'));
    assert.ok(!manifest.files.some(x => x.path.includes('showdar-refine')));
    assert.equal((await inspectProject(f.projectRoot, { homeRoot: f.homeRoot })).healthy, true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('modified retired skill blocks migration without deleting user edits', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.16.0' });
    const previous = await seedRetiredSkill(f);
    const edited = '# My edits must survive\n';
    await writeFile(path.join(previous.target, 'SKILL.md'), edited);
    await assert.rejects(
      initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
        profile: 'developer', ai: 'cursor', skillIds: resolveProfile('developer'), packageVersion: '0.17.0' }),
      /Modified retired Showdar skill/
    );
    assert.equal(await readFile(path.join(previous.target, 'SKILL.md'), 'utf8'), edited);
    await assert.rejects(access(path.join(f.projectRoot, '.cursor/skills/showdar-brainstorm/SKILL.md')));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('foreign native refine remains untouched when Showdar never owned it', async () => {
  const f = await fixture();
  try {
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-debug'], packageVersion: '0.16.0' });
    const foreign = path.join(f.projectRoot, '.cursor/skills/showdar-refine');
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, 'SKILL.md'), 'user installed independently\n');
    await initProject({ projectRoot: f.projectRoot, homeRoot: f.homeRoot, packageRoot,
      profile: 'developer', ai: 'cursor', skillIds: resolveProfile('developer'), packageVersion: '0.17.0' });
    assert.equal(await readFile(path.join(foreign, 'SKILL.md'), 'utf8'), 'user installed independently\n');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
