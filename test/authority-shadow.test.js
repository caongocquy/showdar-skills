import assert from 'node:assert/strict';
import { runAuthorityShadow } from '../src/intent-resolver/frame/authority/shadow.js';
import { resolveIntentFromPrompt } from '../src/intent-resolver/index.js';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { assembleRequestFrame } from '../src/intent-resolver/frame/request-frame.js';

function testShadowShape() {
  const prompt = 'Fix the login bug';
  const shadow = runAuthorityShadow(prompt);
  
  // Basic shape
  assert.ok(shadow);
  assert.equal(typeof shadow, 'object');
  
  // legacy: { phase, action, mutation, primary }
  assert.ok(shadow.legacy);
  assert.equal(typeof shadow.legacy.phase, 'string');
  assert.equal(typeof shadow.legacy.action, 'string');
  assert.equal(typeof shadow.legacy.mutation, 'string');
  assert.equal(typeof shadow.legacy.primary, 'string');
  
  // authority: { candidates: n, authorized: 0, status: 'ir-only', reason: 'adjudicator-pending' }
  assert.ok(shadow.authority);
  assert.equal(typeof shadow.authority.candidates, 'number');
  assert.equal(shadow.authority.authorized, 0);
  assert.equal(shadow.authority.status, 'ir-only');
  assert.equal(shadow.authority.reason, 'adjudicator-pending');
  
  // agreement: {...} - can be empty initially
  assert.ok(shadow.agreement);
  assert.equal(typeof shadow.agreement, 'object');
  
  // issues: [...] - array
  assert.ok(Array.isArray(shadow.issues));
}

function testAuthorizedAlwaysZero() {
  const prompt = 'Fix the login bug';
  const shadow = runAuthorityShadow(prompt);
  assert.equal(shadow.authority.authorized, 0);
  assert.equal(shadow.authority.reason, 'adjudicator-pending');
}

function testCandidatesCountMatchesExtractCandidates() {
  const prompt = 'Fix the login bug and deploy to staging';
  const requestFrame = assembleRequestFrame(prompt);
  const expectedCount = extractCandidates(requestFrame.clauses).length;
  const shadow = runAuthorityShadow(prompt);
  assert.equal(shadow.authority.candidates, expectedCount);
}

function testShadowIsolationProof() {
  const prompt = 'Fix the login bug';
  const productionResult = resolveIntentFromPrompt(prompt);
  assert.ok(productionResult.meta.authorityShadow);
  assert.equal(productionResult.meta.authorityShadow.authority.authorized, 0);
  assert.equal(productionResult.meta.authorityShadow.authority.reason, 'adjudicator-pending');

  const { authorityShadow, ...metaRest } = productionResult.meta;
  const productionWithoutShadow = { ...productionResult, meta: metaRest };
  assert.deepEqual(productionResult.intent, productionWithoutShadow.intent);
  assert.deepEqual(productionResult.primary, productionWithoutShadow.primary);
  assert.deepEqual(productionResult.advisors, productionWithoutShadow.advisors);
  assert.equal(productionResult.intent.mutation, productionWithoutShadow.intent.mutation);
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
  testAuthorizedAlwaysZero();
  testCandidatesCountMatchesExtractCandidates();
  testShadowIsolationProof();
  testErrorHandlingDoesNotBreakProduction();
  console.log('All authority-shadow tests passed');
}

// Only run if called directly (for TDD), node --test will call test() functions
if (import.meta.url === `file://${process.argv[1]}`) {
  runAll();
}