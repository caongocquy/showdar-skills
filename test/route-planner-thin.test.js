import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutePlan, buildThinRoutePlan } from '../src/route-plan.js';

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

function frozen(intentOverrides, primary, advisors = []) {
  const plan = buildRoutePlan(intent(intentOverrides));
  assert.equal(plan.primary.skill, primary);
  assert.deepEqual(plan.advisors.map(({ skill }) => skill), advisors);
}

// Characterization of current buildRoutePlan behavior.
// The thin mapper (T17) must preserve these (phase, action, secondaryActions) → primary/advisors triples.

test('characterization: discovery/understand routes to understand', () => {
  frozen({ phase: 'discovery', action: 'understand', object: 'repository' }, 'showdar-understand');
});

test('characterization: implementation/implement+review routes to build with review advisor', () => {
  frozen(
    { phase: 'implementation', action: 'implement', object: 'api', mutation: 'local-write', secondaryActions: ['review'], evidence: { behaviorDefined: true, rootCauseKnown: true } },
    'showdar-build',
    ['showdar-review'],
  );
});

test('characterization: diagnosis/investigate routes to debug', () => {
  frozen(
    { phase: 'diagnosis', action: 'investigate', object: 'runtime', evidence: { failureObserved: true, rootCauseKnown: false } },
    'showdar-debug',
  );
});

test('characterization: verification/test routes to test', () => {
  frozen({ phase: 'verification', action: 'test', object: 'api', mutation: 'local-write' }, 'showdar-test');
});

test('characterization: verification/review routes to review', () => {
  frozen({ phase: 'verification', action: 'review', object: 'repository' }, 'showdar-review');
});

test('characterization: operations/deploy routes to ops', () => {
  frozen({ phase: 'operations', action: 'deploy', object: 'deployment', mutation: 'remote-write' }, 'showdar-ops');
});

test('characterization: delivery/assess routes to ship', () => {
  frozen({ phase: 'delivery', action: 'assess', object: 'release' }, 'showdar-ship');
});

test('characterization: recovery/recover routes to recover', () => {
  frozen({ phase: 'recovery', action: 'recover', object: 'repository', mutation: 'local-write' }, 'showdar-recover');
});

test('characterization: repository/git routes to git', () => {
  frozen({ phase: 'repository', action: 'git', object: 'repository', mutation: 'local-write' }, 'showdar-git');
});

test('characterization: implementation/upgrade routes to upgrade', () => {
  frozen({ phase: 'implementation', action: 'upgrade', object: 'dependency', mutation: 'local-write' }, 'showdar-upgrade');
});

test('characterization: discovery/assess with security risk routes to security', () => {
  frozen({ phase: 'discovery', action: 'assess', object: 'api', risks: ['security'] }, 'showdar-security');
});

// Thin-path equivalence tests (T17): buildThinRoutePlan must match characterization triples exactly.

function thinIntent(overrides = {}) {
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

function assertThinEquals(intentOverrides, expectedPrimary, expectedAdvisors = []) {
  const plan = buildThinRoutePlan(thinIntent(intentOverrides));
  assert.equal(plan.primary, expectedPrimary);
  assert.deepEqual(plan.advisors, expectedAdvisors);
}

test('thin-path: discovery/understand maps to understand', () => {
  assertThinEquals({ phase: 'discovery', action: 'understand', object: 'repository' }, 'showdar-understand');
});

test('thin-path: implementation/implement+review maps to build with review advisor', () => {
  assertThinEquals(
    { phase: 'implementation', action: 'implement', object: 'api', mutation: 'local-write', secondaryActions: ['review'], evidence: { behaviorDefined: true, rootCauseKnown: true } },
    'showdar-build',
    ['showdar-review'],
  );
});

test('thin-path: diagnosis/investigate maps to debug', () => {
  assertThinEquals(
    { phase: 'diagnosis', action: 'investigate', object: 'runtime', evidence: { failureObserved: true, rootCauseKnown: false } },
    'showdar-debug',
  );
});

test('thin-path: verification/test maps to test', () => {
  assertThinEquals({ phase: 'verification', action: 'test', object: 'api', mutation: 'local-write' }, 'showdar-test');
});

test('thin-path: verification/review maps to review', () => {
  assertThinEquals({ phase: 'verification', action: 'review', object: 'repository' }, 'showdar-review');
});

test('thin-path: operations/deploy maps to ops', () => {
  assertThinEquals({ phase: 'operations', action: 'deploy', object: 'deployment', mutation: 'remote-write' }, 'showdar-ops');
});

test('thin-path: delivery/assess maps to ship', () => {
  assertThinEquals({ phase: 'delivery', action: 'assess', object: 'release' }, 'showdar-ship');
});

test('thin-path: recovery/recover maps to recover', () => {
  assertThinEquals({ phase: 'recovery', action: 'recover', object: 'repository', mutation: 'local-write' }, 'showdar-recover');
});

test('thin-path: repository/git maps to git', () => {
  assertThinEquals({ phase: 'repository', action: 'git', object: 'repository', mutation: 'local-write' }, 'showdar-git');
});

test('thin-path: implementation/upgrade maps to upgrade', () => {
  assertThinEquals({ phase: 'implementation', action: 'upgrade', object: 'dependency', mutation: 'local-write' }, 'showdar-upgrade');
});

test('thin-path: discovery/assess with security risk maps to security', () => {
  assertThinEquals({ phase: 'discovery', action: 'assess', object: 'api', risks: ['security'] }, 'showdar-security');
});

// Legacy path untouched: spot-check that buildRoutePlan still produces characterization outputs.
test('legacy path unchanged: characterization outputs preserved', () => {
  frozen({ phase: 'discovery', action: 'understand', object: 'repository' }, 'showdar-understand');
  frozen({ phase: 'implementation', action: 'implement', object: 'api', mutation: 'local-write', secondaryActions: ['review'], evidence: { behaviorDefined: true, rootCauseKnown: true } }, 'showdar-build', ['showdar-review']);
  frozen({ phase: 'diagnosis', action: 'investigate', object: 'runtime', evidence: { failureObserved: true, rootCauseKnown: false } }, 'showdar-debug');
  frozen({ phase: 'verification', action: 'test', object: 'api', mutation: 'local-write' }, 'showdar-test');
  frozen({ phase: 'verification', action: 'review', object: 'repository' }, 'showdar-review');
  frozen({ phase: 'operations', action: 'deploy', object: 'deployment', mutation: 'remote-write' }, 'showdar-ops');
  frozen({ phase: 'delivery', action: 'assess', object: 'release' }, 'showdar-ship');
  frozen({ phase: 'recovery', action: 'recover', object: 'repository', mutation: 'local-write' }, 'showdar-recover');
  frozen({ phase: 'repository', action: 'git', object: 'repository', mutation: 'local-write' }, 'showdar-git');
  frozen({ phase: 'implementation', action: 'upgrade', object: 'dependency', mutation: 'local-write' }, 'showdar-upgrade');
  frozen({ phase: 'discovery', action: 'assess', object: 'api', risks: ['security'] }, 'showdar-security');
});
