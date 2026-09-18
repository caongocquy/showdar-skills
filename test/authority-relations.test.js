import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// CYCLE C — T11 marker-only rule on direct fixed inputs: a later action is
// SUPPORTING iff its clause text carries a closed-discourse subordination
// marker (purpose-so / in-order-to / before / after / once / then / first);
// bare juxtaposition (same or different target) → ORTHOGONAL. Target
// equality is neither sufficient nor necessary (T11 §8 + ledger override).

test('C1 bare same-target juxtaposition yields ORTHOGONAL (target equality insufficient)', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const later = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const out = resolveAuthorizedRelations([gov, later]);
  assert.equal(out.governing, gov);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' },
    { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c1:oil' },
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

test('C4 marked ally supports while bare outsider stays ORTHOGONAL', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const ally = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const other = mint({ clauseId: 'c2', surface: 'sweep', target: 'workshop floor' });
  const out = resolveAuthorizedRelations([gov, ally, other], {
    c0: 'Mend the gate latch',
    c1: 'Oil the gate latch then',
    c2: 'Sweep the workshop floor',
  });
  assert.equal(out.governing, gov);
  assert.deepEqual(out.relations.map((r) => r.kind), ['GOVERNING', 'SUPPORTING', 'ORTHOGONAL']);
  assert.deepEqual(out.relations[1], { kind: 'SUPPORTING', from: 'c0:mend', to: 'c1:oil' });
  assert.deepEqual(out.relations[2], { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c2:sweep' });
});

test('C5 marked different-target yields SUPPORTING (target equality unnecessary)', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const later = mint({ clauseId: 'c1', surface: 'sweep', target: 'workshop floor' });
  const out = resolveAuthorizedRelations([gov, later], {
    c0: 'Mend the gate latch',
    c1: 'Sweep the workshop floor then',
  });
  assert.equal(out.governing, gov);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' },
    { kind: 'SUPPORTING', from: 'c0:mend', to: 'c1:sweep' },
  ]);
});

test('C6 bare "so" without purpose complement stays ORTHOGONAL (purpose-so narrowing)', () => {
  const gov = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const later = mint({ clauseId: 'c1', surface: 'oil', target: 'gate latch' });
  const out = resolveAuthorizedRelations([gov, later], {
    c0: 'Mend the gate latch',
    c1: 'Oil the gate latch so carefully',
  });
  assert.deepEqual(out.relations[1], { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c1:oil' });
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

// CYCLE T11 — 6G.4 exit gate (§7 families A–E, §9–§11, §14). T11 rule:
// SUPPORTING iff marked-subordinate via the closed discourse class
// (purpose-so / in-order-to / before / after / once / then / first);
// bare juxtaposition → ORTHOGONAL either way; target unread.

test('T11 §7A marked support before main defers governing to later', () => {
  const support = mint({ clauseId: 'c0', surface: 'inspect', target: 'depot yard' });
  const main = mint({ clauseId: 'c1', surface: 'rebuild', target: 'loading dock' });
  const out = resolveAuthorizedRelations([support, main], {
    c0: 'Inspect the depot yard so you can confirm readiness',
    c1: 'Rebuild the loading dock',
  });
  assert.equal(out.governing, main);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c1:rebuild', to: 'c1:rebuild' },
    { kind: 'SUPPORTING', from: 'c1:rebuild', to: 'c0:inspect' },
  ]);
});

test('T11 §7B marked support after main keeps first governing', () => {
  const main = mint({ clauseId: 'c0', surface: 'rebuild', target: 'loading dock' });
  const support = mint({ clauseId: 'c1', surface: 'inspect', target: 'depot yard' });
  const out = resolveAuthorizedRelations([main, support], {
    c0: 'Rebuild the loading dock',
    c1: 'Inspect the depot yard first',
  });
  assert.equal(out.governing, main);
  assert.deepEqual(out.relations, [
    { kind: 'GOVERNING', from: 'c0:rebuild', to: 'c0:rebuild' },
    { kind: 'SUPPORTING', from: 'c0:rebuild', to: 'c1:inspect' },
  ]);
});

test('T11 §7C bare independent pair is ORTHOGONAL in either order', () => {
  const a = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const b = mint({ clauseId: 'c1', surface: 'sweep', target: 'workshop floor' });
  const fwd = resolveAuthorizedRelations([a, b], {
    c0: 'Mend the gate latch',
    c1: 'Sweep the workshop floor',
  });
  assert.equal(fwd.governing, a);
  assert.deepEqual(fwd.relations[1], { kind: 'ORTHOGONAL', from: 'c0:mend', to: 'c1:sweep' });
  const rev = resolveAuthorizedRelations([b, a], {
    c1: 'Sweep the workshop floor',
    c0: 'Mend the gate latch',
  });
  assert.equal(rev.governing, b);
  assert.deepEqual(rev.relations[1], { kind: 'ORTHOGONAL', from: 'c1:sweep', to: 'c0:mend' });
});

test('T11 §7D single authorized governs itself marked or not', () => {
  const bare = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const outBare = resolveAuthorizedRelations([bare]);
  assert.equal(outBare.governing, bare);
  assert.deepEqual(outBare.relations, [{ kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' }]);
  const marked = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const outMarked = resolveAuthorizedRelations([marked], { c0: 'Mend the gate latch then' });
  assert.equal(outMarked.governing, marked);
  assert.deepEqual(outMarked.relations, [{ kind: 'GOVERNING', from: 'c0:mend', to: 'c0:mend' }]);
});

test('T11 §7E non-authorized intruder throws on direct pass; filtered subgraph unchanged', () => {
  const a = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const b = mint({ clauseId: 'c1', surface: 'oil', target: 'depot yard' });
  const ctx = { c0: 'Mend the gate latch', c1: 'Oil the depot yard then' };
  const base = resolveAuthorizedRelations([a, b], ctx);
  const intruder = contextual(fixedCandidate({ clauseId: 'vx', surface: 'recount' }), 'history');
  assert.throws(() => resolveAuthorizedRelations([a, intruder, b], ctx), /AUTHORIZED brand|membership|tag/);
  assert.throws(() => resolveAuthorizedRelations([intruder, a, b], ctx), /AUTHORIZED brand|membership|tag/);
  for (const seq of [[a, intruder, b], [intruder, a, b], [a, b, intruder]]) {
    const out = resolveAuthorizedRelations(seq.filter((v) => v.tag === 'AUTHORIZED'), ctx);
    assert.equal(out.governing, base.governing);
    assert.deepEqual(out.relations, base.relations);
  }
});

test('T11 §7 closed-class markers each subordinate (in-order-to/before/after/once)', () => {
  const marked = [
    'Inspect the depot yard in order to confirm readiness',
    'Inspect the depot yard before the rebuild starts',
    'Inspect the depot yard after the rebuild starts',
    'Inspect the depot yard once the rebuild starts',
  ];
  for (const text of marked) {
    const sup = mint({ clauseId: 'c0', surface: 'inspect', target: 'depot yard' });
    const main = mint({ clauseId: 'c1', surface: 'rebuild', target: 'loading dock' });
    const out = resolveAuthorizedRelations([sup, main], { c0: text, c1: 'Rebuild the loading dock' });
    assert.equal(out.governing, main, `${text} must defer governing`);
    assert.equal(out.relations[1].kind, 'SUPPORTING', `${text} must support`);
  }
});

test('T11 §7 purpose-so complements each subordinate', () => {
  const tails = [
    'so we can confirm readiness',
    'so it stays ready',
    'so they can confirm readiness',
    'so that readiness holds',
    'so the dock stays ready',
  ];
  for (const tail of tails) {
    const sup = mint({ clauseId: 'c0', surface: 'inspect', target: 'depot yard' });
    const main = mint({ clauseId: 'c1', surface: 'rebuild', target: 'loading dock' });
    const out = resolveAuthorizedRelations([sup, main], {
      c0: `Inspect the depot yard ${tail}`,
      c1: 'Rebuild the loading dock',
    });
    assert.equal(out.governing, main, `${tail} must defer governing`);
    assert.equal(out.relations[1].kind, 'SUPPORTING', `${tail} must support`);
  }
});

test('T11 §9 insertion invariance: all five non-authorized variants × before/after', () => {
  const a = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const b = mint({ clauseId: 'c1', surface: 'oil', target: 'depot yard' });
  const ctx = { c0: 'Mend the gate latch', c1: 'Oil the depot yard then' };
  const base = resolveAuthorizedRelations([a, b], ctx);
  const variants = [
    contextual(fixedCandidate({ clauseId: 'vx' }), 'history'),
    negated(fixedCandidate({ clauseId: 'vx' }), 'denied'),
    conditional(fixedCandidate({ clauseId: 'vx' }), 'if ready'),
    hypothetical(fixedCandidate({ clauseId: 'vx' }), 'suppose'),
    unresolved(fixedCandidate({ clauseId: 'vx' }), 'vague'),
  ];
  assert.deepEqual(variants.map((v) => v.tag), [
    'CONTEXTUAL',
    'NEGATED',
    'CONDITIONAL',
    'HYPOTHETICAL',
    'UNRESOLVED',
  ]);
  for (const v of variants) {
    for (const seq of [[v, a, b], [a, b, v]]) {
      const out = resolveAuthorizedRelations(seq.filter((r) => r.tag === 'AUTHORIZED'), ctx);
      assert.equal(out.governing, base.governing, `${v.tag} insertion must not move governing`);
      assert.deepEqual(out.relations, base.relations, `${v.tag} insertion must not move relations`);
    }
  }
});

test('T11 §10 metadata invariance: sidecars leave verdict and relations unchanged', () => {
  const cand = fixedCandidate({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const ev = authEvidence();
  const v0 = adjudicate(cand, ev);
  for (const sidecar of [
    { risk: 'high', object: 'gate latch', evidenceNote: 'none' },
    { risk: 'low', object: 'depot', evidenceNote: 'log attached' },
    undefined,
  ]) {
    assert.deepEqual(adjudicate(cand, ev, sidecar), v0);
  }
  const ctx = { c0: 'Mend the gate latch', c1: 'Oil the depot yard then' };
  const ra = resolveAuthorizedRelations([
    mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch', capability: 'repair', environment: 'local' }),
    mint({ clauseId: 'c1', surface: 'oil', target: 'depot yard', capability: 'maintenance', environment: 'staging' }),
  ], ctx);
  const rb = resolveAuthorizedRelations([
    mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch', capability: 'understanding', environment: 'remote' }),
    mint({ clauseId: 'c1', surface: 'oil', target: 'depot yard', capability: 'verification', environment: 'unspecified' }),
  ], ctx);
  assert.deepEqual(rb.relations, ra.relations);
  assert.equal(rb.governing.candidate.clauseId, ra.governing.candidate.clauseId);
});

test('T11 §11 determinism: repeat deep-equal; context key order and Map form inert', () => {
  const a = mint({ clauseId: 'c0', surface: 'mend', target: 'gate latch' });
  const b = mint({ clauseId: 'c1', surface: 'oil', target: 'depot yard' });
  const input = [a, b];
  const ctx = { c0: 'Mend the gate latch', c1: 'Oil the depot yard then' };
  const first = resolveAuthorizedRelations(input, ctx);
  assert.deepEqual(resolveAuthorizedRelations(input, ctx), first);
  const shuffled = { c1: 'Oil the depot yard then', c0: 'Mend the gate latch' };
  const viaShuffled = resolveAuthorizedRelations(input, shuffled);
  assert.deepEqual(viaShuffled.relations, first.relations);
  assert.equal(viaShuffled.governing, first.governing);
  const asMap = new Map([['c0', 'Mend the gate latch'], ['c1', 'Oil the depot yard then']]);
  const viaMap = resolveAuthorizedRelations(input, asMap);
  assert.deepEqual(viaMap.relations, first.relations);
  assert.equal(viaMap.governing, first.governing);
});

test('T11 §14 overfit scan: closed structural class only, no authority inputs or domain tokens', () => {
  const src = readFileSync(
    new URL('../src/intent-resolver/frame/authority/relations.js', import.meta.url),
    'utf8',
  );
  for (const frag of ['in\\s+order\\s+to', 'so\\s+', 'before', 'after', 'once', 'then', 'first']) {
    assert.ok(src.includes(frag), `closed marker class must include ${frag}`);
  }
  for (const acc of ['.target', '.capability', '.environment', 'govTarget']) {
    assert.ok(!src.includes(acc), `relations must not read ${acc}`);
  }
  for (const tok of ['capability', 'environment', 'advisor', 'scoring', 'legacy']) {
    assert.ok(!src.includes(tok), `relations must not carry ${tok}`);
  }
  assert.ok(!src.toLowerCase().includes('skill'), 'relations must not carry skill tokens');
  for (const domain of ['gateway', 'checkout', 'pipeline', 'migration', 'database', 'deploy', 'repair', 'inspect', 'migrate', 'upgrade', 'audit', 'verify', 'investigate', 'patch', 'rebuild']) {
    assert.ok(!src.includes(domain), `relations must not hardcode domain token ${domain}`);
  }
  assert.ok(src.length < 3000, 'relations must stay a small structural rule, not a prompt list');
});
