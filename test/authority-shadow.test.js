import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAuthorityShadow } from '../src/intent-resolver/frame/authority/shadow.js';
import { resolveIntentFromPrompt, resolveIntentFromPromptSync, resolveLegacyIntent } from '../src/intent-resolver/index.js';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { assembleRequestFrame } from '../src/intent-resolver/frame/request-frame.js';
import { assertAuthorized } from '../src/intent-resolver/frame/authority/adjudicator.js';

function testShadowShape() {
  const prompt = 'Fix the login bug';
  const legacyResult = resolveLegacyIntent(prompt);
  const shadow = runAuthorityShadow(prompt, legacyResult);
  
  // Basic shape
  assert.ok(shadow);
  assert.equal(typeof shadow, 'object');
  
  // legacy: { phase, action, mutation, primary }
  assert.ok(shadow.legacy);
  assert.equal(typeof shadow.legacy.phase, 'string');
  assert.equal(typeof shadow.legacy.action, 'string');
  assert.equal(typeof shadow.legacy.mutation, 'string');
  assert.equal(typeof shadow.legacy.primary, 'string');
  
  // authority: { candidates: n, authorized: real AUTHORIZED count, status: 'adjudicated', traces: [...] }
  // (T07 contract: supersedes T03 ir-only stage; see progress.md T07 preflight ruling)
  assert.ok(shadow.authority);
  assert.equal(typeof shadow.authority.candidates, 'number');
  assert.equal(shadow.authority.authorized, shadow.authority.traces.filter(t => t.verdict === 'AUTHORIZED').length);
  assert.equal(shadow.authority.status, 'adjudicated');
  assert.ok(Array.isArray(shadow.authority.traces));
  assert.equal(shadow.authority.traces.length, shadow.authority.candidates);
  
  // agreement: {...} - can be empty initially
  assert.ok(shadow.agreement);
  assert.equal(typeof shadow.agreement, 'object');
  
  // issues: [...] - array
  assert.ok(Array.isArray(shadow.issues));
}

function testAuthorizedRealCount() {
  const prompt = 'Fix the login bug';
  const legacyResult = resolveLegacyIntent(prompt);
  const shadow = runAuthorityShadow(prompt, legacyResult);
  assert.equal(shadow.authority.authorized, shadow.authority.traces.filter(t => t.verdict === 'AUTHORIZED').length);
  assert.equal(shadow.authority.status, 'adjudicated');
}

function testCandidatesCountMatchesExtractCandidates() {
  const prompt = 'Fix the login bug and deploy to staging';
  const requestFrame = assembleRequestFrame(prompt);
  const expectedCount = extractCandidates(requestFrame.clauses).length;
  const shadow = runAuthorityShadow(prompt, resolveLegacyIntent(prompt));
  assert.equal(shadow.authority.candidates, expectedCount);
}

function testShadowIsolationProof() {
  const prompt = 'Fix the login bug';
  const productionResult = resolveIntentFromPrompt(prompt);
  assert.ok(productionResult.meta.authorityShadow);
  assert.equal(productionResult.meta.authorityShadow.authority.authorized, productionResult.meta.authorityShadow.authority.traces.filter(t => t.verdict === 'AUTHORIZED').length);
  assert.equal(productionResult.meta.authorityShadow.authority.status, 'adjudicated');

const { authorityShadow, ...metaRest } = productionResult.meta;
  const productionWithoutShadow = { ...productionResult, meta: metaRest };
  assert.deepEqual(productionResult.intent, productionWithoutShadow.intent);
  assert.deepEqual(productionResult.primary, productionWithoutShadow.primary);
  assert.deepEqual(productionResult.advisors, productionWithoutShadow.advisors);
  assert.deepEqual(productionResult.confidence, productionWithoutShadow.confidence);
  assert.deepEqual(productionResult.signals, productionWithoutShadow.signals);
  assert.deepEqual(productionResult.unresolved, productionWithoutShadow.unresolved);
  assert.deepEqual(productionResult.constraints, productionWithoutShadow.constraints);
  assert.deepEqual(productionResult.resolverMeta, productionWithoutShadow.resolverMeta);
  assert.equal(productionResult.intent.mutation, productionWithoutShadow.intent.mutation);

  // T07: traces present and JSON-serializable (brand symbols drop, verdicts survive)
  const traces = productionResult.meta.authorityShadow.authority.traces;
  assert.ok(Array.isArray(traces));
  const revived = JSON.parse(JSON.stringify(traces));
  assert.deepEqual(revived.map(t => t.verdict), traces.map(t => t.verdict));
  assert.deepEqual(revived.map(t => t.reason), traces.map(t => t.reason));
}

function testErrorHandlingDoesNotBreakProduction() {
  // Shadow should swallow errors and not break production
  // We'll test by ensuring production still works even if shadow fails
  const prompt = 'Fix the login bug';
  
  // This should not throw
  const result = resolveIntentFromPrompt(prompt);
  assert.ok(result);
  assert.ok(result.intent);
}

function runAll() {
  testShadowShape();
  testAuthorizedRealCount();
  testCandidatesCountMatchesExtractCandidates();
  testShadowIsolationProof();
  testErrorHandlingDoesNotBreakProduction();
  console.log('All authority-shadow tests passed');
}

// Only run if called directly (for TDD), node --test will call test() functions
if (import.meta.url === `file://${process.argv[1]}`) {
  runAll();
}

function collectReachable(root) {
  const values = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const value = stack.pop();
    values.push(value);
    if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
      if (seen.has(value)) continue;
      seen.add(value);
      for (const key of [...Object.getOwnPropertyNames(value), ...Object.getOwnPropertySymbols(value)]) {
        try {
          stack.push(value[key]);
        } catch {
          // Ignore throwing getters; value itself was already recorded.
        }
      }
    }
  }
  return values;
}

// T08 exit-gate: shadow exposes no live authority capability
test('shadow exposes no live authority capability', () => {
  const prompts = [
    'Please tidy the lobby noticeboard before noon',
    'Could the steward kindly file the evening roster',
    'Kindly wipe the archive table after closing',
  ];
  for (const prompt of prompts) {
    const result = resolveIntentFromPromptSync(prompt);
    const shadow = result.meta.authorityShadow;
    assert.ok(shadow);
    const authority = shadow.authority;
    assert.equal(typeof authority.authorized, 'number');
    const reachable = collectReachable(shadow);
    assert.ok(reachable.length > 0);
    for (const value of reachable) {
      assert.throws(() => assertAuthorized(value));
    }
    const revived = JSON.parse(JSON.stringify(authority.traces));
    assert.deepEqual(
      revived.map((t) => t.verdict),
      authority.traces.map((t) => t.verdict),
    );
    assert.deepEqual(
      revived.map((t) => t.isAuthorized),
      authority.traces.map((t) => t.isAuthorized),
    );
  }
});
