import assert from 'node:assert/strict';
import test from 'node:test';
import { CAPABILITIES, validateCapabilities } from '../src/capabilities.js';
import { rankCapabilities } from '../src/capability-score.js';
import { buildRoutePlan } from '../src/route-plan.js';
import { normalizeIntent, validateIntent } from '../src/intent.js';

function intent(overrides = {}) {
  return {
    phase: 'implementation',
    action: 'implement',
    object: 'api',
    secondaryActions: [],
    risks: [],
    mutation: 'local-write',
    evidence: { rootCauseKnown: null, behaviorDefined: null, failureObserved: null },
    ...overrides,
  };
}

function skills(plan) {
  return plan.advisors.map(({ skill }) => skill);
}

test('normalizes secondary actions and keeps Phase 1 intents backward-compatible', () => {
  const oldIntent = intent({ secondaryActions: undefined });
  assert.deepEqual(normalizeIntent({ ...oldIntent, secondaryActions: [' Test ', 'test', 'security'] }).secondaryActions, ['security', 'test']);
  assert.deepEqual(buildRoutePlan(oldIntent), buildRoutePlan(intent()));
  assert.equal(validateIntent({ ...oldIntent, secondaryActions: 'test' }).ok, false);
  assert.equal(validateIntent({ ...oldIntent, secondaryActions: [''] }).ok, false);
  assert.equal(validateIntent({ ...oldIntent, secondaryActions: [1] }).ok, false);
});

test('selects primary from the Phase 1 scorer with evidence-aware debug/build ownership', () => {
  const unknownFailure = buildRoutePlan(intent({
    phase: 'diagnosis', action: 'fix', object: 'runtime', risks: ['regression'], mutation: 'read-only',
    evidence: { failureObserved: true, rootCauseKnown: false },
  }));
  assert.equal(unknownFailure.primary.skill, 'showdar-debug');
  assert.match(unknownFailure.primary.reasons.join('\n'), /evidence/);

  const knownCause = buildRoutePlan(intent({
    phase: 'implementation', action: 'fix', object: 'auth', risks: ['regression'],
    evidence: { failureObserved: true, rootCauseKnown: true, behaviorDefined: true },
  }));
  assert.equal(knownCause.primary.skill, 'showdar-build');
  assert.ok(knownCause.primary.reasons.some((reason) => reason.includes('known cause')));
});

test('behavior-defined evidence favors build and undefined behavior favors requirements', () => {
  const build = buildRoutePlan(intent({ phase: 'implementation', action: 'implement', object: 'backend', evidence: { behaviorDefined: true } }));
  assert.equal(build.primary.skill, 'showdar-build');

  const requirements = buildRoutePlan(intent({ phase: 'definition', action: 'define', object: 'backend', mutation: 'read-only', evidence: { behaviorDefined: false } }));
  assert.equal(requirements.primary.skill, 'showdar-requirements');
  assert.ok(requirements.primary.reasons.some((reason) => reason.includes('behaviorDefined')));
});

test('advisors require explicit orthogonal signals and are capped at two', () => {
  const plan = buildRoutePlan(intent({
    secondaryActions: ['security', 'test', 'quality', 'review'],
    risks: ['security'],
    evidence: { behaviorDefined: true },
  }));
  assert.equal(plan.primary.skill, 'showdar-build');
  assert.equal(plan.advisors.length, 2);
  assert.deepEqual(skills(plan), ['showdar-security', 'showdar-test']);
  assert.ok(plan.advisors.every((advisor) => advisor.reasons.some((reason) => reason.includes('secondary action') || reason.includes('explicit security'))));

  const noSignals = buildRoutePlan(intent({ risks: [] }));
  assert.deepEqual(noSignals.advisors, []);
});

test('a runner-up is not an advisor without a routing signal', () => {
  const plan = buildRoutePlan(intent({ phase: 'implementation', action: 'implement', object: 'api' }));
  assert.equal(plan.primary.skill, 'showdar-build');
  assert.deepEqual(plan.advisors, []);
});

test('specialization boundaries remain deterministic', () => {
  const cases = [
    [{ phase: 'verification', action: 'assess', object: 'auth', risks: ['security'], mutation: 'read-only' }, 'showdar-security'],
    [{ phase: 'verification', action: 'test', object: 'api', risks: ['regression'], mutation: 'local-write' }, 'showdar-test'],
    [{ phase: 'delivery', action: 'assess', object: 'release', mutation: 'read-only' }, 'showdar-ship'],
    [{ phase: 'operations', action: 'deploy', object: 'deployment', risks: ['operations'], mutation: 'remote-write' }, 'showdar-ops'],
    [{ phase: 'implementation', action: 'upgrade', object: 'dependency', risks: ['compatibility'], mutation: 'local-write' }, 'showdar-upgrade'],
    [{ phase: 'repository', action: 'git', object: 'commit', mutation: 'local-write' }, 'showdar-git'],
    [{ phase: 'recovery', action: 'recover', object: 'implementation', mutation: 'local-write' }, 'showdar-recover'],
  ];
  for (const [overrides, expected] of cases) assert.equal(buildRoutePlan(intent(overrides)).primary.skill, expected);

  const explicitSecurity = buildRoutePlan(intent({
    phase: 'verification', action: 'assess', object: 'architecture', risks: ['security'], mutation: 'read-only',
  }));
  assert.equal(explicitSecurity.primary.skill, 'showdar-security');
  assert.ok(explicitSecurity.confidence.decisive);
});

test('advisors derive from explicit secondaryActions only, not risks', () => {
  // Risk alone does NOT create an advisor
  const securityRiskOnly = buildRoutePlan(intent({ risks: ['security'], object: 'api' }));
  assert.deepEqual(skills(securityRiskOnly), []);

  // secondaryActions: ['upgrade'] creates upgrade advisor
  const regressionAfterUpgrade = buildRoutePlan(intent({
    phase: 'diagnosis', action: 'investigate', object: 'runtime', risks: ['compatibility'],
    secondaryActions: ['upgrade'], mutation: 'read-only',
    evidence: { failureObserved: true, rootCauseKnown: false },
  }));
  assert.equal(regressionAfterUpgrade.primary.skill, 'showdar-debug');
  assert.deepEqual(skills(regressionAfterUpgrade), ['showdar-upgrade']);

  // secondaryActions: ['release'] creates ship advisor
  const deploymentWithRelease = buildRoutePlan(intent({
    phase: 'operations', action: 'deploy', object: 'deployment', risks: ['operations'],
    secondaryActions: ['release'], mutation: 'remote-write',
  }));
  assert.equal(deploymentWithRelease.primary.skill, 'showdar-ops');
  assert.deepEqual(skills(deploymentWithRelease), ['showdar-ship']);
});

test('confidence exposes deterministic margin and low confidence for a tie', () => {
  const clear = buildRoutePlan(intent({ phase: 'operations', action: 'deploy', object: 'deployment', mutation: 'remote-write' }));
  assert.equal(clear.confidence.level, 'high');
  assert.equal(typeof clear.confidence.margin, 'number');

  // Phase 6E: (verification, review) is decisively review-owned via the
  // explicit-review rule, so the tie fixture moves to a still-ambiguous
  // intent (discovery, assess) with no decisive rule.
  const tie = buildRoutePlan(intent({ phase: 'discovery', action: 'assess', object: 'repository', mutation: 'read-only' }));
  assert.equal(tie.confidence.level, 'low');
  assert.equal(tie.confidence.margin, 0);
});

test('explicit review is decisively review-owned', () => {
  const review = buildRoutePlan(intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' }));
  assert.equal(review.primary.skill, 'showdar-review');
  assert.equal(review.confidence.level, 'high');
});

test('taxonomy and route ordering do not depend on capability declaration order', () => {
  assert.equal(validateCapabilities().ok, true);
  const sourceOrder = buildRoutePlan(intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' }));
  const reversed = buildRoutePlan(intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' }), [...CAPABILITIES].reverse());
  assert.deepEqual(reversed, sourceOrder);
  assert.deepEqual(rankCapabilities(intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' }), [...CAPABILITIES].reverse()).map(({ skill }) => skill), rankCapabilities(intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' })).map(({ skill }) => skill));
});
