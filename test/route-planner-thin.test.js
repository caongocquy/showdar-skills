import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutePlan } from '../src/route-plan.js';

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
