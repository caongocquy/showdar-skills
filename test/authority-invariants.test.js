import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { gatherEvidence } from '../src/intent-resolver/frame/authority/evidence.js';
import { adjudicate, assertAuthorized } from '../src/intent-resolver/frame/authority/adjudicator.js';
import { resolveAuthorizedRelations } from '../src/intent-resolver/frame/authority/relations.js';

// T10 metamorphic invariant suite (test/invariant infrastructure only).
// End-to-end helper through the REAL pipeline: raw prompt text → candidate
// → evidence → adjudicated verdict. No production modules are modified.
const pairFull = (id, prompt) => {
  const [candidate] = extractCandidates([{ id, text: prompt }]);
  const evidence = gatherEvidence({ surface: candidate.surface, clauseText: prompt });
  const verdict = adjudicate(candidate, evidence);
  return { candidate, evidence, verdict };
};

const pair = (prompt) => pairFull('c0', prompt).verdict;

const multiPair = (a, b) => {
  const candidates = extractCandidates([{ id: 'c0', text: a }, { id: 'c1', text: b }]);
  return candidates.map((candidate, i) =>
    adjudicate(candidate, gatherEvidence({ surface: candidate.surface, clauseText: [a, b][i] })),
  );
};

// Lattice in-test (lives here, not in src, per T10 preflight ruling):
// AUTHORIZED > {CONTEXTUAL, NEGATED, CONDITIONAL, HYPOTHETICAL, UNRESOLVED}
// with no order among the non-authorized tags.
const RANK = {
  AUTHORIZED: 1,
  CONTEXTUAL: 0,
  NEGATED: 0,
  CONDITIONAL: 0,
  HYPOTHETICAL: 0,
  UNRESOLVED: 0,
};

// Family 1 — downgrades: a current request transformed into containment,
// denial, gating, supposition, or vagueness lands on the exact downgraded tag.
test('F1 base request adjudicates AUTHORIZED (premise)', () => {
  assert.equal(pair('Repair the checkout screen').tag, 'AUTHORIZED');
});

test('F1 history recount downgrades to CONTEXTUAL', () => {
  assert.equal(pair('Last sprint the team repaired the checkout screen').tag, 'CONTEXTUAL');
});

test('F1 secondhand report downgrades to CONTEXTUAL', () => {
  assert.equal(pair('The team reports that the crew repaired the checkout screen').tag, 'CONTEXTUAL');
});

test('F1 log excerpt downgrades to CONTEXTUAL', () => {
  assert.equal(pair('The error log shows the checkout screen fault').tag, 'CONTEXTUAL');
});

test('F1 quoted instruction downgrades to CONTEXTUAL', () => {
  assert.equal(pair('The lead says: Upgrade the gateway now').tag, 'CONTEXTUAL');
});

test('F1 code fragment downgrades to CONTEXTUAL', () => {
  assert.equal(pair('const gateway = upgrade(target)').tag, 'CONTEXTUAL');
});

test('F1 worked example downgrades to CONTEXTUAL', () => {
  assert.equal(pair('For example, the crew repaired the checkout screen').tag, 'CONTEXTUAL');
});

test('F1 negation downgrades to NEGATED', () => {
  assert.equal(pair('Do not repair the checkout screen').tag, 'NEGATED');
});

test('F1 gating condition downgrades to CONDITIONAL', () => {
  assert.equal(pair('Repair the checkout screen if the tests pass').tag, 'CONDITIONAL');
});

test('F1 recommendation downgrades to HYPOTHETICAL', () => {
  assert.equal(pair('You should repair the checkout screen').tag, 'HYPOTHETICAL');
});

test('F1 vague remark downgrades to UNRESOLVED', () => {
  assert.equal(pair('Something about the checkout screen').tag, 'UNRESOLVED');
});

// Family 2 — monotonic safety net: no transformed variant re-ascends to
// AUTHORIZED once the base request was AUTHORIZED.
test('F2 downgraded variants never re-ascend to AUTHORIZED', () => {
  assert.equal(RANK[pair('Repair the checkout screen').tag], 1);
  const variants = [
    'Last sprint the team repaired the checkout screen',
    'The team reports that the crew repaired the checkout screen',
    'The error log shows the checkout screen fault',
    'The lead says: Upgrade the gateway now',
    'const gateway = upgrade(target)',
    'For example, the crew repaired the checkout screen',
    'Do not repair the checkout screen',
    'Repair the checkout screen if the tests pass',
    'You should repair the checkout screen',
    'Something about the checkout screen',
  ];
  for (const text of variants) {
    const tag = pair(text).tag;
    assert.equal(RANK[tag], 0, `${text} must stay non-authorized, got ${tag}`);
  }
});

// Family 3 — environment qualifies, never creates: appending a local,
// staging, or production mention leaves each non-authorized tag unchanged.
test('F3 CONTEXTUAL + production mention stays CONTEXTUAL', () => {
  assert.equal(pair('Last sprint the team repaired the checkout screen in production').tag, 'CONTEXTUAL');
});

test('F3 NEGATED + staging mention stays NEGATED', () => {
  assert.equal(pair('Do not repair the checkout screen on the staging server').tag, 'NEGATED');
});

test('F3 CONDITIONAL + production mention stays CONDITIONAL', () => {
  assert.equal(pair('Repair the checkout screen in production if the tests pass').tag, 'CONDITIONAL');
});

test('F3 HYPOTHETICAL + local mention stays HYPOTHETICAL', () => {
  assert.equal(pair('You should repair the checkout screen locally').tag, 'HYPOTHETICAL');
});

test('F3 UNRESOLVED + production mention stays UNRESOLVED', () => {
  assert.equal(pair('Something about the checkout screen in production').tag, 'UNRESOLVED');
});

// Family 4 — metadata sidecars never move verdicts or relations (structural:
// the adjudicator never receives environment/metadata; extra sidecar args
// are ignored by the (candidate, evidence) interface).
test('F4 varied risk/object/evidence sidecars leave verdicts unchanged', () => {
  const base = pairFull('c0', 'Upgrade the gateway');
  const downgraded = pairFull('c0', 'Do not upgrade the gateway');
  for (const sidecar of [
    { risk: 'high', object: 'gateway', evidenceNote: 'none' },
    { risk: 'low', object: 'checkout', evidenceNote: 'log excerpt attached' },
    undefined,
  ]) {
    assert.deepEqual(adjudicate(base.candidate, base.evidence, sidecar), base.verdict);
    assert.deepEqual(adjudicate(downgraded.candidate, downgraded.evidence, sidecar), downgraded.verdict);
  }
});

test('F4 relations over AUTHORIZED mints ignore sidecar-shaped metadata', () => {
  const [authA, authB] = multiPair('Inspect the gateway', 'Patch the gateway');
  assertAuthorized(authA);
  assertAuthorized(authB);
  const first = resolveAuthorizedRelations([authA, authB]);
  const second = resolveAuthorizedRelations([authA, authB]);
  assert.deepEqual(second.relations, first.relations);
  assert.equal(second.governing, first.governing);
});

// Family 5 — lexical nouns: pipeline/migration/release/test as descriptive
// nouns yield no positive request evidence; a nearby noun never steals the
// governing verb.
test('F5 bare migration noun yields no request evidence', () => {
  const { candidate, evidence, verdict } = pairFull('c0', 'the migration plan status');
  assert.equal(candidate.capability, 'unknown');
  assert.equal(evidence.positiveRequest, false);
  assert.equal(verdict.tag, 'UNRESOLVED');
});

test('F5 bare pipeline noun yields no request evidence', () => {
  const { candidate, evidence, verdict } = pairFull('c0', 'the release pipeline overview');
  assert.equal(candidate.capability, 'unknown');
  assert.equal(evidence.positiveRequest, false);
  assert.equal(verdict.tag, 'UNRESOLVED');
});

test('F5 bare test noun yields no request evidence', () => {
  const { candidate, evidence, verdict } = pairFull('c0', 'the test suite outcome');
  assert.equal(candidate.capability, 'unknown');
  assert.equal(evidence.positiveRequest, false);
  assert.equal(verdict.tag, 'UNRESOLVED');
});

test('F5 nearby nouns do not steal the governing verb', () => {
  const review = pairFull('c0', 'Review the migration plan');
  assert.equal(review.candidate.capability, 'verification');
  assert.equal(review.candidate.surface, 'review');
  assert.equal(review.verdict.tag, 'AUTHORIZED');
  const inspect = pairFull('c0', 'Inspect the release pipeline');
  assert.equal(inspect.candidate.capability, 'verification');
  assert.equal(inspect.candidate.surface, 'inspect');
  assert.equal(inspect.verdict.tag, 'AUTHORIZED');
});

// Family 6 — insertions: non-authorized records inserted before/after an
// AUTHORIZED request leave the governing record and relation graph unchanged
// (adjudicated sets built directly via the real adjudicate; the graph is
// resolved over the AUTHORIZED-only projection).
test('F6 insertions around AUTHORIZED requests leave the graph unchanged', () => {
  const [authA, authB] = multiPair('Inspect the gateway', 'Patch the gateway');
  const base = resolveAuthorizedRelations([authA, authB]);
  const insertions = [
    pair('Last week the crew patched the gateway'),
    pair('Do not inspect the gateway'),
    pair('Patch the gateway if the build passes'),
    pair('You should inspect the gateway'),
    pair('Something about the gateway'),
  ];
  assert.deepEqual(insertions.map((v) => v.tag), [
    'CONTEXTUAL',
    'NEGATED',
    'CONDITIONAL',
    'HYPOTHETICAL',
    'UNRESOLVED',
  ]);
  const trailing = resolveAuthorizedRelations(
    [authA, ...insertions, authB].filter((v) => v.tag === 'AUTHORIZED'),
  );
  const leading = resolveAuthorizedRelations(
    [...insertions, authA, authB].filter((v) => v.tag === 'AUTHORIZED'),
  );
  for (const variant of [trailing, leading]) {
    assert.equal(variant.governing, base.governing);
    assert.deepEqual(variant.relations, base.relations);
  }
});

// Family 7 — request forms: imperative/polite/interrogative/need/help/
// investigate equivalents all authorize (recall protection); wrappers still
// downgrade per precedence.
test('F7 imperative authorizes', () => {
  assert.equal(pair('Upgrade the gateway').tag, 'AUTHORIZED');
});

test('F7 polite request authorizes', () => {
  assert.equal(pair('Please upgrade the gateway').tag, 'AUTHORIZED');
});

test('F7 interrogative request authorizes (modal consumed as request)', () => {
  const { evidence, verdict } = pairFull('c0', 'Could you upgrade the gateway');
  assert.equal(evidence.requestForm, 'interrogative-request');
  assert.equal(verdict.tag, 'AUTHORIZED');
});

test('F7 need-statement authorizes', () => {
  assert.equal(pair('We need to upgrade the gateway').tag, 'AUTHORIZED');
});

test('F7 help-request authorizes', () => {
  assert.equal(pair('Help me upgrade the gateway').tag, 'AUTHORIZED');
});

test('F7 investigate-question authorizes', () => {
  const { evidence, verdict } = pairFull('c0', 'Why is the gateway stalling, diagnose the gateway');
  assert.equal(evidence.requestForm, 'investigate-question');
  assert.equal(verdict.tag, 'AUTHORIZED');
});

test('F7 wrappers still downgrade per precedence', () => {
  assert.equal(pair('Please do not upgrade the gateway').tag, 'NEGATED');
  assert.equal(pair('Could you upgrade the gateway if the build passes').tag, 'CONDITIONAL');
  assert.equal(pair('Patch the gateway, for example the old one').tag, 'CONTEXTUAL');
  assert.equal(pair('We need to upgrade the gateway we patched last week').tag, 'CONTEXTUAL');
  assert.equal(pair('Help me upgrade the gateway, we should hurry').tag, 'HYPOTHETICAL');
});

// Family 8 — forgery firewall re-assertion: any copy or mutation of the
// public fields of a minted AUTHORIZED action is rejected.
test('F8 spread clone of minted AUTHORIZED rejected', () => {
  const minted = pair('Upgrade the gateway');
  assertAuthorized(minted);
  assert.throws(() => assertAuthorized({ ...minted }), /brand|membership/);
});

test('F8 Object.assign copy of minted AUTHORIZED rejected', () => {
  const minted = pair('Upgrade the gateway');
  assert.throws(() => assertAuthorized(Object.assign({}, minted)), /brand|membership/);
});

test('F8 reconstructed shape-alike rejected', () => {
  const minted = pair('Upgrade the gateway');
  assert.throws(
    () => assertAuthorized({
      tag: minted.tag,
      scope: minted.scope,
      candidate: minted.candidate,
      requestEvidence: minted.requestEvidence,
    }),
    /brand|membership/,
  );
});

test('F8 mutated public fields of minted AUTHORIZED rejected', () => {
  const minted = pair('Upgrade the gateway');
  assert.throws(
    () => assertAuthorized({ ...minted, scope: 'CURRENT', requestEvidence: 'imperative' }),
    /brand|membership/,
  );
});

test('F8 fresh-symbol forgery rejected (no WeakSet membership)', () => {
  const minted = pair('Upgrade the gateway');
  const forged = { ...minted, [Symbol('6g-authorized')]: true };
  assert.throws(() => assertAuthorized(forged), /brand|membership/);
});

test('F8 forged records rejected from the relation graph', () => {
  const minted = pair('Upgrade the gateway');
  assert.throws(() => resolveAuthorizedRelations([{ ...minted }]), /brand|membership|tag/);
});

// Family 9 — GOVERNING-ORDER AUDIT: purpose-framed support-first workflow
// ("<support-op> ... so you can ..." serving "<main-op>", both authorized):
// the served main operation must govern. If resolveAuthorizedRelations makes
// the support operation GOVERNING, this test MUST FAIL (a T09 reopen owns
// the fix).
test('F9 AUDIT purpose-framed support-first workflow governs the main operation', () => {
  const supportText = 'Inspect the staging cache so you can confirm readiness';
  const mainText = 'Migrate the database';
  const [supportAuth, mainAuth] = multiPair(supportText, mainText);
  assert.equal(supportAuth.tag, 'AUTHORIZED', 'audit premise: support clause authorized');
  assert.equal(mainAuth.tag, 'AUTHORIZED', 'audit premise: main clause authorized');
  const out = resolveAuthorizedRelations([supportAuth, mainAuth], { c0: supportText, c1: mainText });
  assert.equal(out.governing, mainAuth, 'main operation must govern a purpose-framed support-first workflow');
  assert.equal(
    out.relations.find((r) => r.to === 'c0:inspect').kind,
    'SUPPORTING',
    'purpose clause must support the served main operation',
  );
});

// Family 10 — SUPPORTING AUDIT: sequenced same-workflow/different-targets ⇒
// SUPPORTING; same-target sequential ⇒ SUPPORTING (subordinate step);
// bare-juxtaposition different-targets (no linking markers) ⇒ ORTHOGONAL.
// FAIL on mismatch (same reopen bounds as F9).
test('F10 AUDIT sequenced different-targets are SUPPORTING', () => {
  const firstText = 'Deploy the API';
  const secondText = 'Verify the release then';
  const [firstAuth, secondAuth] = multiPair(firstText, secondText);
  assert.equal(firstAuth.tag, 'AUTHORIZED', 'audit premise: first clause authorized');
  assert.equal(secondAuth.tag, 'AUTHORIZED', 'audit premise: second clause authorized');
  const out = resolveAuthorizedRelations([firstAuth, secondAuth], { c0: firstText, c1: secondText });
  assert.equal(out.relations[1].kind, 'SUPPORTING', 'sequenced different-targets must support');
});

// T11 §8: target equality is neither sufficient nor necessary. Same-target
// bare juxtaposition carries no workflow linkage → ORTHOGONAL (overrides the
// T10 design-semantics reading; sanctioned T09 reopen per ledger T11 ruling).
// SUPPORTING requires an explicit subordination marker.
test('F10 AUDIT same-target bare juxtaposition is ORTHOGONAL', () => {
  const [firstAuth, secondAuth] = multiPair('Inspect the gateway', 'Patch the gateway');
  assert.equal(firstAuth.tag, 'AUTHORIZED', 'audit premise: first clause authorized');
  assert.equal(secondAuth.tag, 'AUTHORIZED', 'audit premise: second clause authorized');
  const out = resolveAuthorizedRelations([firstAuth, secondAuth]);
  assert.equal(out.relations[1].kind, 'ORTHOGONAL', 'bare juxtaposition without markers must not support');
});

test('F10 bare-juxtaposition different-targets are ORTHOGONAL', () => {
  const firstText = 'Audit the config file';
  const secondText = 'Review the ledger file';
  const [firstAuth, secondAuth] = multiPair(firstText, secondText);
  assert.equal(firstAuth.tag, 'AUTHORIZED', 'audit premise: first clause authorized');
  assert.equal(secondAuth.tag, 'AUTHORIZED', 'audit premise: second clause authorized');
  const out = resolveAuthorizedRelations([firstAuth, secondAuth], { c0: firstText, c1: secondText });
  assert.equal(out.relations[1].kind, 'ORTHOGONAL', 'bare juxtaposition without linking markers must not support');
});
