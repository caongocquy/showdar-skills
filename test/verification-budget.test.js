import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutePlan } from '../src/route-plan.js';
import {
  VERIFICATION_CHECKS,
  buildVerificationPlan,
  validateChangeMetadata,
  validateVerificationPlan,
} from '../src/verification-budget.js';

function intent(overrides = {}) {
  return {
    phase: 'implementation',
    action: 'implement',
    object: 'api',
    risks: [],
    mutation: 'local-write',
    evidence: { rootCauseKnown: null, behaviorDefined: null, failureObserved: null },
    ...overrides,
  };
}

test('small bounded local work receives a low verification budget', () => {
  const task = intent({ action: 'modify', object: 'repository', evidence: { rootCauseKnown: true, behaviorDefined: true } });
  const plan = buildVerificationPlan(task, buildRoutePlan(task), { scope: 'small', filesChangedEstimate: 1 });
  assert.equal(plan.budget, 'low');
  assert.deepEqual(plan.required, ['targeted-test']);
});

test('ordinary implementation receives a medium verification budget', () => {
  const task = intent({ evidence: { behaviorDefined: true } });
  const plan = buildVerificationPlan(task, buildRoutePlan(task), { scope: 'medium' });
  assert.equal(plan.budget, 'medium');
  assert.deepEqual(plan.required, ['targeted-test', 'relevant-suite']);
});

test('production impact is always high and includes deployment safety', () => {
  const task = intent({
    phase: 'operations', action: 'deploy', object: 'deployment',
    risks: ['production'], mutation: 'production-impacting',
  });
  const plan = buildVerificationPlan(task, buildRoutePlan(task));
  assert.equal(plan.budget, 'high');
  assert.ok(plan.required.includes('deployment-safety'));
  assert.ok(plan.escalations.some((reason) => reason.includes('production-impacting')));
});

test('data-integrity with mutation escalates to high', () => {
  const task = intent({ risks: ['data-integrity'], mutation: 'local-write' });
  assert.equal(buildVerificationPlan(task, buildRoutePlan(task)).budget, 'high');
});

test('compatibility risk with dependency-change metadata escalates upgrade work', () => {
  const task = intent({ action: 'modify', object: 'dependency', risks: ['compatibility'], mutation: 'local-write' });
  const route = buildRoutePlan(task);
  assert.equal(route.primary.skill, 'showdar-upgrade');
  assert.equal(buildVerificationPlan(task, route, { dependencyChange: true, scope: 'small' }).budget, 'high');
});

test('read-only security threat modeling is medium, not automatically high', () => {
  const task = intent({
    phase: 'discovery', action: 'assess', object: 'auth', risks: ['security'], mutation: 'read-only',
  });
  const plan = buildVerificationPlan(task, buildRoutePlan(task));
  assert.equal(plan.budget, 'medium');
  assert.ok(plan.required.includes('security'));
});

test('advisors do not escalate budget by themselves', () => {
  const task = intent({ secondaryActions: ['test'] });
  const route = buildRoutePlan(task);
  const plan = buildVerificationPlan(task, route, { scope: 'small' });
  assert.equal(route.primary.skill, 'showdar-build');
  assert.deepEqual(route.advisors.map(({ skill }) => skill), ['showdar-test']);
  assert.equal(plan.budget, 'low');

  const securityAdvisorOnly = buildVerificationPlan(task, {
    ...route,
    advisors: [{ skill: 'showdar-security', score: 0, reasons: ['test-only fixture'] }],
  }, { scope: 'medium' });
  assert.equal(securityAdvisorOnly.budget, 'medium');
});

test('low route confidence raises an otherwise low plan to medium', () => {
  const task = intent({ phase: 'verification', action: 'review', object: 'repository', risks: ['regression'], mutation: 'read-only' });
  const plan = buildVerificationPlan(task, buildRoutePlan(task), { scope: 'small' });
  assert.equal(plan.budget, 'medium');
  assert.ok(plan.escalations.some((reason) => reason.includes('route confidence')));
});

test('high-risk signals cannot be downgraded by high route confidence', () => {
  const task = intent({
    phase: 'operations', action: 'deploy', object: 'deployment',
    risks: ['operations'], mutation: 'production-impacting',
  });
  const route = { ...buildRoutePlan(task), confidence: { level: 'high', margin: 20, decisive: true } };
  assert.equal(buildVerificationPlan(task, route, { scope: 'small' }).budget, 'high');
});

test('validation rejects unknown checks and malformed change metadata', () => {
  assert.equal(validateVerificationPlan({ budget: 'urgent', reasons: [], required: ['shell'], optional: [], escalations: [] }).ok, false);
  assert.equal(validateChangeMetadata({ scope: 'tiny' }).ok, false);
  assert.equal(validateChangeMetadata({ filesChangedEstimate: -1 }).ok, false);
  assert.equal(validateChangeMetadata({ crossBoundary: 'yes' }).ok, false);
  assert.ok(VERIFICATION_CHECKS.includes('deployment-safety'));
});

test('absent change metadata is backward-compatible and output is deterministic', () => {
  const task = intent({ phase: 'repository', action: 'git', object: 'commit', mutation: 'local-write' });
  const route = buildRoutePlan(task);
  assert.deepEqual(buildVerificationPlan(task, route), buildVerificationPlan(task, route, undefined));
  assert.deepEqual(buildVerificationPlan(task, route), buildVerificationPlan(task, route));
  assert.equal(buildVerificationPlan(task, route).budget, 'low');
});
