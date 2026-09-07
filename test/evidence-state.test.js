import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
  STATE_STATUSES,
  EVIDENCE_KINDS,
  EVIDENCE_QUALITIES,
  DECISION_TYPES,
  createExecutionState,
  applyEvidence,
  addBlocker,
  removeBlocker,
  resolveDecision,
  getStopConditions,
  stateAPI,
  mapCheckToEvidence,
} from '../src/evidence-state.js';

const validIntent = {
  phase: 'implementation',
  action: 'implement',
  object: 'backend',
  risks: ['regression'],
  mutation: 'local-write',
  evidence: {},
};

const validRoutePlan = {
  primary: { skill: 'showdar-build', score: 100, reasons: [] },
  advisors: [],
  candidates: [],
  confidence: { level: 'high', margin: 10, decisive: true },
};

const validVerificationPlan = {
  budget: 'medium',
  reasons: ['test'],
  required: ['targeted-test', 'relevant-suite'],
  optional: [],
  escalations: [],
};

describe('Evidence State - State Creation', () => {
  it('createExecutionState with minimal options', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    assert.ok(result.ok);
    assert.strictEqual(result.value.primary, 'showdar-build');
    assert.strictEqual(result.value.status, 'active');
    assert.deepStrictEqual(result.value.evidence, []);
    assert.deepStrictEqual(result.value.blockers, []);
    assert.strictEqual(result.value.decision.type, 'continue');
  });

  it('createExecutionState with full options', () => {
    const result = createExecutionState({
      primary: 'showdar-debug',
      evidence: [{ kind: 'failure-reproduced', status: 'verified' }],
      blockers: [{ id: 'b1', reason: 'missing auth', type: 'authorization' }],
      verification: { completed: ['test1'], failed: [] },
      decision: { type: 'continue', target: null, reasons: [] },
    });
    assert.ok(result.ok);
    assert.strictEqual(result.value.primary, 'showdar-debug');
    assert.strictEqual(result.value.evidence.length, 1);
    assert.strictEqual(result.value.blockers.length, 1);
  });

  it('createExecutionState rejects invalid primary', () => {
    const result = createExecutionState({ primary: 'invalid-skill' });
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes('primary must be a valid skill id')));
  });

  it('createExecutionState rejects explicit status', () => {
    const result = createExecutionState({ primary: 'showdar-build', status: 'active' });
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes('status is derived from decision')));
  });

  it('createExecutionState rejects invalid evidence kind', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [{ kind: 'invalid-kind', status: 'verified' }],
    });
    assert.ok(!result.ok);
  });

  it('createExecutionState rejects invalid evidence quality', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [{ kind: 'failure-reproduced', status: 'invalid-quality' }],
    });
    assert.ok(!result.ok);
  });

  it('createExecutionState rejects invalid blocker', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      blockers: [{ id: '', reason: 'test' }],
    });
    assert.ok(!result.ok);
  });

  it('createExecutionState rejects invalid decision', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      decision: { type: 'handoff', target: null },
    });
    assert.ok(!result.ok);
  });
});

describe('Evidence State - applyEvidence', () => {
  let state;

  before(() => {
    const result = createExecutionState({ primary: 'showdar-build' });
    state = result.value;
  });

  it('adds new evidence entry', () => {
    const newState = applyEvidence(state, { kind: 'change-implemented', status: 'verified' });
    assert.strictEqual(newState.evidence.length, 1);
    assert.strictEqual(newState.evidence[0].kind, 'change-implemented');
    assert.strictEqual(newState.evidence[0].status, 'verified');
  });

  it('upserts evidence with higher quality status', () => {
    let s = applyEvidence(state, { kind: 'change-implemented', status: 'claimed' });
    s = applyEvidence(s, { kind: 'change-implemented', status: 'verified' });
    assert.strictEqual(s.evidence.length, 1);
    assert.strictEqual(s.evidence[0].status, 'verified');
  });

  it('keeps higher quality evidence when lower quality added later', () => {
    let s = applyEvidence(state, { kind: 'change-implemented', status: 'verified' });
    s = applyEvidence(s, { kind: 'change-implemented', status: 'claimed' });
    assert.strictEqual(s.evidence[0].status, 'verified');
  });

  it('preserves source and detail when new entry has no source/detail', () => {
    let s = applyEvidence(state, { kind: 'change-implemented', status: 'verified', source: 'test', detail: 'first' });
    s = applyEvidence(s, { kind: 'change-implemented', status: 'verified' });
    assert.strictEqual(s.evidence[0].source, 'test');
    assert.strictEqual(s.evidence[0].detail, 'first');
  });

  it('updates source and detail when new entry provides them', () => {
    let s = applyEvidence(state, { kind: 'change-implemented', status: 'verified', source: 'test', detail: 'first' });
    s = applyEvidence(s, { kind: 'change-implemented', status: 'verified', source: 'other', detail: 'second' });
    assert.strictEqual(s.evidence[0].source, 'other');
    assert.strictEqual(s.evidence[0].detail, 'second');
  });

  it('throws on invalid evidence', () => {
    assert.throws(() => applyEvidence(state, { kind: 'invalid' }));
  });
});

describe('Evidence State - addBlocker / removeBlocker', () => {
  let state;

  before(() => {
    const result = createExecutionState({ primary: 'showdar-build' });
    state = result.value;
  });

  it('adds blocker', () => {
    const newState = addBlocker(state, { id: 'b1', reason: 'missing auth', type: 'authorization' });
    assert.strictEqual(newState.blockers.length, 1);
    assert.strictEqual(newState.blockers[0].id, 'b1');
  });

  it('does not duplicate blocker with same id', () => {
    let s = addBlocker(state, { id: 'b1', reason: 'first', type: 'authorization' });
    s = addBlocker(s, { id: 'b1', reason: 'second', type: 'business-rule' });
    assert.strictEqual(s.blockers.length, 1);
    assert.strictEqual(s.blockers[0].reason, 'first');
  });

  it('removes blocker by id', () => {
    let s = addBlocker(state, { id: 'b1', reason: 'test', type: 'authorization' });
    s = removeBlocker(s, 'b1');
    assert.strictEqual(s.blockers.length, 0);
  });

  it('no-op when removing non-existent blocker', () => {
    const s = removeBlocker(state, 'nonexistent');
    assert.strictEqual(s.blockers.length, 0);
  });

  it('throws on invalid blocker', () => {
    assert.throws(() => addBlocker(state, { id: '', reason: '' }));
  });
});

describe('Evidence State - resolveDecision', () => {
  it('blocked when blockers exist', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      blockers: [{ id: 'b1', reason: 'missing auth', type: 'authorization' }],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'blocked');
    assert.strictEqual(final.status, 'blocked');
  });

  it('debug: failure reproduced + root cause proven + implementation needed -> handoff build', () => {
    const result = createExecutionState({
      primary: 'showdar-debug',
      evidence: [
        { kind: 'failure-reproduced', status: 'verified' },
        { kind: 'root-cause-proven', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'diagnosis', action: 'investigate', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-debug', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-build');
    assert.strictEqual(final.status, 'ready-for-handoff');
  });

  it('debug: failure reproduced + root cause proven + config fix only -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-debug',
      evidence: [
        { kind: 'failure-reproduced', status: 'verified' },
        { kind: 'root-cause-proven', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'diagnosis', action: 'investigate' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-debug', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
    assert.strictEqual(final.status, 'complete');
  });

  it('debug: failure reproduced + root cause proven + fix implemented + regression proof -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-debug',
      evidence: [
        { kind: 'failure-reproduced', status: 'verified' },
        { kind: 'root-cause-proven', status: 'verified' },
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'regression-proof-added', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'diagnosis', action: 'fix', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-debug', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
    assert.strictEqual(final.status, 'complete');
  });

  it('requirements: behavior defined + implementation requested -> handoff build', () => {
    const result = createExecutionState({
      primary: 'showdar-requirements',
      evidence: [{ kind: 'behavior-defined', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'definition', action: 'define', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-requirements', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-build');
  });

  it('requirements: behavior defined + plan requested -> handoff plan', () => {
    const result = createExecutionState({
      primary: 'showdar-requirements',
      evidence: [{ kind: 'behavior-defined', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'definition', action: 'plan', secondaryActions: ['plan'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-requirements', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-plan');
  });

  it('requirements: missing behavior -> blocked', () => {
    const result = createExecutionState({ primary: 'showdar-requirements' });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'definition', action: 'define' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-requirements', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'blocked');
  });

  it('plan: plan complete + implementation requested -> handoff build', () => {
    const result = createExecutionState({
      primary: 'showdar-plan',
      evidence: [{ kind: 'architecture-understood', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'planning', action: 'plan', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-plan', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-build');
  });

  it('build: change implemented + required verification satisfied -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
    assert.strictEqual(final.status, 'complete');
  });

  it('build: change implemented + required verification missing -> continue', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [{ kind: 'change-implemented', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'continue');
    assert.ok(final.decision.reasons.some((r) => r.includes('required verification evidence missing')));
  });

  it('build: explicit test handoff requested -> handoff test', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, secondaryActions: ['test'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-test');
  });

  it('security: finding confirmed + remediation requested -> handoff build', () => {
    const result = createExecutionState({
      primary: 'showdar-security',
      evidence: [{ kind: 'security-reviewed', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'verification', action: 'assess', object: 'auth', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-security', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-build');
  });

  it('security: finding confirmed + no remediation -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-security',
      evidence: [{ kind: 'security-reviewed', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'verification', action: 'assess', object: 'auth' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-security', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('quality: qa plan complete -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-quality',
      evidence: [{ kind: 'architecture-understood', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'verification', action: 'assess' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-quality', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['regression'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('test: tests implemented + required satisfied -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-test',
      evidence: [
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
        { kind: 'regression-proof-added', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'verification', action: 'test' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-test', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['targeted-test', 'relevant-suite', 'regression'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('ship: readiness + package verified -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-ship',
      evidence: [
        { kind: 'release-readiness-verified', status: 'verified' },
        { kind: 'package-verified', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'delivery', action: 'assess', object: 'release' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-ship', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['relevant-suite', 'release-readiness', 'package'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('ship: readiness incomplete -> continue', () => {
    const result = createExecutionState({
      primary: 'showdar-ship',
      evidence: [{ kind: 'package-verified', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'delivery', action: 'assess', object: 'release' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-ship', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['relevant-suite', 'release-readiness', 'package'] },
    });
    assert.strictEqual(final.decision.type, 'continue');
  });

  it('ops: deployment requested + no authorization -> blocked', () => {
    const result = createExecutionState({
      primary: 'showdar-ops',
      blockers: [{ id: 'auth', reason: 'missing auth', type: 'authorization' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'operations', action: 'deploy', object: 'deployment', risks: ['production'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-ops', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['relevant-suite', 'deployment-safety'] },
    });
    assert.strictEqual(final.decision.type, 'blocked');
  });

  it('ops: deployment verified -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-ops',
      evidence: [{ kind: 'deployment-verified', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'operations', action: 'deploy', object: 'deployment', risks: ['production'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-ops', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['relevant-suite', 'deployment-safety'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('ops: authorized deployment in progress -> continue', () => {
    const result = createExecutionState({ primary: 'showdar-ops' });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'operations', action: 'deploy', object: 'container', risks: ['operations'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-ops', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['relevant-suite', 'deployment-safety'] },
    });
    assert.strictEqual(final.decision.type, 'continue');
  });

  it('recover: context reconstructed -> handoff recovered owner', () => {
    const result = createExecutionState({
      primary: 'showdar-recover',
      evidence: [{ kind: 'architecture-understood', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'recovery', action: 'recover' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-recover', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
      recoveredOwner: 'showdar-build',
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.decision.target, 'showdar-build');
  });

  it('git: state verified -> complete', () => {
    const result = createExecutionState({
      primary: 'showdar-git',
      evidence: [{ kind: 'git-state-verified', status: 'verified' }],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'repository', action: 'git', object: 'commit' },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-git', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('advisor concern during build does NOT cause handoff', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
        { kind: 'security-reviewed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: {
        ...validRoutePlan,
        primary: { skill: 'showdar-build', score: 100, reasons: [] },
        advisors: [{ skill: 'showdar-security', score: 10, reasons: ['security concern'] }],
      },
      verificationPlan: { ...validVerificationPlan, required: ['targeted-test', 'relevant-suite', 'security'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
    assert.strictEqual(final.decision.target, null);
  });

  it('optional checks missing do not block completion', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['targeted-test'], optional: ['lint', 'typecheck'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('claimed evidence quality does not satisfy required checks', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'claimed' },
        { kind: 'targeted-tests-passed', status: 'claimed' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'continue');
  });

  it('observed evidence quality satisfies required checks', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'observed' },
        { kind: 'targeted-tests-passed', status: 'observed' },
        { kind: 'relevant-suite-passed', status: 'observed' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
  });

  it('throws when missing required context', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    assert.throws(() => resolveDecision(result.value, {}));
    assert.throws(() => resolveDecision(result.value, { intent: validIntent }));
    assert.throws(() => resolveDecision(result.value, { intent: validIntent, routePlan: validRoutePlan }));
  });
});

describe('Evidence State - getStopConditions', () => {
  it('returns stop conditions for each skill', () => {
    for (const skill of ['showdar-debug', 'showdar-requirements', 'showdar-plan', 'showdar-build', 'showdar-security', 'showdar-quality', 'showdar-test', 'showdar-ship', 'showdar-ops', 'showdar-recover', 'showdar-git', 'showdar-understand', 'showdar-design', 'showdar-upgrade', 'showdar-review']) {
      const conditions = getStopConditions(skill);
      assert.ok(Array.isArray(conditions));
      assert.ok(conditions.length > 0);
    }
  });

  it('returns empty array for unknown skill', () => {
    const conditions = getStopConditions('unknown-skill');
    assert.deepStrictEqual(conditions, []);
  });
});

describe('Evidence State - State Immutability', () => {
  it('applyEvidence returns new frozen object', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    const newState = applyEvidence(result.value, { kind: 'change-implemented', status: 'verified' });
    assert.notStrictEqual(newState, result.value);
    assert.ok(Object.isFrozen(newState));
    assert.ok(Object.isFrozen(newState.evidence));
  });

  it('addBlocker returns new frozen object', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    const newState = addBlocker(result.value, { id: 'b1', reason: 'test', type: 'authorization' });
    assert.notStrictEqual(newState, result.value);
    assert.ok(Object.isFrozen(newState.blockers));
  });

  it('resolveDecision returns new frozen object', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    const newState = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.notStrictEqual(newState, result.value);
    assert.ok(Object.isFrozen(newState.decision));
  });
});

describe('Evidence State - Constants', () => {
  it('STATE_STATUSES contains expected values (no verified)', () => {
    assert.deepStrictEqual(STATE_STATUSES, ['active', 'blocked', 'ready-for-handoff', 'complete']);
  });

  it('EVIDENCE_KINDS contains expected values', () => {
    assert.ok(EVIDENCE_KINDS.includes('behavior-defined'));
    assert.ok(EVIDENCE_KINDS.includes('failure-reproduced'));
    assert.ok(EVIDENCE_KINDS.includes('root-cause-proven'));
    assert.ok(EVIDENCE_KINDS.includes('change-implemented'));
    assert.ok(EVIDENCE_KINDS.includes('targeted-tests-passed'));
    assert.ok(EVIDENCE_KINDS.includes('relevant-suite-passed'));
    assert.ok(EVIDENCE_KINDS.includes('release-readiness-verified'));
    assert.ok(EVIDENCE_KINDS.includes('deployment-verified'));
    assert.ok(EVIDENCE_KINDS.includes('git-state-verified'));
  });

  it('EVIDENCE_QUALITIES contains expected values', () => {
    assert.deepStrictEqual(EVIDENCE_QUALITIES, ['claimed', 'observed', 'verified', 'failed', 'missing']);
  });

  it('DECISION_TYPES contains expected values', () => {
    assert.deepStrictEqual(DECISION_TYPES, ['continue', 'handoff', 'complete', 'blocked']);
  });
});

describe('Evidence State - stateAPI exports', () => {
  it('exports all expected functions', () => {
    assert.ok(typeof stateAPI.createExecutionState === 'function');
    assert.ok(typeof stateAPI.applyEvidence === 'function');
    assert.ok(typeof stateAPI.addBlocker === 'function');
    assert.ok(typeof stateAPI.removeBlocker === 'function');
    assert.ok(typeof stateAPI.resolveDecision === 'function');
    assert.ok(typeof stateAPI.getStopConditions === 'function');
  });
});

describe('Evidence State - Evidence Quality Semantics', () => {
  let baseState;

  before(() => {
    const result = createExecutionState({ primary: 'showdar-build' });
    baseState = result.value;
  });

  it('claimed -> observed -> verified proof strength ladder', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'claimed' });
    assert.strictEqual(s.evidence[0].status, 'claimed');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'observed' });
    assert.strictEqual(s.evidence[0].status, 'observed');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });
    assert.strictEqual(s.evidence[0].status, 'verified');
  });

  it('verified -> failed overrides proof', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'verified' });
    assert.strictEqual(s.evidence[0].status, 'verified');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'failed' });
    assert.strictEqual(s.evidence[0].status, 'failed');
  });

  it('verified -> missing overrides proof', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'verified' });
    assert.strictEqual(s.evidence[0].status, 'verified');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'missing' });
    assert.strictEqual(s.evidence[0].status, 'missing');
  });

  it('failed -> verified restores proof (positive supersedes negative)', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'failed' });
    assert.strictEqual(s.evidence[0].status, 'failed');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });
    // Positive proof supersedes negative state
    assert.strictEqual(s.evidence[0].status, 'verified');
  });

  it('missing -> observed restores proof (positive supersedes negative)', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'missing' });
    assert.strictEqual(s.evidence[0].status, 'missing');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'observed' });
    // Positive proof supersedes negative state
    assert.strictEqual(s.evidence[0].status, 'observed');
  });

  it('missing -> verified restores proof (positive supersedes negative)', () => {
    let s = applyEvidence(baseState, { kind: 'targeted-tests-passed', status: 'missing' });
    assert.strictEqual(s.evidence[0].status, 'missing');
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });
    // Positive proof supersedes negative state
    assert.strictEqual(s.evidence[0].status, 'verified');
  });

  it('completion invalid when required check superseded by failure', () => {
    let s = applyEvidence(baseState, {
      kind: 'change-implemented',
      status: 'verified',
    });
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });
    s = applyEvidence(s, { kind: 'relevant-suite-passed', status: 'verified' });
    let final = resolveDecision(s, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');

    // Now supersede with failure
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'failed' });
    final = resolveDecision(s, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'continue');
    assert.ok(final.decision.reasons.some((r) => r.includes('required verification evidence missing')));

    // Recovery: rerun and verify again
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });
    final = resolveDecision(s, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
  });
});

describe('Evidence State - Exhaustive Verification Mapping', () => {
  const allChecks = [
    'targeted-test',
    'relevant-suite',
    'typecheck',
    'lint',
    'build',
    'package',
    'compatibility',
    'security',
    'regression',
    'release-readiness',
    'deployment-safety',
  ];

  it('every verification check has a corresponding evidence kind', () => {
    for (const check of allChecks) {
      const mapped = mapCheckToEvidence(check);
      assert.ok(mapped !== null, `check "${check}" must map to evidence kind`);
      assert.ok(EVIDENCE_KINDS.includes(mapped), `mapped evidence "${mapped}" must be in EVIDENCE_KINDS`);
    }
  });

  it('every required check gates completion when absent/failed', () => {
    const baseState = createExecutionState({ primary: 'showdar-build' }).value;
    let s = applyEvidence(baseState, { kind: 'change-implemented', status: 'verified' });

    for (const check of allChecks) {
      const mapped = mapCheckToEvidence(check);
      if (!mapped) continue; // skip if no mapping (should not happen now)
      // Apply only this required check as satisfied
      const testState = applyEvidence(s, { kind: mapped, status: 'verified' });
      const final = resolveDecision(testState, {
        intent: validIntent,
        routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
        verificationPlan: { ...validVerificationPlan, required: [check], optional: [] },
      });
      // With only this check satisfied, if it's the ONLY required check, completion should succeed
      // But we test the gating by NOT satisfying it
    }

    // Test that each check individually gates completion when missing
    for (const check of allChecks) {
      const mapped = mapCheckToEvidence(check);
      if (!mapped) continue;
      const testState = applyEvidence(baseState, { kind: 'change-implemented', status: 'verified' });
      const final = resolveDecision(testState, {
        intent: validIntent,
        routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
        verificationPlan: { ...validVerificationPlan, required: [check], optional: [] },
      });
      assert.strictEqual(final.decision.type, 'continue', `check "${check}" should gate completion when missing`);
    }
  });

  it('optional checks do not gate completion', () => {
    const baseState = createExecutionState({ primary: 'showdar-build' }).value;
    let s = applyEvidence(baseState, { kind: 'change-implemented', status: 'verified' });
    s = applyEvidence(s, { kind: 'targeted-tests-passed', status: 'verified' });

    const final = resolveDecision(s, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: { ...validVerificationPlan, required: ['targeted-test'], optional: ['lint', 'typecheck', 'build'] },
    });
    assert.strictEqual(final.decision.type, 'complete');
  });
});

describe('Evidence State - Status/Decision Consistency', () => {
  it('decision blocked -> status blocked', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      blockers: [{ id: 'b1', reason: 'missing auth', type: 'authorization' }],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'blocked');
    assert.strictEqual(final.status, 'blocked');
  });

  it('decision handoff -> status ready-for-handoff', () => {
    const result = createExecutionState({
      primary: 'showdar-debug',
      evidence: [
        { kind: 'failure-reproduced', status: 'verified' },
        { kind: 'root-cause-proven', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: { ...validIntent, phase: 'diagnosis', action: 'investigate', secondaryActions: ['implement'] },
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-debug', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'handoff');
    assert.strictEqual(final.status, 'ready-for-handoff');
  });

  it('decision complete -> status complete', () => {
    const result = createExecutionState({
      primary: 'showdar-build',
      evidence: [
        { kind: 'change-implemented', status: 'verified' },
        { kind: 'targeted-tests-passed', status: 'verified' },
        { kind: 'relevant-suite-passed', status: 'verified' },
      ],
    });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'complete');
    assert.strictEqual(final.status, 'complete');
  });

  it('decision continue -> status active (never blocked/complete/ready-for-handoff)', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.strictEqual(final.decision.type, 'continue');
    assert.strictEqual(final.status, 'active');
  });

  it('verified status is removed - no unreachable statuses', () => {
    // verify that resolveDecision never returns 'verified' status
    const result = createExecutionState({ primary: 'showdar-build' });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.ok(!['verified', 'blocked', 'ready-for-handoff', 'complete'].includes(final.status) || final.status === 'active');
  });
});

describe('Evidence State - Primary Consistency', () => {
  it('throws when state.primary conflicts with routePlan.primary', () => {
    const result = createExecutionState({ primary: 'showdar-debug' });
    assert.throws(() => resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    }), /Primary mismatch/);
  });

  it('allows matching primary', () => {
    const result = createExecutionState({ primary: 'showdar-build' });
    const final = resolveDecision(result.value, {
      intent: validIntent,
      routePlan: { ...validRoutePlan, primary: { skill: 'showdar-build', score: 100, reasons: [] } },
      verificationPlan: validVerificationPlan,
    });
    assert.ok(final.decision);
  });
});

describe('Evidence State - EVIDENCE_KINDS completeness', () => {
  it('includes lint-passed for lint check mapping', () => {
    assert.ok(EVIDENCE_KINDS.includes('lint-passed'));
  });
});