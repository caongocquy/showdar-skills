import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { COMPANION_SKILLS, PROFILES, WORKFLOW_SKILLS, normalizeSkillName, resolveProfile } from '../src/catalog.js';
import { addSkill, initProject, inspectProject } from '../src/project.js';
import { validateSkillDirectory } from '../src/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = async id => readFile(path.join(root, 'skills', id, 'SKILL.md'), 'utf8');

test('native TDD is a companion, not a lifecycle workflow stage', async () => {
  assert.equal(normalizeSkillName('tdd'), 'showdar-tdd');
  assert.equal(normalizeSkillName('showdar-tdd'), 'showdar-tdd');
  assert.ok(COMPANION_SKILLS.some(s => s.id === 'showdar-tdd'));
  assert.ok(WORKFLOW_SKILLS.every(w => !w.stages.includes('showdar-tdd')));
  for (const p of ['developer','backend','qa','full']) assert.ok(PROFILES[p].includes('showdar-tdd'));
  for (const p of ['minimal','product','insurance']) assert.ok(!PROFILES[p].includes('showdar-tdd'));
});

test('TDD skill validates and describes real RED GREEN REFACTOR with no fake receipts', async () => {
  const dir = path.join(root, 'skills/showdar-tdd');
  const result = await validateSkillDirectory(dir);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  const doc = await skill('showdar-tdd');
  const ref = await readFile(path.join(dir, 'references/red-green-refactor.md'), 'utf8');
  for (const word of [/RED/i, /GREEN/i, /REFACTOR/i, /actual|observed|executed/i, /Git preflight/i,
    /without.*CLI|CLI is unavailable|skills-only/i, /approval/i,
    /fake|fabricate|never pretend/i, /exemption|unavailable/i, /showdar-build/i]) {
    assert.match(doc + ref, word);
  }
  assert.match(ref, /missing behavior|expected behavioral assertion/);
  assert.match(ref, /before.*production edit/i);
  assert.match(ref, /after.*REFACTOR|REFACTOR[\s\S]*run/i);
});

test('plan and build cross-reference TDD while Test keeps strategy ownership', async () => {
  for (const id of ['showdar-plan', 'showdar-build', 'showdar-test', 'showdar-feature', 'showdar-recover']) {
    const text = await skill(id);
    assert.match(text, /showdar-tdd|TDD|RED.*GREEN.*REFACTOR/i, id);
  }
  const plan = await skill('showdar-plan');
  const brainstorm = await skill('showdar-brainstorm');
  const feature = await skill('showdar-feature');
  assert.match(plan, /docs\/showdar\/plans\/<feature>\.md/);
  assert.match(brainstorm, /docs\/showdar\/specs/);
  assert.match(feature, /docs\/showdar\/specs/);
  assert.match(feature, /not a new candidate stage|not a new.*stage/i);
});

test('installer ships standalone native TDD references without creating project plan docs', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'showdar-tdd-install-'));
  const project = path.join(tmp, 'project');
  const home = path.join(tmp, 'home');
  try {
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    await initProject({ projectRoot: project, homeRoot: home, packageRoot: root,
      profile: 'developer', ai: 'cursor', skillIds: resolveProfile('developer'), packageVersion: '0.17.0' });
    for (const rel of [
      '.cursor/skills/showdar-tdd/SKILL.md',
      '.cursor/skills/showdar-tdd/references/red-green-refactor.md',
      '.cursor/skills/showdar-tdd/examples/behavior-change.md'
    ]) await access(path.join(project, rel));
    assert.equal((await inspectProject(project, { homeRoot: home })).healthy, true);
    await assert.rejects(access(path.join(project, 'docs/showdar/plans')));
    await assert.rejects(access(path.join(project, 'docs/showdar/specs')));
  } finally { await rm(tmp, { recursive:true, force:true }); }
});

test('single-skill tdd add preserves existing selection and does not overwrite unrelated files', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'showdar-tdd-add-'));
  const project = path.join(tmp, 'project');
  const home = path.join(tmp, 'home');
  try {
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    await initProject({ projectRoot: project, homeRoot: home, packageRoot: root,
      profile: 'minimal', ai: 'cursor', skillIds: ['showdar-build'], packageVersion: '0.17.0' });
    const added = await addSkill({ cwd: project, home, packageRoot: root, skill:'tdd', packageVersion:'0.17.0' });
    assert.equal(added.skill, 'showdar-tdd');
    await access(path.join(project, '.cursor/skills/showdar-tdd/SKILL.md'));
    await access(path.join(project, '.cursor/skills/showdar-build/SKILL.md'));
    assert.equal((await inspectProject(project, { homeRoot: home })).healthy, true);
  } finally { await rm(tmp, { recursive:true, force:true }); }
});
