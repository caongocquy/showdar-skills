import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS } from '../src/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function skillText(id) {
  return readFile(path.join(root, 'skills', id, 'SKILL.md'), 'utf8');
}

test('requirements skill is first-class and protects evidence boundaries', async () => {
  assert.ok(SKILLS.some((skill) => skill.id === 'showdar-requirements'));
  const text = await skillText('showdar-requirements');
  for (const phrase of [
    'separate facts from assumptions', 'do not invent business rules', 'open questions',
    'acceptance criteria', 'happy path', 'negative flows', 'boundary conditions',
    'business rules', 'traceability', 'implementation readiness',
  ]) assert.match(text.toLowerCase(), new RegExp(phrase));
  assert.match(text, /Given.*When.*Then/s);
  assert.match(text, /does not modify application code by default/i);
});

test('quality skill is first-class and keeps QA planning separate from test implementation', async () => {
  assert.ok(SKILLS.some((skill) => skill.id === 'showdar-quality'));
  const text = await skillText('showdar-quality');
  for (const phrase of [
    'what should be verified', 'risk-based', 'regression scope', 'test scenarios',
    'bug report', 'boundary testing', 'compatibility', 'offline', 'accessibility',
    'showdar-test', 'does not claim tests ran',
  ]) assert.match(text.toLowerCase(), new RegExp(phrase));
});

test('requirements and quality routing boundaries are explicit', async () => {
  const skillMap = await readFile(path.join(root, 'router/skill-map.yaml'), 'utf8');
  const conflicts = await readFile(path.join(root, 'router/conflicts.yaml'), 'utf8');
  assert.match(skillMap, /requirements:/);
  assert.match(skillMap, /skill: showdar-requirements/);
  assert.match(skillMap, /quality:/);
  assert.match(skillMap, /skill: showdar-quality/);
  assert.match(conflicts, /showdar-requirements/);
  assert.match(conflicts, /showdar-quality/);
  assert.match(conflicts, /showdar-test/);
  assert.match(conflicts, /showdar-plan/);
  assert.match(conflicts, /showdar-review/);
  assert.match(conflicts, /showdar-ship/);
});

test('requirements and quality OpenCode commands are native templates', async () => {
  for (const [command, skill] of [['requirements', 'showdar-requirements'], ['quality', 'showdar-quality']]) {
    const text = await readFile(path.join(root, 'commands/opencode/showdar', `${command}.md`), 'utf8');
    assert.match(text, /\$ARGUMENTS/);
    assert.match(text, new RegExp(skill));
  }
});

test('structured knowledge covers analysis and QA decision points', async () => {
  for (const id of ['showdar-requirements', 'showdar-quality']) {
    const index = JSON.parse(await readFile(path.join(root, 'skills', id, 'data/index.json'), 'utf8'));
    assert.equal(index.version, 1);
    assert.equal(index.skill, id);
    assert.ok(index.datasets.length >= 1);
  }
  const requirementsData = await readFile(path.join(root, 'skills/showdar-requirements/data/requirements-patterns.csv'), 'utf8');
  const qualityData = await readFile(path.join(root, 'skills/showdar-quality/data/quality-patterns.csv'), 'utf8');
  assert.match(requirementsData, /business-rule|ambiguity|flow-edge-cases|state-transition/i);
  assert.match(qualityData, /risk-based|platform-matrix|regression-scope|bug-reproduction/i);
});
