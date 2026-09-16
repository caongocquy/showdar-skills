import assert from 'node:assert/strict';
import { assertAuthorized, assertAdjudicated, contextual, negated, conditional, hypothetical, unresolved, isAuthorizedBrand } from '../src/intent-resolver/frame/authority/types.js';

function testAssertAuthorizedRejectsPlainAUTHORIZEDObject() {
  const plain = { tag: 'AUTHORIZED', scope: 'CURRENT', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' } };
  assert.throws(() => assertAuthorized(plain), /brand/);
}

function testAssertAuthorizedRejectsForgeryWithBrandSymbolButNoMembership() {
  const fakeBrand = Symbol('6g-authorized');
  const forged = { tag: 'AUTHORIZED', scope: 'CURRENT', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, [fakeBrand]: true };
  assert.throws(() => assertAuthorized(forged), /brand/);
}

function testAssertAuthorizedRejectsWrongTag() {
  const rec = { tag: 'CONDITIONAL', scope: 'CURRENT', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' } };
  assert.throws(() => assertAuthorized(rec));
}

function testAssertAuthorizedRejectsMissingScope() {
  const rec = { tag: 'AUTHORIZED', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' } };
  assert.throws(() => assertAuthorized(rec));
}

function testAssertAuthorizedRejectsWrongScope() {
  const rec = { tag: 'AUTHORIZED', scope: 'FUTURE', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' } };
  assert.throws(() => assertAuthorized(rec));
}

function testAssertAuthorizedRejectsMissingCandidate() {
  const rec = { tag: 'AUTHORIZED', scope: 'CURRENT' };
  assert.throws(() => assertAuthorized(rec));
}

function testAssertAuthorizedRejectsSecondAuthorityTag() {
  const rec = { tag: 'AUTHORIZED', scope: 'CURRENT', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, authority: 'some-value' };
  assert.throws(() => assertAuthorized(rec));
}

function testAssertAuthorizedRejectsNonAuthorizedVariants() {
  const variants = [
    contextual({ kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, 'HISTORY'),
    negated({ kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, 'explicit'),
    conditional({ kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, 'when ready'),
    hypothetical({ kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, 'suppose'),
    unresolved({ kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' }, 'no evidence'),
  ];
  for (const v of variants) {
    assert.throws(() => assertAuthorized(v));
  }
}

function testAssertAdjudicatedAcceptsSixUnionTags() {
  const candidate = { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' };
  const tags = [
    { tag: 'AUTHORIZED', scope: 'CURRENT', candidate, requestEvidence: 'imperative' },
    { tag: 'CONDITIONAL', candidate, condition: 'if approved' },
    { tag: 'HYPOTHETICAL', candidate, reason: 'suppose' },
    { tag: 'CONTEXTUAL', candidate, contextKind: 'HISTORY' },
    { tag: 'NEGATED', candidate, reason: 'denied' },
    { tag: 'UNRESOLVED', candidate, reason: 'unknown' },
  ];
  for (const t of tags) {
    assert.doesNotThrow(() => assertAdjudicated(t), `assertAdjudicated should accept ${t.tag}`);
  }
}

function testAssertAdjudicatedRejectsUnknownTag() {
  const rec = { tag: 'INVALID_TAG', candidate: { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' } };
  assert.throws(() => assertAdjudicated(rec), /tag/);
}

function testNonAuthorizedFactoriesReturnFrozenRecordsWithPublicTags() {
  const candidate = { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' };
  const ctx = contextual(candidate, 'HISTORY');
  const neg = negated(candidate, 'explicit');
  const cond = conditional(candidate, 'if approved');
  const hyp = hypothetical(candidate, 'suppose');
  const unr = unresolved(candidate, 'no evidence');

  assert.equal(ctx.tag, 'CONTEXTUAL');
  assert.equal(ctx.contextKind, 'HISTORY');
  assert.equal(ctx.candidate, candidate);
  assert.ok(Object.isFrozen(ctx));

  assert.equal(neg.tag, 'NEGATED');
  assert.equal(neg.reason, 'explicit');
  assert.equal(neg.candidate, candidate);
  assert.ok(Object.isFrozen(neg));

  assert.equal(cond.tag, 'CONDITIONAL');
  assert.equal(cond.condition, 'if approved');
  assert.equal(cond.candidate, candidate);
  assert.ok(Object.isFrozen(cond));

  assert.equal(hyp.tag, 'HYPOTHETICAL');
  assert.equal(hyp.reason, 'suppose');
  assert.equal(hyp.candidate, candidate);
  assert.ok(Object.isFrozen(hyp));

  assert.equal(unr.tag, 'UNRESOLVED');
  assert.equal(unr.reason, 'no evidence');
  assert.equal(unr.candidate, candidate);
  assert.ok(Object.isFrozen(unr));
}

function testNoParallelLooseFieldsOnVariants() {
  const candidate = { kind: 'ActionCandidate', capability: 'deployment', clauseId: 'c0' };
  const ctx = contextual(candidate, 'HISTORY');
  const neg = negated(candidate, 'explicit');
  const cond = conditional(candidate, 'if approved');
  const hyp = hypothetical(candidate, 'suppose');
  const unr = unresolved(candidate, 'no evidence');

  for (const rec of [ctx, neg, cond, hyp, unr]) {
    assert.ok(!('commitment' in rec), `no commitment on ${rec.tag}`);
    assert.ok(!('mutation' in rec), `no mutation on ${rec.tag}`);
    assert.ok(!('authority' in rec), `no authority on ${rec.tag}`);
    assert.ok(!('scope' in rec), `no scope on ${rec.tag}`);
  }
}

function testIsAuthorizedBrandInternalCheck() {
  // isAuthorizedBrand is internal; on plain objects returns false
  assert.equal(isAuthorizedBrand({}), false);
  assert.equal(isAuthorizedBrand(null), false);
  assert.equal(isAuthorizedBrand(undefined), false);
  assert.equal(isAuthorizedBrand({ [Symbol('6g-authorized')]: true }), false); // wrong symbol
}

function runAll() {
  testAssertAuthorizedRejectsPlainAUTHORIZEDObject();
  testAssertAuthorizedRejectsForgeryWithBrandSymbolButNoMembership();
  testAssertAuthorizedRejectsWrongTag();
  testAssertAuthorizedRejectsMissingScope();
  testAssertAuthorizedRejectsWrongScope();
  testAssertAuthorizedRejectsMissingCandidate();
  testAssertAuthorizedRejectsSecondAuthorityTag();
  testAssertAuthorizedRejectsNonAuthorizedVariants();
  testAssertAdjudicatedAcceptsSixUnionTags();
  testAssertAdjudicatedRejectsUnknownTag();
  testNonAuthorizedFactoriesReturnFrozenRecordsWithPublicTags();
  testNoParallelLooseFieldsOnVariants();
  testIsAuthorizedBrandInternalCheck();
  console.log('All authority-types tests passed');
}

runAll();