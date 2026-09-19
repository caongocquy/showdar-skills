import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThinRoutePlan } from '../src/route-plan.js';

// 6G-native thin route coverage (T17): primaryCapability -> CAPABILITY_TO_SKILL.
// No scoring, no prompt parsing, no risk/object ownership. Replaces the
// T16-deleted route-planner-thin tests with 6G-only assertions.

function intent(overrides = {}) {
  return {
    phase: 'implementation',
    action: 'implement',
    object: 'api',
    secondaryActions: [],
    risks: [],
    mutation: 'read-only',
    evidence: {},
    ...overrides,
  };
}

const CAPABILITY_TO_SKILL = Object.freeze({
  understand: 'showdar-understand',
  requirements: 'showdar-requirements',
  plan: 'showdar-plan',
  design: 'showdar-design',
  implement: 'showdar-build',
  debug: 'showdar-debug',
  test: 'showdar-test',
  review: 'showdar-review',
  quality: 'showdar-quality',
  'security-assessment': 'showdar-security',
  upgrade: 'showdar-upgrade',
  ship: 'showdar-ship',
  ops: 'showdar-ops',
  recover: 'showdar-recover',
  git: 'showdar-git',
});

test('thin route maps every supported capability to its skill', () => {
  for (const [capability, skill] of Object.entries(CAPABILITY_TO_SKILL)) {
    const plan = buildThinRoutePlan(intent(), { primaryCapability: capability });
    assert.equal(plan.primary.skill, skill, `capability ${capability}`);
  }
});

test('thin route maps secondaryActions to advisors, primary excluded, max 2', () => {
  // normalizeIntent sorts secondaryActions; advisors take the first two
  // non-primary entries in that order.
  const plan = buildThinRoutePlan(
    intent({ secondaryActions: ['test', 'security', 'review'] }),
    { primaryCapability: 'implement' },
  );
  assert.equal(plan.primary.skill, 'showdar-build');
  assert.deepEqual(plan.advisors, ['showdar-review', 'showdar-security']);
});

test('thin route excludes primary skill from advisors', () => {
  const plan = buildThinRoutePlan(
    intent({ secondaryActions: ['test'] }),
    { primaryCapability: 'test' },
  );
  assert.equal(plan.primary.skill, 'showdar-test');
  assert.deepEqual(plan.advisors, []);
});

test('thin route ignores risks, object, and evidence', () => {
  const base = buildThinRoutePlan(intent(), { primaryCapability: 'review' });
  const withRisks = buildThinRoutePlan(
    intent({ risks: ['security'], object: 'auth', evidence: { failureObserved: true } }),
    { primaryCapability: 'review' },
  );
  assert.deepEqual(withRisks, base);
});

test('thin route throws on missing capability', () => {
  assert.throws(() => buildThinRoutePlan(intent(), {}), /valid primaryCapability/);
});

test('thin route throws on unknown capability', () => {
  assert.throws(
    () => buildThinRoutePlan(intent(), { primaryCapability: 'deploy' }),
    /valid primaryCapability/,
  );
});

test('thin route throws on non-string capability', () => {
  assert.throws(() => buildThinRoutePlan(intent(), { primaryCapability: 42 }), /valid primaryCapability/);
});
