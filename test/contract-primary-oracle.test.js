import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { evaluateContractPrimary, legacyPrimaryFromPrompt } from '../scripts/contract-primary-eval.mjs';

const suite = JSON.parse(fs.readFileSync(new URL('../evals/development-regression.json', import.meta.url), 'utf8'));
const audit = JSON.parse(fs.readFileSync(new URL('../evals/development-contract-primary-audit.json', import.meta.url), 'utf8'));

// Corrected audit expectations override stale historical fixture semantics:
// fixture says implementation/implement for upgrade cases, audit says upgrade.
test('corrected audit expectations override stale fixture semantics', () => {
  const byId = new Map(audit.cases.map((c) => [c.caseId, c]));
  const fixtureById = new Map(suite.cases.map((c) => [c.id, c.expected]));
  for (const id of ['upgrade-with-regression-tests', 'multi-intent-upgrade-and-test']) {
    assert.equal(byId.get(id).expectedPrimarySkill, 'showdar-upgrade');
    assert.equal(fixtureById.get(id).action, 'implement');
    assert.equal(byId.get(id).auditStatus, 'EXPECTATION_CORRECTED');
  }
  assert.equal(byId.get('review-auth-no-changes').expectedPrimarySkill, 'showdar-review');
  assert.equal(byId.get('low-confidence-vague').expectedPrimarySkill, 'showdar-understand');
});

// Legacy matcher cannot affect the T20 contract-primary result: contract
// correctness is computed against audit expectations only.
test('legacy matcher cannot affect contract-primary result', () => {
  // Prompt where legacy says build but the audit says upgrade.
  const single = [{ id: 'only-case', prompt: 'Upgrade the widget and add regression tests' }];
  assert.equal(legacyPrimaryFromPrompt('Upgrade the widget and add regression tests'), 'showdar-build');
  const auditSingle = [{ caseId: 'only-case', expectedPhase: 'implementation', expectedAction: 'upgrade', expectedPrimaryCapability: 'upgrade', expectedPrimarySkill: 'showdar-upgrade', auditStatus: 'EXPECTATION_CORRECTED', rationale: 'governing upgrade' }];
  const asUpgrade = () => ({ intent: { phase: 'implementation', action: 'upgrade', object: 'x', mutation: 'local-write', risks: [], secondaryActions: [], evidence: {} } });
  const asBuild = () => ({ intent: { phase: 'implementation', action: 'implement', object: 'x', mutation: 'local-write', risks: [], secondaryActions: [], evidence: {} } });
  const rMatch = evaluateContractPrimary({ suiteCases: single, auditCases: auditSingle, resolve: asUpgrade });
  const rMiss = evaluateContractPrimary({ suiteCases: single, auditCases: auditSingle, resolve: asBuild });
  // Contract follows the audit (upgrade), not the legacy matcher (build).
  assert.equal(rMatch.contractCorrect, 1);
  assert.equal(rMiss.contractCorrect, 0);
  assert.deepEqual(rMiss.contractFailures.map((f) => f.expected), ['showdar-upgrade']);
  // Legacy agreement is reported on a separate counter and never changes
  // the contract count: legacy agrees with asBuild, disagrees with asUpgrade.
  assert.equal(rMiss.legacyAgreement, 1);
  assert.equal(rMatch.legacyAgreement, 0);
});

// All 42 audit case ids resolve exactly once: duplicates fail.
test('duplicate audit case ids fail evaluation', () => {
  const duped = [...audit.cases, { ...audit.cases[0] }];
  assert.throws(() => evaluateContractPrimary({ auditCases: duped }), /Duplicate contract-primary audit case/);
});

// Missing case ids fail evaluation.
test('missing audit case ids fail evaluation', () => {
  const dropped = audit.cases.slice(1);
  assert.throws(() => evaluateContractPrimary({ auditCases: dropped }), /missing case ids/);
});

// Unknown audit case ids fail evaluation.
test('unknown audit case ids fail evaluation', () => {
  const extended = [...audit.cases, { caseId: 'no-such-case', expectedPhase: 'discovery', expectedAction: 'understand', expectedPrimaryCapability: 'understand', expectedPrimarySkill: 'showdar-understand', auditStatus: 'ORIGINAL_EXPECTATION_VALID' }];
  assert.throws(() => evaluateContractPrimary({ auditCases: extended }), /unknown case ids/);
});

// Evaluator does not derive expected labels from structural output: the same
// static audit expectations apply regardless of what resolve returns.
test('expected labels are static, not derived from structural output', () => {
  const single = [{ id: 'only-case', prompt: 'Upgrade the thing and add tests' }];
  const auditSingle = [{ caseId: 'only-case', expectedPhase: 'implementation', expectedAction: 'upgrade', expectedPrimaryCapability: 'upgrade', expectedPrimarySkill: 'showdar-upgrade', auditStatus: 'EXPECTATION_CORRECTED', rationale: 'x' }];
  const asBuild = () => ({ intent: { phase: 'implementation', action: 'implement', object: 'x', mutation: 'local-write', risks: [], secondaryActions: [], evidence: {} } });
  const asUpgrade = () => ({ intent: { phase: 'implementation', action: 'upgrade', object: 'x', mutation: 'local-write', risks: [], secondaryActions: [], evidence: {} } });
  const r1 = evaluateContractPrimary({ suiteCases: single, auditCases: auditSingle, resolve: asBuild });
  const r2 = evaluateContractPrimary({ suiteCases: single, auditCases: auditSingle, resolve: asUpgrade });
  assert.equal(r1.contractCorrect, 0);
  assert.equal(r2.contractCorrect, 1);
  assert.deepEqual(r1.contractFailures.map((f) => f.expected), ['showdar-upgrade']);
});

// Audit artifact covers all 42 development ids exactly once.
test('audit covers all 42 development cases exactly once', () => {
  assert.equal(audit.cases.length, 42);
  assert.equal(new Set(audit.cases.map((c) => c.caseId)).size, 42);
  const suiteIds = new Set(suite.cases.map((c) => c.id));
  for (const c of audit.cases) {
    assert.ok(suiteIds.has(c.caseId), `unknown audit id ${c.caseId}`);
    assert.ok(c.expectedPhase && c.expectedAction && c.expectedPrimaryCapability && c.expectedPrimarySkill, `incomplete ${c.caseId}`);
    assert.ok(['ORIGINAL_EXPECTATION_VALID', 'EXPECTATION_CORRECTED'].includes(c.auditStatus), `bad status ${c.caseId}`);
    if (c.auditStatus === 'EXPECTATION_CORRECTED') {
      assert.ok(c.rationale && c.rationale.length > 0, `missing rationale ${c.caseId}`);
    }
  }
});
