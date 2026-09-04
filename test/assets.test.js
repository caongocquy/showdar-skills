import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, SKILLS } from '../src/catalog.js';
import { validateSkillDirectory } from '../src/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const known = new Set(SKILLS.map((skill) => skill.id));
const commandMap = {
  understand: 'showdar-understand',
  plan: 'showdar-plan',
  design: 'showdar-design',
  build: 'showdar-build',
  debug: 'showdar-debug',
  test: 'showdar-test',
  review: 'showdar-review',
  upgrade: 'showdar-upgrade',
  ship: 'showdar-ship',
  recover: 'showdar-recover',
  git: 'showdar-git',
};

const legacyIds = [
  'showdar-repo-discovery','showdar-architecture-map','showdar-impact-analysis','showdar-feature-planning',
  'showdar-implementation-plan','showdar-change-surface','showdar-design-direction','showdar-ui-implementation',
  'showdar-visual-polish','showdar-accessibility-review','showdar-minimal-change','showdar-dependency-upgrade',
  'showdar-migration','showdar-systematic-debugging','showdar-evidence-first-debugging','showdar-regression-test',
  'showdar-code-review','showdar-release-readiness','showdar-post-deploy-verification','showdar-task-recovery',
];

test('every flagship skill is deep and passes the repository quality contract', async () => {
  for (const skill of SKILLS) {
    const dir = path.join(root, 'skills', skill.id);
    const text = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
    assert.match(text, new RegExp(`name: ${skill.id}`));
    assert.ok(text.split(/\r?\n/).length >= 120, `${skill.id} should be a substantial playbook`);
    const result = await validateSkillDirectory(dir);
    assert.deepEqual(result.errors, [], `${skill.id}: ${result.errors.join('; ')}`);
  }
});

test('OpenCode workflow commands map to flagship skills and accept arguments', async () => {
  for (const [command, skill] of Object.entries(commandMap)) {
    const file = path.join(root, 'commands', 'opencode', 'showdar', `${command}.md`);
    const text = await readFile(file, 'utf8');
    assert.match(text, /\$ARGUMENTS/);
    assert.match(text, new RegExp(skill));
  }
  const skillCommand = await readFile(path.join(root, 'commands', 'opencode', 'showdar', 'skill.md'), 'utf8');
  assert.match(skillCommand, /\$ARGUMENTS/);
  assert.match(skillCommand, /showdar-understand/);
  assert.match(skillCommand, /showdar-ship/);
});

test('profiles on disk match catalog profiles', async () => {
  for (const [name, expected] of Object.entries(PROFILES)) {
    const parsed = JSON.parse(await readFile(path.join(root, 'profiles', `${name}.json`), 'utf8'));
    assert.deepEqual(parsed.skills, expected, name);
  }
});

test('router and bundles reference only flagship skills', async () => {
  const files = [
    'router/skill-map.yaml', 'router/triggers.yaml', 'router/conflicts.yaml',
    'bundles/bugfix.yaml', 'bundles/feature.yaml', 'bundles/design.yaml', 'bundles/upgrade.yaml', 'bundles/release.yaml',
  ];
  for (const relative of files) {
    await access(path.join(root, relative));
    const text = await readFile(path.join(root, relative), 'utf8');
    for (const id of text.match(/showdar-[a-z-]+/g) ?? []) assert.ok(known.has(id), `${relative} references ${id}`);
    for (const legacy of legacyIds) assert.doesNotMatch(text, new RegExp(legacy), `${relative} still contains ${legacy}`);
  }
});
