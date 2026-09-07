import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_KEYS,
  INTENT_PHASES,
  MUTATION_CLASSES,
  RISK_CAPABILITIES,
  normalizeIntent,
  validateIntent,
} from '../src/intent.js';
import {
  CAPABILITIES,
  getCapability,
  validateCapabilities,
} from '../src/capabilities.js';
import { rankCapabilities, scoreIntent } from '../src/capability-score.js';

const allSkills = CAPABILITIES.map(({ skill }) => skill);

test('intent model normalizes supported values and marks unspecified evidence', () => {
  assert.deepEqual(normalizeIntent({
    phase: 'Diagnosis',
    action: 'investigate intermittent',
    object: 'login failure',
    risks: ['Regression', 'regression'],
    mutation: 'read only',
  }), {
    phase: 'diagnosis',
    action: 'investigate-intermittent',
    secondaryActions: [],
    object: 'login-failure',
    risks: ['regression'],
    mutation: 'read-only',
    evidence: {
      rootCauseKnown: null,
      behaviorDefined: null,
      failureObserved: null,
    },
  });
});

test('intent validation rejects invalid phase, risk, mutation, and evidence', () => {
  const result = validateIntent({
    phase: 'shipping',
    action: 'release',
    object: 'package',
    risks: ['unknown-risk'],
    mutation: 'remote',
    evidence: { failureObserved: 'yes', extra: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('phase')));
  assert.ok(result.errors.some((error) => error.includes('risk')));
  assert.ok(result.errors.some((error) => error.includes('mutation')));
  assert.ok(result.errors.some((error) => error.includes('evidence')));
  assert.deepEqual(INTENT_PHASES, [
    'discovery', 'definition', 'planning', 'design', 'implementation',
    'diagnosis', 'verification', 'delivery', 'operations', 'recovery', 'repository',
  ]);
  assert.deepEqual(MUTATION_CLASSES, ['read-only', 'local-write', 'remote-write', 'production-impacting']);
  assert.deepEqual(RISK_CAPABILITIES, ['security', 'compatibility', 'regression', 'data-integrity', 'production', 'performance', 'operations']);
  assert.deepEqual(EVIDENCE_KEYS, ['rootCauseKnown', 'behaviorDefined', 'failureObserved']);
});

test('the canonical taxonomy covers every catalog skill exactly once', () => {
  const result = validateCapabilities();
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(new Set(allSkills).size, 15);
});

test('taxonomy validation catches missing, unknown, invalid, duplicate, and malformed entries', () => {
  const malformed = [
    { skill: 'showdar-debug', phases: ['not-a-phase'], actions: ['investigate', 'investigate'], objects: ['runtime'], risks: ['regression'], mutations: ['not-a-mutation'] },
    { skill: 'showdar-not-real', phases: ['diagnosis'], actions: ['investigate'], objects: ['runtime'], risks: ['regression'], mutations: ['read-only'] },
    { skill: 'showdar-build', phases: 'implementation', actions: ['implement'], objects: ['repository'], risks: ['regression'], mutations: ['local-write'] },
  ];
  const result = validateCapabilities(malformed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('missing capability entry')));
  assert.ok(result.errors.some((error) => error.includes('nonexistent skill')));
  assert.ok(result.errors.some((error) => error.includes('invalid phase')));
  assert.ok(result.errors.some((error) => error.includes('invalid mutation')));
  assert.ok(result.errors.some((error) => error.includes('duplicates')));
  assert.ok(result.errors.some((error) => error.includes('must be an array')));
});

test('taxonomy validation checks evidence preference shape and values', () => {
  const result = validateCapabilities([
    { skill: 'showdar-debug', phases: ['diagnosis'], evidence: { prefer: { failureObserved: 'yes' }, unknown: {} } },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unknown section')));
  assert.ok(result.errors.some((error) => error.includes('must be boolean')));
});

test('unknown action and object values produce a deterministic explainable score', () => {
  const intent = normalizeIntent({ phase: 'diagnosis', action: 'investigate', object: 'quantum-device', mutation: 'read-only' });
  const first = scoreIntent(intent, getCapability('showdar-debug'));
  const second = scoreIntent(intent, getCapability('showdar-debug'));
  assert.deepEqual(first, second);
  assert.equal(first.skill, 'showdar-debug');
  assert.ok(first.matched.includes('phase:diagnosis'));
  assert.ok(first.matched.includes('action:investigate'));
  assert.ok(first.unmatched.includes('object:quantum-device'));
  assert.ok(first.reasons.length > 0);
});

test('evidence routes observed unknown failures to debug', () => {
  const intent = normalizeIntent({
    phase: 'diagnosis', action: 'investigate', object: 'auth', risks: ['regression'], mutation: 'read-only',
    evidence: { failureObserved: true, rootCauseKnown: false },
  });
  const debug = scoreIntent(intent, getCapability('showdar-debug'));
  const build = scoreIntent(intent, getCapability('showdar-build'));
  assert.ok(debug.score > build.score);
  assert.ok(debug.matched.includes('evidence:failureObserved=true'));
  assert.ok(debug.matched.includes('evidence:rootCauseKnown=false'));
  assert.ok(debug.reasons.some((reason) => reason.includes('evidence')));
});

test('evidence routes a defined known-root-cause implementation to build', () => {
  const intent = normalizeIntent({
    phase: 'implementation', action: 'modify', object: 'api', risks: ['regression'], mutation: 'local-write',
    evidence: { failureObserved: true, rootCauseKnown: true, behaviorDefined: true },
  });
  const build = scoreIntent(intent, getCapability('showdar-build'));
  const debug = scoreIntent(intent, getCapability('showdar-debug'));
  assert.ok(build.score > debug.score);
  assert.ok(build.matched.includes('evidence:behaviorDefined=true'));
  assert.ok(build.matched.includes('evidence:rootCauseKnown=true'));
  assert.ok(debug.unmatched.includes('evidence:rootCauseKnown=true'));
  assert.ok(debug.reasons.some((reason) => reason.includes('mismatch') || reason.includes('de-emphasized')));
});

test('undefined behavior gives requirements an evidence preference for definition work', () => {
  const intent = normalizeIntent({
    phase: 'definition', action: 'define', object: 'api', mutation: 'read-only',
    evidence: { behaviorDefined: false },
  });
  const requirements = scoreIntent(intent, getCapability('showdar-requirements'));
  const plan = scoreIntent(intent, getCapability('showdar-plan'));
  assert.ok(requirements.score > plan.score);
  assert.ok(requirements.matched.includes('evidence:behaviorDefined=false'));
});

test('unspecified evidence produces an explainable neutral result', () => {
  const intent = normalizeIntent({ phase: 'diagnosis', action: 'investigate', object: 'auth', mutation: 'read-only' });
  const result = scoreIntent(intent, getCapability('showdar-debug'));
  assert.ok(result.reasons.some((reason) => reason.includes('unspecified')));
  assert.ok(!result.matched.some((value) => value.startsWith('evidence:')));
  assert.ok(!result.unmatched.some((value) => value.startsWith('evidence:')));
});

test('risk ownership stays narrow and mutation compatibility follows primary authority', () => {
  assert.deepEqual(getCapability('showdar-understand').risks, []);
  assert.deepEqual(getCapability('showdar-review').risks, ['regression']);
  assert.deepEqual(getCapability('showdar-build').risks, ['regression', 'performance', 'data-integrity']);
  assert.deepEqual(getCapability('showdar-security').mutations, ['read-only']);
  assert.deepEqual(getCapability('showdar-ship').mutations, ['read-only']);
  assert.deepEqual(getCapability('showdar-ops').mutations, ['local-write', 'remote-write', 'production-impacting']);
  assert.deepEqual(getCapability('showdar-git').mutations, ['read-only', 'local-write', 'remote-write']);
});

test('representative intents rank their specialist capabilities first', () => {
  const cases = [
    [{ phase: 'diagnosis', action: 'investigate', object: 'auth', risks: ['regression'], mutation: 'read-only' }, 'showdar-debug'],
    [{ phase: 'verification', action: 'assess', object: 'auth', risks: ['security'], mutation: 'read-only' }, 'showdar-security'],
    [{ phase: 'implementation', action: 'upgrade', object: 'dependency', risks: ['compatibility'], mutation: 'local-write' }, 'showdar-upgrade'],
    [{ phase: 'delivery', action: 'release', object: 'package', risks: ['production'], mutation: 'read-only' }, 'showdar-ship'],
    [{ phase: 'operations', action: 'deploy', object: 'container', risks: ['operations'], mutation: 'remote-write' }, 'showdar-ops'],
    [{ phase: 'recovery', action: 'recover', object: 'repository', risks: ['data-integrity'], mutation: 'local-write' }, 'showdar-recover'],
    [{ phase: 'repository', action: 'git', object: 'repository', risks: ['data-integrity'], mutation: 'local-write' }, 'showdar-git'],
  ];
  for (const [input, expectedSkill] of cases) {
    assert.equal(rankCapabilities(input)[0].skill, expectedSkill, expectedSkill);
  }
});

test('capability ranking uses lexical skill id order on equal scores', () => {
  const intent = normalizeIntent({ phase: 'diagnosis', action: 'investigate', object: 'runtime', mutation: 'read-only' });
  const capabilities = [
    { skill: 'zeta', phases: ['diagnosis'], actions: ['investigate'], objects: ['runtime'], mutations: ['read-only'] },
    { skill: 'alpha', phases: ['diagnosis'], actions: ['investigate'], objects: ['runtime'], mutations: ['read-only'] },
  ];
  const first = rankCapabilities(intent, capabilities);
  const second = rankCapabilities(intent, capabilities);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ skill }) => skill), ['alpha', 'zeta']);
});
