import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { gatherEvidence } from '../src/intent-resolver/frame/authority/evidence.js';
import {
  adjudicate,
  assertAuthorized,
  contextual,
  conditional,
  hypothetical,
  negated,
  unresolved,
} from '../src/intent-resolver/frame/authority/adjudicator.js';
import {
  projectPrimary6G,
  projectMutation6G,
  projectSecondary6G,
  capMutation,
} from '../src/intent-resolver/frame/authority/projectors.js';

// T12 typed authority projectors (shadow/non-authoritative, no production wiring).
// All AUTHORIZED inputs below travel the REAL pipeline: raw prompt text
// → candidate → evidence → adjudicated verdict. Forgery negatives use the
// adjudicated variant factories or plain objects; no production modules change.
const auth = (prompt, id = 'c0') => {
  const [candidate] = extractCandidates([{ id, text: prompt }]);
  const verdict = adjudicate(candidate, gatherEvidence({ surface: candidate.surface, clauseText: prompt }));
  assert.equal(verdict.tag, 'AUTHORIZED', `expected AUTHORIZED for ${JSON.stringify(prompt)}`);
  return verdict;
};

const anyVerdict = (prompt, id = 'c0') => {
  const [candidate] = extractCandidates([{ id, text: prompt }]);
  return adjudicate(candidate, gatherEvidence({ surface: candidate.surface, clauseText: prompt }));
};

// Cycle A — conservative fallback basics: null/empty inputs route to the
// public understand/discovery/read-only triple, never to review.
test('A1 primary fallback for null governing', () => {
  assert.deepEqual(
    projectPrimary6G(null),
    { phase: 'discovery', action: 'understand', primaryCapability: 'understand' },
  );
});

test('A2 empty mutation input is read-only', () => {
  assert.equal(projectMutation6G([]), 'read-only');
});

test('A3 empty secondary input is empty', () => {
  assert.deepEqual(projectSecondary6G([]), []);
});

// Cycle B — fallback contract: an UNRESOLVED-only prompt (no authorized
// action exists) yields the understand fallback and MUST NOT route review.
// The fallback never mints: output shape is exact and no output value
// carries the AUTHORIZED brand (brand-absence walk).
test('B1 UNRESOLVED-only prompt falls back to understand, not review', () => {
  const verdict = anyVerdict('The checkout screen');
  assert.equal(verdict.tag, 'UNRESOLVED');
  const primary = projectPrimary6G(null);
  assert.equal(primary.action, 'understand');
  assert.equal(primary.phase, 'discovery');
  assert.equal(primary.primaryCapability, 'understand');
  assert.notEqual(primary.action, 'review');
  assert.notEqual(primary.primaryCapability, 'review');
});

test('B2 fallback output shape is exact and brand-free', () => {
  const primary = projectPrimary6G(null);
  assert.deepEqual(Object.keys(primary).sort(), ['action', 'phase', 'primaryCapability']);
  assert.equal(Object.getOwnPropertySymbols(primary).length, 0);
  const walk = (value) => {
    if (value !== null && typeof value === 'object') {
      assert.equal(Object.getOwnPropertySymbols(value).length, 0);
      assert.throws(() => assertAuthorized(value), /brand|tag|scope|candidate|authority/);
      for (const v of Object.values(value)) walk(v);
    }
  };
  walk(primary);
  assert.equal(projectMutation6G([]), 'read-only');
  assert.deepEqual(projectSecondary6G([]), []);
});

// Cycle C — forgery battery: forged AUTHORIZED-shaped records and every
// non-authorized variant throw on ALL THREE projectors (never filtered).
test('C1 plain forged record throws on all three projectors', () => {
  const forged = { tag: 'AUTHORIZED', candidate: {} };
  assert.throws(() => projectPrimary6G(forged), /brand/);
  assert.throws(() => projectMutation6G([forged]), /brand/);
  assert.throws(() => projectSecondary6G([forged]), /brand/);
});

test('C2 spread-clone of a real record throws on all three projectors', () => {
  const real = auth('Repair the checkout screen');
  const clone = { ...real };
  assert.throws(() => projectPrimary6G(clone), /brand|membership/);
  assert.throws(() => projectMutation6G([clone]), /brand|membership/);
  assert.throws(() => projectSecondary6G([clone]), /brand|membership/);
});

test('C3 non-authorized variants throw on all three projectors', () => {
  const real = auth('Repair the checkout screen');
  const variants = [
    contextual(real.candidate, 'history'),
    conditional(real.candidate, 'once merged'),
    hypothetical(real.candidate, 'suppose it broke'),
    negated(real.candidate, 'do not repair'),
    unresolved(real.candidate, 'vague request'),
  ];
  for (const variant of variants) {
    assert.throws(() => projectPrimary6G(variant), /brand|tag/, `primary accepts ${variant.tag}`);
    assert.throws(() => projectMutation6G([variant]), /brand|tag/, `mutation accepts ${variant.tag}`);
    assert.throws(() => projectSecondary6G([variant]), /brand|tag/, `secondary accepts ${variant.tag}`);
  }
});

test('C4 mixed array with one forgery throws (never filtered)', () => {
  const real = auth('Repair the checkout screen');
  const forged = { tag: 'AUTHORIZED', candidate: {} };
  assert.throws(() => projectMutation6G([real, forged]), /brand/);
  assert.throws(() => projectSecondary6G([real, forged]), /brand/);
});

// Cycle D — authorized primary matrix: phase/action/primaryCapability derive
// from the governing AUTHORIZED capability only (owned taxonomy tables).
test('D1 implement governing routes implementation/implement', () => {
  const out = projectPrimary6G(auth('Repair the checkout screen'));
  assert.deepEqual(out, { phase: 'implementation', action: 'fix', primaryCapability: 'implement' });
});

test('D2 review governing routes verification/review', () => {
  const out = projectPrimary6G(auth('Review the checkout screen'));
  assert.deepEqual(out, { phase: 'verification', action: 'review', primaryCapability: 'review' });
});

test('D3 test governing routes verification/test', () => {
  const out = projectPrimary6G(auth('Test the checkout screen'));
  assert.deepEqual(out, { phase: 'verification', action: 'test', primaryCapability: 'test' });
});

test('D4 deploy governing routes operations/deploy/ops', () => {
  const out = projectPrimary6G(auth('Deploy the service to staging'));
  assert.deepEqual(out, { phase: 'operations', action: 'deploy', primaryCapability: 'ops' });
});

test('D5 investigate governing routes diagnosis/investigate/debug', () => {
  const out = projectPrimary6G(auth('Investigate the login crash'));
  assert.deepEqual(out, { phase: 'diagnosis', action: 'investigate', primaryCapability: 'debug' });
});

test('D6 primary output is frozen', () => {
  assert.ok(Object.isFrozen(projectPrimary6G(auth('Repair the checkout screen'))));
  assert.ok(Object.isFrozen(projectPrimary6G(null)));
});

// Cycle E — authorized mutation matrix: per-action base (CANONICAL mirror)
// plus environment qualifier; overall is the ladder max.
test('E1 implement-local is local-write', () => {
  assert.equal(projectMutation6G([auth('Implement the checkout screen locally')]), 'local-write');
});

test('E2 deploy-staging is remote-write', () => {
  assert.equal(projectMutation6G([auth('Deploy the service to staging')]), 'remote-write');
});

test('E3 deploy-production is production-impacting', () => {
  assert.equal(projectMutation6G([auth('Deploy the service to production')]), 'production-impacting');
});

test('E4 review is read-only', () => {
  assert.equal(projectMutation6G([auth('Review the checkout screen')]), 'read-only');
});

test('E5 read-only stays read-only under production pressure', () => {
  assert.equal(projectMutation6G([auth('Inspect the auth code')]), 'read-only');
});

test('E6 overall mutation is the ladder max', () => {
  assert.equal(projectMutation6G([
    auth('Review the checkout screen', 'c0'),
    auth('Implement the checkout screen locally', 'c1'),
  ]), 'local-write');
});

// Cycle F — supporting ceiling preparation: capMutation is the pure
// ladder-min used at barrel composition (T13); projectMutation6G itself is
// uncapped (roles live in relations output, consumed at the barrel).
test('F1 capMutation is the ladder minimum', () => {
  assert.equal(capMutation('production-impacting', 'read-only'), 'read-only');
  assert.equal(capMutation('read-only', 'production-impacting'), 'read-only');
  assert.equal(capMutation('local-write', 'remote-write'), 'local-write');
  assert.equal(capMutation('remote-write', 'local-write'), 'local-write');
  assert.equal(capMutation('production-impacting', 'production-impacting'), 'production-impacting');
});

test('F2 governing read-only caps supporting deploy-production', () => {
  const governing = auth('Review the checkout screen', 'c0');
  const supporting = auth('Deploy the service to production', 'c1');
  const uncapped = projectMutation6G([governing, supporting]);
  assert.equal(uncapped, 'production-impacting');
  const capped = capMutation(uncapped, projectMutation6G([governing]));
  assert.equal(capped, 'read-only');
});

// Cycle G — orthogonal actions contribute independently: no ceiling is
// applied inside projectMutation6G (ceiling composition happens at the
// barrel via capMutation, Cycle F).
test('G1 orthogonal deploy-production contributes uncapped', () => {
  assert.equal(projectMutation6G([
    auth('Review the checkout screen', 'c0'),
    auth('Deploy the service to production', 'c1'),
  ]), 'production-impacting');
});

// Cycle H — secondaries come from ORTHOGONAL AUTHORIZED only (semantic
// capability -> token), dedupe against the explicit primaryCapability param,
// capped at 2. Non-authorized inputs throw; risk/object/evidence never feed
// the projector (the signature carries no such inputs).
test('H1 orthogonal testing maps to test token', () => {
  assert.deepEqual(projectSecondary6G([auth('Test the checkout screen')]), ['test']);
});

test('H2 primary token dedupes against the explicit second param', () => {
  assert.deepEqual(projectSecondary6G(
    [auth('Repair the checkout screen', 'c0'), auth('Test the checkout screen', 'c1')],
    'implement',
  ), ['test']);
  assert.deepEqual(projectSecondary6G(
    [auth('Repair the checkout screen', 'c0'), auth('Test the checkout screen', 'c1')],
    null,
  ), ['implement', 'test']);
});

test('H3 secondaries cap at two', () => {
  const out = projectSecondary6G([
    auth('Repair the checkout screen', 'c0'),
    auth('Test the checkout screen', 'c1'),
    auth('Deploy the service to staging', 'c2'),
    auth('Investigate the login crash', 'c3'),
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out, [...out].sort());
});

test('H4 duplicate capabilities dedupe to one token', () => {
  assert.deepEqual(projectSecondary6G([
    auth('Test the checkout screen', 'c0'),
    auth('Verify the checkout screen', 'c1'),
  ]), ['test']);
});

test('H5 non-authorized records throw (governing/supporting roles and all variant tags)', () => {
  const real = auth('Test the checkout screen');
  const variants = [
    contextual(real.candidate, 'history'),
    conditional(real.candidate, 'once merged'),
    hypothetical(real.candidate, 'suppose it broke'),
    negated(real.candidate, 'do not test'),
    unresolved(real.candidate, 'vague request'),
  ];
  for (const variant of variants) {
    assert.throws(() => projectSecondary6G([variant]), /brand|tag/, `secondary accepts ${variant.tag}`);
  }
  assert.throws(() => projectSecondary6G([{ tag: 'AUTHORIZED', candidate: {} }]), /brand/);
});

// Cycle I — metadata invariance: the same authorized graph with varied
// sidecars (target, environment) projects identically for primary and
// secondary (sidecars never enter the taxonomy tables).
test('I1 primary invariant across target and environment sidecars', () => {
  const a = projectPrimary6G(auth('Repair the checkout screen', 'c0'));
  const b = projectPrimary6G(auth('Repair the login crash locally', 'c1'));
  assert.deepEqual(a, b);
});

test('I2 secondary invariant across environment sidecars', () => {
  const a = projectSecondary6G([auth('Test the checkout screen', 'c0')]);
  const b = projectSecondary6G([auth('Verify the checkout screen', 'c1')]);
  assert.deepEqual(a, b);
});

// Cycle J — leak walk: no projector output value passes assertAuthorized
// (no brand escapes; outputs are plain data, never re-admittable records).
test('J1 no output value carries the AUTHORIZED brand', () => {
  const outputs = [
    projectPrimary6G(null),
    projectPrimary6G(auth('Repair the checkout screen', 'c0')),
    projectPrimary6G(auth('Deploy the service to production', 'c1')),
    projectMutation6G([]),
    projectMutation6G([auth('Deploy the service to production', 'c2')]),
    projectSecondary6G([]),
    projectSecondary6G([auth('Test the checkout screen', 'c3')]),
    capMutation('production-impacting', 'read-only'),
  ];
  const walk = (value) => {
    assert.throws(() => assertAuthorized(value), /brand|tag|scope|candidate|authority/,
      `leaked authorized value: ${JSON.stringify(value)}`);
    if (value !== null && typeof value === 'object') {
      assert.equal(Object.getOwnPropertySymbols(value).length, 0);
      for (const v of Object.values(value)) walk(v);
    }
  };
  for (const out of outputs) walk(out);
});

// Cycle K — plan representative assertions, verbatim.
test('K1 plan representative assertions', () => {
  assert.throws(() => projectMutation6G([{ tag: 'AUTHORIZED', candidate: {} }]), /brand/);
  assert.equal(projectMutation6G([]), 'read-only');
  assert.deepEqual(projectPrimary6G(null), { phase: 'discovery', action: 'understand', primaryCapability: 'understand' });
  assert.deepEqual(projectMutation6G([]), 'read-only');
  assert.deepEqual(projectSecondary6G([]), []);
});
