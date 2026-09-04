import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_TARGETS, PROFILE_ALIASES, PROFILES, SKILLS, canonicalProfile, resolveProfile } from '../src/catalog.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_SKILLS = [
  'showdar-understand',
  'showdar-plan',
  'showdar-design',
  'showdar-build',
  'showdar-debug',
  'showdar-test',
  'showdar-review',
  'showdar-upgrade',
  'showdar-ship',
  'showdar-recover',
  'showdar-git',
  'showdar-requirements',
  'showdar-quality',
  'showdar-security',
  'showdar-ops',
];

test('catalog contains exactly fifteen first-class skills', () => {
  assert.deepEqual(SKILLS.map((skill) => skill.id), EXPECTED_SKILLS);
  assert.ok(SKILLS.every((skill) => skill.description?.length >= 30));
});

test('discovery descriptions are trigger-only and synchronized with native metadata', async () => {
  for (const skill of SKILLS) {
    const text = await readFile(path.join(repoRoot, 'skills', skill.id, 'SKILL.md'), 'utf8');
    const native = text.match(/^description:\s*(.+)$/m)?.[1];
    assert.ok(native, `${skill.id} should have a native discovery description`);
    assert.match(native, /^Use when /, `${skill.id} should describe a trigger, not a workflow`);
    assert.equal(skill.description, native, `${skill.id} catalog/native descriptions drifted`);
  }
  assert.doesNotMatch(SKILLS.find(({ id }) => id === 'showdar-review').description, /\bsecurity\b/i);
});

test('skill ids are unique and showdar-prefixed', () => {
  const ids = SKILLS.map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith('showdar-')));
});

test('supported AI targets include native and universal modes', () => {
  assert.deepEqual(AI_TARGETS, ['codex', 'opencode', 'claude', 'universal', 'all']);
});

test('full profile resolves every skill exactly once', () => {
  assert.deepEqual(resolveProfile('full'), EXPECTED_SKILLS);
});

test('legacy mobile and web profiles resolve to the developer profile', () => {
  assert.deepEqual(PROFILE_ALIASES, { mobile: 'developer', web: 'developer' });
  assert.equal(canonicalProfile('mobile'), 'developer');
  assert.equal(canonicalProfile('web'), 'developer');
  assert.deepEqual(resolveProfile('mobile'), resolveProfile('developer'));
  assert.deepEqual(resolveProfile('web'), resolveProfile('developer'));
});

test('profiles represent role-oriented skill bundles', () => {
  assert.deepEqual(Object.keys(PROFILES), ['minimal', 'developer', 'backend', 'qa', 'product', 'full']);
  assert.equal(PROFILES.minimal.length, 8);
  assert.equal(PROFILES.developer.length, 12);
  assert.equal(PROFILES.backend.length, 14);
  assert.equal(PROFILES.qa.length, 9);
  assert.equal(PROFILES.product.length, 6);
  assert.equal(PROFILES.full.length, 15);
  for (const profile of ['minimal', 'developer', 'backend', 'qa', 'full']) {
    assert.ok(PROFILES[profile].includes('showdar-git'));
  }
  assert.ok(PROFILES.backend.includes('showdar-requirements'));
  assert.ok(PROFILES.backend.includes('showdar-quality'));
  assert.ok(PROFILES.developer.includes('showdar-security'));
  assert.ok(PROFILES.backend.includes('showdar-security'));
  assert.ok(PROFILES.backend.includes('showdar-ops'));
  assert.ok(!PROFILES.developer.includes('showdar-ops'));
  assert.deepEqual(PROFILES.qa, [
    'showdar-understand', 'showdar-requirements', 'showdar-quality', 'showdar-test',
    'showdar-debug', 'showdar-review', 'showdar-ship', 'showdar-recover', 'showdar-git',
  ]);
  assert.deepEqual(PROFILES.product, [
    'showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design',
    'showdar-quality', 'showdar-review',
  ]);
});

test('every profile references known skills without duplicates', () => {
  const known = new Set(EXPECTED_SKILLS);
  for (const [profile, ids] of Object.entries(PROFILES)) {
    assert.ok(ids.length > 0, `${profile} should not be empty`);
    assert.equal(new Set(ids).size, ids.length, `${profile} contains duplicates`);
    assert.ok(ids.every((id) => known.has(id)), `${profile} references an unknown skill`);
  }
});

test('unknown profile throws a useful error', () => {
  assert.throws(() => resolveProfile('nope'), /Unknown profile "nope"/);
});
