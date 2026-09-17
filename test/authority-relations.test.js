import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthorizedRelations } from '../src/intent-resolver/frame/authority/relations.js';
import {
  adjudicate,
  contextual,
  negated,
  conditional,
  hypothetical,
  unresolved,
} from '../src/intent-resolver/frame/authority/adjudicator.js';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { gatherEvidence } from '../src/intent-resolver/frame/authority/evidence.js';

// Full-pipeline helper: raw clause text → adjudicated record, same path as
// the (unwired) production flow would take.
const adjudicateClause = (id, text) => {
  const [candidate] = extractCandidates([{ id, text }]);
  return adjudicate(candidate, gatherEvidence({ surface: candidate.surface, clauseText: text }));
};

const fixedCandidate = (over = {}) => ({
  kind: 'ActionCandidate',
  capability: 'repair',
  target: 'gate latch',
  clauseId: 'c0',
  surface: 'mend',
  environment: 'unspecified',
  ...over,
});

const authEvidence = (over = {}) => ({
  requestForm: 'imperative',
  negation: false,
  condition: false,
  modal: false,
  contextKinds: [],
  temporal: null,
  positiveRequest: true,
  ...over,
});

const mint = (candidateOver = {}, evidenceOver = {}) =>
  adjudicate(fixedCandidate(candidateOver), authEvidence(evidenceOver));

// CYCLE A — rejection battery: only real AUTHORIZED records enter the graph.
const realAuth = () => mint();

test('A1 CONTEXTUAL rejected from graph', () => {
  assert.throws(() => resolveAuthorizedRelations([contextual(fixedCandidate(), 'history')]), /AUTHORIZED brand|membership|tag/);
});

test('A2 CONDITIONAL rejected from graph', () => {
  assert.throws(() => resolveAuthorizedRelations([conditional(fixedCandidate(), 'if ready')]), /AUTHORIZED brand|membership|tag/);
});

test('A3 HYPOTHETICAL rejected from graph', () => {
  assert.throws(() => resolveAuthorizedRelations([hypothetical(fixedCandidate(), 'suppose')]), /AUTHORIZED brand|membership|tag/);
});

test('A4 NEGATED rejected from graph', () => {
  assert.throws(() => resolveAuthorizedRelations([negated(fixedCandidate(), 'denied')]), /AUTHORIZED brand|membership|tag/);
});

test('A5 UNRESOLVED rejected from graph', () => {
  assert.throws(() => resolveAuthorizedRelations([unresolved(fixedCandidate(), 'vague')]), /AUTHORIZED brand|membership|tag/);
});

test('A6 plain fake AUTHORIZED shape rejected', () => {
  const c = fixedCandidate();
  assert.throws(
    () => resolveAuthorizedRelations([{ tag: 'AUTHORIZED', scope: 'CURRENT', candidate: c, requestEvidence: 'imperative' }]),
    /AUTHORIZED brand|membership|tag/,
  );
});

test('A7 spread clone of real record rejected', () => {
  assert.throws(() => resolveAuthorizedRelations([{ ...realAuth() }]), /AUTHORIZED brand|membership|tag/);
});

// CYCLE B — empty graph + single governing self-relation.

test('B1 empty array yields null governing and no relations', () => {
  assert.deepEqual(resolveAuthorizedRelations([]), { governing: null, relations: [] });
});

test('B2 single AUTHORIZED yields GOVERNING self-relation on clauseId:surface', () => {
  const rec = mint({ clauseId: 'c0', surface: 'mend' });
  const out = resolveAuthorizedRelations([rec]);
  assert.equal(out.governing, rec);
  assert.deepEqual(out.relations, [{ kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' }]);
});

// CYCLE G — output shape: ONLY governing+relations keys, frozen throughout,
// no capability/advisor/risk/candidate-object leakage into the graph.

test('G1 result carries exactly governing+relations keys and is frozen', () => {
  const out = resolveAuthorizedRelations([
    mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' }),
    mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' }),
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['governing', 'relations']);
  assert.ok(Object.isFrozen(out));
  assert.ok(Object.isFrozen(out.relations));
  for (const rel of out.relations) {
    assert.ok(Object.isFrozen(rel));
    assert.deepEqual(Object.keys(rel).sort(), ['from', 'kind', 'to']);
    assert.equal(typeof rel.from, 'string');
    assert.equal(typeof rel.to, 'string');
  }
});

test('G2 empty result is keys-exact and frozen', () => {
  const out = resolveAuthorizedRelations([]);
  assert.deepEqual(Object.keys(out).sort(), ['governing', 'relations']);
  assert.ok(Object.isFrozen(out));
  assert.ok(Object.isFrozen(out.relations));
});

test('G3 no capability/advisor/candidate leakage in relations (governing is the record itself by spec)', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch', capability: 'repair' });
  const out = resolveAuthorizedRelations([
    gov,
    mint({ clauseId: 'c1', surface: 'sweep', target: 'workshop floor', capability: 'deployment' }),
  ]);
  assert.equal(out.governing, gov);
  const dumped = JSON.stringify(out.relations);
  for (const banned of ['capability', 'advisor', 'risk', 'requestEvidence', 'candidate']) {
    assert.ok(!dumped.includes(banned), `relations must not leak "${banned}"`);
  }
});

// CYCLE F — determinism: same input twice → deep-equal; candidate metadata
// outside clauseId/surface/target (capability, environment) cannot move ids.

test('F1 same input resolved twice is deep-equal', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const ally = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const input = [gov, ally];
  assert.deepEqual(resolveAuthorizedRelations(input), resolveAuthorizedRelations(input));
});

test('F2 shuffled capability/environment metadata leaves relations identical', () => {
  const a = resolveAuthorizedRelations([
    mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch', capability: 'repair', environment: 'local' }),
    mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch', capability: 'maintenance', environment: 'staging' }),
  ]);
  const b = resolveAuthorizedRelations([
    mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch', capability: 'understanding', environment: 'remote' }),
    mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch', capability: 'verification', environment: 'unspecified' }),
  ]);
  assert.deepEqual(a.relations, b.relations);
});

// CYCLE E — contextual-dangerous-steal family via the real pipeline: the
// production-shaped deploy recount stays CONTEXTUAL and can never enter the
// graph, while governing stays input[0] regardless of capability weight.

test('E1 pipeline verdicts: investigate/review/build AUTHORIZED, history deploy CONTEXTUAL', () => {
  assert.equal(adjudicateClause('c0', 'Investigate the login crash').tag, 'AUTHORIZED');
  assert.equal(adjudicateClause('c1', 'Review the test suite').tag, 'AUTHORIZED');
  assert.equal(adjudicateClause('c2', 'Build the login crash').tag, 'AUTHORIZED');
  assert.equal(adjudicateClause('c3', 'Deploy the auth code').tag, 'AUTHORIZED');
  assert.equal(adjudicateClause('c4', 'Last week the crew deployed the auth code').tag, 'CONTEXTUAL');
});

test('E2 CONTEXTUAL deploy recount rejected from graph alone and trailing', () => {
  const recount = adjudicateClause('c4', 'Last week the crew deployed the auth code');
  assert.throws(() => resolveAuthorizedRelations([recount]), /AUTHORIZED brand|membership|tag/);
  const probe = adjudicateClause('c0', 'Investigate the login crash');
  assert.throws(() => resolveAuthorizedRelations([probe, recount]), /AUTHORIZED brand|membership|tag/);
});

test('E3 dangerous-first order: deploy AUTHORIZED still governs', () => {
  const deploy = adjudicateClause('c0', 'Deploy the auth code');
  const probe = adjudicateClause('c1', 'Investigate the login crash');
  const out = resolveAuthorizedRelations([deploy, probe]);
  assert.equal(out.governing, deploy);
  assert.equal(out.relations[0].kind, 'GOVERNING');
});

test('E4 weak-first order: investigate AUTHORIZED still governs over deploy', () => {
  const probe = adjudicateClause('c0', 'Investigate the login crash');
  const deploy = adjudicateClause('c1', 'Deploy the auth code');
  const out = resolveAuthorizedRelations([probe, deploy]);
  assert.equal(out.governing, probe);
  assert.deepEqual(out.relations[1], {
    kind: 'ORTHOGONAL',
    from: 'c0:investigate',
    to: 'c1:deploy',
  });
});

// CYCLE D — mixed AUTHORIZED + non-authorized input throws; the caller
// filters before calling, the graph never silently drops the intruder.

test('D1 trailing CONTEXTUAL after AUTHORIZED throws', () => {
  assert.throws(
    () => resolveAuthorizedRelations([mint(), contextual(fixedCandidate(), 'quote')]),
    /AUTHORIZED brand|membership|tag/,
  );
});

test('D2 leading NEGATED before AUTHORIZED throws (position is no shield)', () => {
  assert.throws(
    () => resolveAuthorizedRelations([negated(fixedCandidate(), 'denied'), mint()]),
    /AUTHORIZED brand|membership|tag/,
  );
});

test('D3 intruder between two AUTHORIZED records throws', () => {
  assert.throws(
    () => resolveAuthorizedRelations([mint(), unresolved(fixedCandidate(), 'vague'), mint()]),
    /AUTHORIZED brand|membership|tag/,
  );
});

// CYCLE C — target-overlap precedence on direct fixed inputs: same non-null
// target as governing (later position) → SUPPORTING, else ORTHOGONAL.

test('C1 same non-null target after governing yields SUPPORTING', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const later = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const out = resolveAuthorizedRelations([gov, later]);
  assert.equal(out.governing, gov);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' },
    { kind: 'SUPPORTING', from: 'c0:mend', to: 'c1:oil' },
  ]);
});

test('C2 different target after governing yields ORTHOGONAL', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const later = mint({ clauseId: 'c1', surface: 'sweep', target: 'workshop floor' });
  const out = resolveAuthorizedRelations([gov, later]);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' },
    { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c1:sweep' },
  ]);
});

test('C3 null targets never support — null vs null is ORTHOGONAL', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: null });
  const later = mint({ clauseId: 'c1', surface: 'oil', target: null });
  const out = resolveAuthorizedRelations([gov, later]);
  assert.deepEqual(out.relations[1], { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c1:oil' });
});

test('C4 three-way fan: SUPPORTING plus ORTHOGONAL off one governing', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const ally = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const other = mint({ clauseId: 'c2', surface: 'sweep', target: 'workshop floor' });
  const out = resolveAuthorizedRelations([gov, ally, other]);
  assert.equal(out.governing, gov);
  assert.deepEqual(out.relations.map((r) => r.kind), ['GOVERNING', 'SUPPORTING', 'ORTHOGONAL']);
  assert.deepEqual(out.relations[1], { kind: 'SUPPORTING', from: 'c0:mend', to: 'c1:oil' });
  assert.deepEqual(out.relations[2], { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c2:sweep' });
});

test('A8 reconstructed shape-alike rejected', () => {
  const r = realAuth();
  assert.throws(
    () => resolveAuthorizedRelations([{
      tag: r.tag,
      scope: r.scope,
      candidate: r.candidate,
      requestEvidence: r.requestEvidence,
    }]),
    /AUTHORIZED brand|membership|tag/,
  );
});
