import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { buildRoutePlan } from '../src/route-plan.js';

// Phase 6D — Generalization Gap Repair (novel formulations; no Blind #3 wording).
// Rule 1: root-cause investigation language (unknown cause + diagnostic work).
// Rule 2: test-authoring language (authoring verb + test target).
// Rule 3: generic execution verb + governed capability target.

function resolve(prompt) {
  const resolution = resolveIntentFromPrompt(prompt);
  const plan = buildRoutePlan(resolution.intent);
  return {
    intent: resolution.intent,
    primary: plan.primary.skill,
    advisors: plan.advisors.map((a) => a.skill).sort(),
  };
}

// --- Rule 1: root-cause investigation → debug/diagnose, read-only ---

test('diagnostic: determine underlying reason for intermittent 504', () => {
  const r = resolve('Determine the underlying reason checkout intermittently returns 504.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic: trace what is causing worker stall', () => {
  const r = resolve('Trace what is causing the worker to stop consuming messages.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic: identify source of startup crash without changing code', () => {
  const r = resolve('Identify the source of the startup crash without changing code.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('known cause + requested repair stays build/fix, not debug', () => {
  const r = resolve('The root cause is confirmed in the auth guard; patch the token refresh.');
  assert.equal(r.intent.phase, 'implementation');
  assert.equal(r.intent.action, 'fix');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-build');
});

// --- Rule 2: test-authoring → verification/test, local-write ---

test('authoring: add unit coverage for token parser', () => {
  const r = resolve('Add unit coverage for the token parser.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-test');
});

test('authoring: write integration tests around invoice retries', () => {
  const r = resolve('Write integration tests around invoice retries.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-test');
});

test('authoring: create regression tests for cache invalidation', () => {
  const r = resolve('Create regression tests for cache invalidation behavior.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-test');
});

test('test noun in diagnostic question never grants test authority', () => {
  const r = resolve('Explain why the unit test suite is timing out.');
  assert.equal(r.intent.mutation, 'read-only');
  assert.notEqual(r.intent.action, 'test');
  assert.notEqual(r.primary, 'showdar-test');
  assert.deepEqual(r.intent.secondaryActions, []);
});

test('test noun with repair verb stays build/fix', () => {
  const r = resolve('Repair the handler that currently breaks the tests.');
  assert.equal(r.intent.action, 'fix');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-build');
});

test('test noun with review verb stays review, read-only', () => {
  const r = resolve('Review the existing integration tests.');
  assert.equal(r.intent.action, 'review');
  assert.equal(r.intent.mutation, 'read-only');
});

// --- Rule 3: generic verb + governed target → compositional secondary ---

test('implement + conduct security review → build primary, security secondary', () => {
  const r = resolve('Implement the fix and conduct a security review.');
  assert.equal(r.primary, 'showdar-build');
  assert.deepEqual(r.intent.secondaryActions, ['security']);
  assert.ok(r.advisors.includes('showdar-security'));
  assert.equal(r.intent.mutation, 'local-write');
});

test('upgrade + perform compatibility testing → upgrade primary, orthogonal secondary', () => {
  const r = resolve('Upgrade the client and perform compatibility testing.');
  assert.equal(r.primary, 'showdar-upgrade');
  assert.ok(r.intent.secondaryActions.length > 0);
  assert.ok(!r.intent.secondaryActions.includes('upgrade'));
  assert.equal(r.intent.mutation, 'local-write');
});

test('patch + carry out regression testing → build primary, test secondary', () => {
  const r = resolve('Patch the parser and carry out regression testing.');
  assert.equal(r.primary, 'showdar-build');
  assert.deepEqual(r.intent.secondaryActions, ['test']);
  assert.ok(r.advisors.includes('showdar-test'));
  assert.equal(r.intent.mutation, 'local-write');
});

test('weak-verb substring inside larger word grants nothing', () => {
  const r = resolve('Investigate the performance issue in the checkout flow.');
  assert.equal(r.primary, 'showdar-debug');
  assert.deepEqual(r.intent.secondaryActions, []);
});

test('log-reported secondary work grants no authority', () => {
  const r = resolve('Error: connection refused; the security assessment failed. Diagnose why the sync stalls.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.deepEqual(r.intent.secondaryActions, []);
});

test('quoted weak-verb phrase grants no authority', () => {
  const r = resolve('Explain what "perform security assessment" means before I run it.');
  assert.equal(r.intent.mutation, 'read-only');
  assert.deepEqual(r.intent.secondaryActions, []);
});

test('negated secondary work grants no advisor', () => {
  const r = resolve('Patch the parser but do not perform a security assessment.');
  assert.equal(r.primary, 'showdar-build');
  assert.deepEqual(r.intent.secondaryActions, []);
  assert.deepEqual(r.advisors, []);
});

test('context-only capability mention grants no secondary', () => {
  const r = resolve('The security assessment is scheduled for Friday; fix the login redirect.');
  assert.equal(r.intent.action, 'fix');
  assert.equal(r.intent.mutation, 'local-write');
  assert.deepEqual(r.intent.secondaryActions, []);
  assert.deepEqual(r.advisors, []);
});
