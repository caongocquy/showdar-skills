import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TARGETS, PROFILE_ALIASES, PROFILES, SKILLS, canonicalProfile, resolveProfile } from '../src/catalog.js';

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
];

test('catalog contains exactly the eleven flagship skills', () => {
  assert.deepEqual(SKILLS.map((skill) => skill.id), EXPECTED_SKILLS);
  assert.ok(SKILLS.every((skill) => skill.description?.length >= 30));
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

test('legacy mobile and web profiles resolve to canonical full', () => {
  assert.deepEqual(PROFILE_ALIASES, { mobile: 'full', web: 'full' });
  assert.equal(canonicalProfile('mobile'), 'full');
  assert.equal(canonicalProfile('web'), 'full');
  assert.deepEqual(resolveProfile('mobile'), EXPECTED_SKILLS);
  assert.deepEqual(resolveProfile('web'), EXPECTED_SKILLS);
});

test('profiles represent distinct skill bundles', () => {
  assert.deepEqual(Object.keys(PROFILES), ['minimal', 'backend', 'full']);
  assert.ok(PROFILES.minimal.length < PROFILES.backend.length);
  assert.ok(PROFILES.backend.length < PROFILES.full.length);
  assert.ok(PROFILES.minimal.includes('showdar-git'));
  assert.ok(PROFILES.backend.includes('showdar-git'));
  assert.ok(PROFILES.full.includes('showdar-git'));
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
