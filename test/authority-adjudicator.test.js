import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjudicate,
  assertAuthorized,
  assertAdjudicated,
  contextual,
  negated,
  conditional,
  hypothetical,
  unresolved,
  isAuthorizedBrand,
} from '../src/intent-resolver/frame/authority/adjudicator.js';

const cand = (capability = 'repair') => ({
  kind: 'ActionCandidate',
  capability,
  target: null,
  clauseId: 'c0',
  surface: 'mend',
  environment: 'unspecified',
});

const ev = (over = {}) => ({
  requestForm: null,
  negation: false,
  condition: false,
  modal: false,
  contextKinds: [],
  temporal: null,
  positiveRequest: false,
  ...over,
});

// CYCLE A — verdict states (NEW independently worded prompts as scenario labels only;
// adjudicate takes direct candidate+evidence inputs, never raw text).

test('AUTHORIZED via imperative — "Mend the stage gate latch"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'imperative', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('AUTHORIZED via polite request — "Please mend the stage gate latch"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'polite-request', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('AUTHORIZED via interrogative request — "Could you mend the stage gate latch"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'interrogative-request', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('AUTHORIZED via need statement — "We need to mend the stage gate latch"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'need-statement', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('AUTHORIZED via help request — "Help me mend the stage gate latch"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'help-request', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('AUTHORIZED via investigate question — "Why is the gate latch sticking, figure it out"', () => {
  assert.equal(adjudicate(cand(), ev({ requestForm: 'investigate-question', positiveRequest: true })).tag, 'AUTHORIZED');
});

test('CONTEXTUAL on containment — "Last week we mended the latch"', () => {
  assert.equal(adjudicate(cand(), ev({ contextKinds: ['history'] })).tag, 'CONTEXTUAL');
});

test('NEGATED on denial — "Do not mend the latch"', () => {
  assert.equal(adjudicate(cand(), ev({ negation: true })).tag, 'NEGATED');
});

test('CONDITIONAL on gating — "Mend the latch once the audit signs off"', () => {
  assert.equal(adjudicate(cand(), ev({ condition: true })).tag, 'CONDITIONAL');
});

test('HYPOTHETICAL on modal — "Suppose we mended the latch next quarter"', () => {
  assert.equal(adjudicate(cand(), ev({ modal: true })).tag, 'HYPOTHETICAL');
});

test('UNRESOLVED on empty evidence — "Latch ... mended ... maybe"', () => {
  assert.equal(adjudicate(cand(), ev({})).tag, 'UNRESOLVED');
});

test('UNRESOLVED on unknown capability despite positive request — "Please florp the latch"', () => {
  assert.equal(adjudicate(cand('unknown'), ev({ requestForm: 'polite-request', positiveRequest: true })).tag, 'UNRESOLVED');
});

// CYCLE B — deterministic overlap precedence (§8A).

test('PRECEDENCE CONTEXTUAL+CONDITIONAL → CONTEXTUAL — quoted runbook excerpt with gate', () => {
  assert.equal(adjudicate(cand(), ev({ contextKinds: ['quote'], condition: true })).tag, 'CONTEXTUAL');
});

test('PRECEDENCE CONTEXTUAL+NEGATED → CONTEXTUAL — history note with denial', () => {
  assert.equal(adjudicate(cand(), ev({ contextKinds: ['history'], negation: true })).tag, 'CONTEXTUAL');
});

test('PRECEDENCE NEGATED+CONDITIONAL → NEGATED — denied gated restart', () => {
  assert.equal(adjudicate(cand(), ev({ negation: true, condition: true })).tag, 'NEGATED');
});

test('PRECEDENCE CONDITIONAL+HYPOTHETICAL → CONDITIONAL — gated hopeful wording', () => {
  assert.equal(adjudicate(cand(), ev({ condition: true, modal: true })).tag, 'CONDITIONAL');
});

test('PRECEDENCE modal + non-interrogative form + positiveRequest → HYPOTHETICAL', () => {
  assert.equal(
    adjudicate(cand(), ev({ modal: true, requestForm: 'imperative', positiveRequest: true })).tag,
    'HYPOTHETICAL',
  );
});

test('PRECEDENCE interrogative + modal → AUTHORIZED — modal consumed as request construction', () => {
  assert.equal(
    adjudicate(cand(), ev({ modal: true, requestForm: 'interrogative-request', positiveRequest: true })).tag,
    'AUTHORIZED',
  );
});

test('PRECEDENCE empty evidence → UNRESOLVED — bare noun fragment', () => {
  assert.equal(adjudicate(cand(), ev({})).tag, 'UNRESOLVED');
});

// CYCLE C — real minter: brand acceptance.

test('MINTER real AUTHORIZED passes assertAuthorized + assertAdjudicated', () => {
  const rec = adjudicate(cand(), ev({ requestForm: 'imperative', positiveRequest: true }));
  assert.doesNotThrow(() => assertAuthorized(rec));
  assert.doesNotThrow(() => assertAdjudicated(rec));
});

test('MINTER real AUTHORIZED is frozen, branded, and exactly shaped', () => {
  const c = cand();
  const rec = adjudicate(c, ev({ requestForm: 'imperative', positiveRequest: true }));
  assert.ok(Object.isFrozen(rec));
  assert.equal(isAuthorizedBrand(rec), true);
  assert.deepEqual(Object.keys(rec).sort(), ['candidate', 'requestEvidence', 'scope', 'tag']);
  assert.equal(rec.scope, 'CURRENT');
  assert.equal(rec.candidate, c);
  assert.equal(rec.requestEvidence, 'imperative');
});

// CYCLE D — forgery battery against the REAL minter.

const realAuth = () => adjudicate(cand(), ev({ requestForm: 'imperative', positiveRequest: true }));

test('FORGERY plain object rejected', () => {
  assert.throws(
    () => assertAuthorized({ tag: 'AUTHORIZED', scope: 'CURRENT', candidate: cand(), requestEvidence: 'imperative' }),
    /brand/,
  );
});

test('FORGERY spread of real record rejected (loses WeakSet membership)', () => {
  assert.throws(() => assertAuthorized({ ...realAuth() }), /brand|membership/);
});

test('FORGERY Object.assign copy rejected', () => {
  assert.throws(() => assertAuthorized(Object.assign({}, realAuth())), /brand|membership/);
});

test('FORGERY reconstructed shape-alike rejected', () => {
  const r = realAuth();
  assert.throws(
    () => assertAuthorized({ tag: r.tag, scope: r.scope, candidate: r.candidate, requestEvidence: r.requestEvidence }),
    /brand/,
  );
});

test('FORGERY fresh-symbol brand rejected (wrong symbol identity)', () => {
  const forged = {
    tag: 'AUTHORIZED',
    scope: 'CURRENT',
    candidate: cand(),
    requestEvidence: 'imperative',
    [Symbol('6g-authorized')]: true,
  };
  assert.throws(() => assertAuthorized(forged), /brand/);
});

test('FORGERY brand-carrying but unregistered record rejected (spread keeps symbol, not membership)', () => {
  const spread = { ...realAuth() };
  const symbols = Object.getOwnPropertySymbols(spread);
  assert.ok(symbols.length > 0, 'spread must retain the brand symbol for this test to be meaningful');
  assert.throws(() => assertAuthorized(spread), /membership/);
});

test('FORGERY real record with wrong tag rejected', () => {
  assert.throws(() => assertAuthorized({ ...realAuth(), tag: 'CONDITIONAL' }), /brand|membership|tag/);
});

test('FORGERY non-authorized variants rejected by assertAuthorized', () => {
  const c = cand();
  for (const v of [
    contextual(c, 'history'),
    negated(c, 'denied'),
    conditional(c, 'if ready'),
    hypothetical(c, 'suppose'),
    unresolved(c, 'unknown'),
  ]) {
    assert.throws(() => assertAuthorized(v), `variant ${v.tag} must not pass`);
  }
});

// CYCLE E — isolation: validation, purity, compat, closed construction.

test('ISOLATION candidate validation throws /candidate/ on null/non-object/wrong-kind', () => {
  const good = ev({ requestForm: 'imperative', positiveRequest: true });
  assert.throws(() => adjudicate(null, good), /candidate/);
  assert.throws(() => adjudicate(undefined, good), /candidate/);
  assert.throws(() => adjudicate('mend', good), /candidate/);
  assert.throws(() => adjudicate(42, good), /candidate/);
  assert.throws(() => adjudicate({ kind: 'NotACandidate' }, good), /candidate/);
  assert.throws(() => adjudicate({ capability: 'repair' }, good), /candidate/);
});

test('ISOLATION adjudicate never mutates evidence', () => {
  const evidence = ev({ requestForm: 'imperative', positiveRequest: true, contextKinds: [] });
  const before = JSON.stringify(evidence);
  adjudicate(cand(), evidence);
  adjudicate(cand('unknown'), evidence);
  assert.equal(JSON.stringify(evidence), before);
});

test('ISOLATION unknown capability never authorizes', () => {
  for (const form of ['imperative', 'polite-request', 'interrogative-request', 'need-statement', 'help-request', 'investigate-question']) {
    assert.equal(
      adjudicate(cand('unknown'), ev({ requestForm: form, positiveRequest: true })).tag,
      'UNRESOLVED',
      `unknown capability with ${form} must stay UNRESOLVED`,
    );
  }
});

test('ISOLATION all verdicts return frozen records', () => {
  const c = cand();
  const verdicts = [
    adjudicate(c, ev({ requestForm: 'imperative', positiveRequest: true })),
    adjudicate(c, ev({ contextKinds: ['log'] })),
    adjudicate(c, ev({ negation: true })),
    adjudicate(c, ev({ condition: true })),
    adjudicate(c, ev({ modal: true })),
    adjudicate(c, ev({})),
  ];
  for (const v of verdicts) {
    assert.ok(Object.isFrozen(v), `${v.tag} must be frozen`);
    assert.doesNotThrow(() => assertAdjudicated(v), `${v.tag} must satisfy assertAdjudicated`);
  }
});

test('ISOLATION no exported minter/promotion API on adjudicator module', async () => {
  const mod = await import('../src/intent-resolver/frame/authority/adjudicator.js');
  for (const name of ['createAuthorized', 'authorize', 'promote', 'upgrade', 'toAuthorized', 'AUTHORIZED_BRAND', 'minted']) {
    assert.ok(!(name in mod), `${name} must not be exported`);
  }
});

test('ISOLATION types.js is a re-export compat layer with identical behavior', async () => {
  const types = await import('../src/intent-resolver/frame/authority/types.js');
  const adj = await import('../src/intent-resolver/frame/authority/adjudicator.js');
  for (const name of ['assertAuthorized', 'assertAdjudicated', 'contextual', 'negated', 'conditional', 'hypothetical', 'unresolved', 'isAuthorizedBrand', 'adjudicate']) {
    assert.equal(types[name], adj[name], `types.js ${name} must be the adjudicator export`);
  }
  for (const name of ['createAuthorized', 'AUTHORIZED_BRAND', 'minted']) {
    assert.ok(!(name in types), `types.js must not export ${name}`);
  }
  const rec = types.adjudicate(cand(), ev({ requestForm: 'imperative', positiveRequest: true }));
  assert.doesNotThrow(() => types.assertAuthorized(rec));
});
