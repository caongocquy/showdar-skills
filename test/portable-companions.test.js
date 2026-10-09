import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SKILLS, COMPANION_SKILLS, SKILLS, getPrimitive, getSkill, isWorkflowSkill, resolveProfile } from '../src/catalog.js';
import { initProject, addSkill, inspectProject } from '../src/project.js';
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
  assert.equal(COMPANION_SKILLS.length, 3);
  assert.equal(ALL_SKILLS.length, 25);
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
  const refine = await readFile(path.join(packageRoot, 'skills/showdar-refine/SKILL.md'), 'utf8');
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
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-refine/SKILL.md'));
    await access(path.join(f.projectRoot, '.cursor/skills/showdar-domain-model/SKILL.md'));
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
