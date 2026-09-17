import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceCandidate } from '../src/intent-resolver/frame/authority/diagnostics.js';
import {
  adjudicate,
  assertAuthorized,
} from '../src/intent-resolver/frame/authority/adjudicator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '../src');

const cand = (over = {}) => Object.freeze({
  kind: 'ActionCandidate',
  capability: 'repair',
  target: null,
  clauseId: 'c0',
  surface: 'mend',
  environment: 'unspecified',
  ...over,
});

const ev = (over = {}) => Object.freeze({
  requestForm: null,
  negation: false,
  condition: false,
  modal: false,
  contextKinds: Object.freeze([]),
  temporal: null,
  positiveRequest: false,
  ...over,
});

// AUTHORIZED trace — "Please mend the lobby turnstile"
test('AUTHORIZED trace carries verdict, request reason, and brand flag', () => {
  const candidate = cand();
  const evidence = ev({ requestForm: 'polite-request', positiveRequest: true });
  const adjudicated = adjudicate(candidate, evidence);
  assert.equal(adjudicated.tag, 'AUTHORIZED');
  const trace = traceCandidate({ candidate, evidence, adjudicated });
  assert.equal(trace.verdict, 'AUTHORIZED');
  assert.equal(trace.reason, 'request:polite-request');
  assert.equal(trace.surface, 'mend');
  assert.equal(trace.capability, 'repair');
  assert.equal(trace.clauseId, 'c0');
  assert.equal(trace.evidence, evidence);
  assert.equal(trace.isAuthorized, true);
  assert.equal(trace.relation, null);
  assert.deepEqual(trace.contributes, { primary: false, mutation: false, secondary: false });
  assert.ok(Object.isFrozen(trace));
  assert.ok(Object.isFrozen(trace.contributes));
});

// All 5 non-auth verdicts with correct reasons (NEW wording scenario labels only)
test('CONTEXTUAL trace — "The steward quoted last quarter mend log"', () => {
  const candidate = cand();
  const evidence = ev({ contextKinds: Object.freeze(['quote']) });
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  assert.equal(trace.verdict, 'CONTEXTUAL');
  assert.equal(trace.reason, 'context:quote');
  assert.equal(trace.isAuthorized, false);
});

test('NEGATED trace — "Never mend the lobby turnstile"', () => {
  const candidate = cand();
  const evidence = ev({ negation: true });
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  assert.equal(trace.verdict, 'NEGATED');
  assert.equal(trace.reason, 'negation');
  assert.equal(trace.isAuthorized, false);
});

test('CONDITIONAL trace — "Mend the turnstile once the steward signs off"', () => {
  const candidate = cand();
  const evidence = ev({ condition: true });
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  assert.equal(trace.verdict, 'CONDITIONAL');
  assert.equal(trace.reason, 'condition');
  assert.equal(trace.isAuthorized, false);
});

test('HYPOTHETICAL trace — "Suppose we mended the turnstile next season"', () => {
  const candidate = cand();
  const evidence = ev({ modal: true });
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  assert.equal(trace.verdict, 'HYPOTHETICAL');
  assert.equal(trace.reason, 'modal');
  assert.equal(trace.isAuthorized, false);
});

test('UNRESOLVED trace — "Turnstile ... mend ... maybe"', () => {
  const candidate = cand();
  const evidence = ev({});
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  assert.equal(trace.verdict, 'UNRESOLVED');
  assert.equal(trace.reason, 'no positive request evidence');
  assert.equal(trace.isAuthorized, false);
});

// Overlap retained: quote + condition + requestForm → CONTEXTUAL, evidence intact
test('overlap keeps CONTEXTUAL with evidence intact — quoted conditional request', () => {
  const candidate = cand();
  const evidence = ev({
    requestForm: 'imperative',
    positiveRequest: true,
    condition: true,
    contextKinds: Object.freeze(['quote']),
  });
  const adjudicated = adjudicate(candidate, evidence);
  assert.equal(adjudicated.tag, 'CONTEXTUAL');
  const trace = traceCandidate({ candidate, evidence, adjudicated });
  assert.equal(trace.verdict, 'CONTEXTUAL');
  assert.equal(trace.reason, 'context:quote');
  assert.equal(trace.evidence, evidence);
  assert.deepEqual(trace.evidence, evidence);
});

// Snapshot → reconstruct → assertAuthorized rejects (brand does not survive JSON)
test('reconstructed AUTHORIZED record fails assertAuthorized', () => {
  const candidate = cand();
  const evidence = ev({ requestForm: 'imperative', positiveRequest: true });
  const adjudicated = adjudicate(candidate, evidence);
  assert.equal(adjudicated.tag, 'AUTHORIZED');
  const revived = JSON.parse(JSON.stringify(adjudicated));
  assert.throws(() => assertAuthorized(revived), /brand|membership/i);
  const trace = traceCandidate({ candidate, evidence, adjudicated: revived });
  assert.equal(trace.verdict, 'AUTHORIZED');
  assert.equal(trace.isAuthorized, false);
});

// Input immutability
test('inputs deep-equal before/after and trace is frozen', () => {
  const candidate = cand();
  const evidence = ev({ requestForm: 'imperative', positiveRequest: true });
  const adjudicated = adjudicate(candidate, evidence);
  const before = JSON.stringify({ candidate, evidence, adjudicated });
  const trace = traceCandidate({
    candidate,
    evidence,
    adjudicated,
    relation: null,
    contributes: { primary: true, mutation: false, secondary: false },
  });
  assert.equal(JSON.stringify({ candidate, evidence, adjudicated }), before);
  assert.ok(Object.isFrozen(trace));
  assert.ok(Object.isFrozen(trace.contributes));
  assert.deepEqual(trace.contributes, { primary: true, mutation: false, secondary: false });
  assert.throws(() => { trace.verdict = 'X'; }, TypeError);
});

// Validation: adjudicated must be an object with a valid tag
test('traceCandidate throws on invalid adjudicated', () => {
  const candidate = cand();
  const evidence = ev({});
  assert.throws(() => traceCandidate({ candidate, evidence, adjudicated: null }), /adjudicat/i);
  assert.throws(
    () => traceCandidate({ candidate, evidence, adjudicated: { tag: 'BOGUS', candidate } }),
    /tag/i,
  );
});

// Reason is inert data: no function values anywhere in the trace
test('trace holds inert data only (no functions)', () => {
  const candidate = cand();
  const evidence = ev({ requestForm: 'imperative', positiveRequest: true });
  const trace = traceCandidate({ candidate, evidence, adjudicated: adjudicate(candidate, evidence) });
  const stack = [trace];
  const seen = new Set();
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object') {
      assert.notEqual(typeof value, 'function');
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    for (const v of Object.values(value)) stack.push(v);
  }
  assert.equal(typeof trace.reason, 'string');
});

// Import audit: routing inputs exclude the diagnostics module; diagnostics has no private access
test('import audit: diagnostics stays out of the routing path', () => {
  const read = (rel) => fs.readFileSync(path.join(srcDir, rel), 'utf8');
  const indexSrc = read('intent-resolver/index.js');
  const routePlanSrc = read('route-plan.js');
  assert.ok(!indexSrc.includes('diagnostics.js'), 'index.js must not import diagnostics.js');
  assert.ok(!routePlanSrc.includes('diagnostics.js'), 'route-plan.js must not import diagnostics.js');
  const projectorDir = path.join(srcDir, 'intent-resolver/frame/projectors');
  for (const file of fs.readdirSync(projectorDir)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(projectorDir, file), 'utf8');
    assert.ok(!src.includes('diagnostics.js'), `projectors/${file} must not import diagnostics.js`);
  }
  const diagSrc = read('intent-resolver/frame/authority/diagnostics.js');
  assert.ok(!diagSrc.includes('candidate.js'), 'diagnostics must not import candidate.js');
  assert.ok(!diagSrc.includes('evidence.js'), 'diagnostics must not import evidence.js');
  assert.ok(!diagSrc.includes('shadow.js'), 'diagnostics must not import shadow.js');
  assert.ok(!diagSrc.includes('createAuthorized'), 'diagnostics must not touch createAuthorized');
  assert.ok(!diagSrc.includes('WeakSet'), 'diagnostics must not touch WeakSet');
});

// T08 exit-gate: diagnostic evidence reference is deeply immutable
test('diagnostic evidence reference is deeply immutable', () => {
  const candidate = cand();
  const evidence = ev({ requestForm: 'imperative', positiveRequest: true });
  const adjudicated = adjudicate(candidate, evidence);
  const trace = traceCandidate({ candidate, evidence, adjudicated });
  assert.ok(Object.isFrozen(trace));
  assert.ok(Object.isFrozen(trace.contributes));
  assert.ok(Object.isFrozen(trace.evidence));
  assert.ok(Object.isFrozen(trace.evidence.contextKinds));
  assert.throws(() => { trace.evidence.contextKinds.push('quote'); }, TypeError);
  const snapshot = JSON.stringify(trace);
  const rederived = traceCandidate({ candidate, evidence, adjudicated });
  assert.equal(JSON.stringify(rederived), snapshot);
});
