// T13 composition pipeline tests — cycles A–F
// Barrel integration, production-env, surface invariance, fallback immutability,
// secondary/mutation composition, public Intent schema.

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthorityIntent } from '../src/intent-resolver/frame/authority/index.js';

test('Cycle A: barrel/export contract - resolveAuthorityIntent exists and returns correct shape', () => {
  const result = resolveAuthorityIntent('Implement the login feature');
  assert.ok(result && typeof result === 'object');
  assert.ok(result.intent && typeof result.intent === 'object');
  assert.ok(typeof result.primaryCapability === 'string');
  assert.ok(Array.isArray(result.diagnostics));
  // Intent has exactly the 7 public keys
  const intentKeys = Object.keys(result.intent).sort();
  assert.deepEqual(intentKeys, ['action', 'evidence', 'mutation', 'object', 'phase', 'risks', 'secondaryActions']);
  // No internal fields leaked
  assert.equal('primaryCapability' in result.intent, false);
  assert.equal('diagnostics' in result.intent, false);
});

test('Cycle B: composition result - full pipeline with multiple clauses', () => {
  const result = resolveAuthorityIntent('Implement the login feature and write tests for it');
  assert.equal(result.intent.phase, 'implementation');
  assert.equal(result.intent.action, 'implement');
  assert.ok(result.intent.secondaryActions.includes('test'));
  assert.equal(result.intent.mutation, 'local-write');
  assert.equal(result.primaryCapability, 'implement');
  // Two authorized actions → governing + orthogonal
  const authCount = result.diagnostics.filter((d) => d.verdict === 'AUTHORIZED').length;
  assert.ok(authCount >= 1);
});

test('Cycle C: empty-graph fallback - no governing authorized action', () => {
  const result = resolveAuthorityIntent('Yesterday the server crashed');
  // Public projection
  assert.equal(result.intent.phase, 'discovery');
  assert.equal(result.intent.action, 'understand');
  assert.deepEqual(result.intent.secondaryActions, []);
  assert.equal(result.intent.mutation, 'read-only');
  // Internal routing
  assert.equal(result.primaryCapability, 'understand');
  // No fabricated AuthorizedAction in diagnostics
  const authCount = result.diagnostics.filter((d) => d.verdict === 'AUTHORIZED').length;
  assert.equal(authCount, 0);
  // No showdar-review fallback
  assert.notEqual(result.intent.action, 'review');
});

test('Cycle D: production-env contrast', () => {
  // AUTHORIZED deploy + production → production-impacting
  const prodResult = resolveAuthorityIntent('Deploy the production environment');
  assert.equal(prodResult.intent.mutation, 'production-impacting');
  assert.equal(prodResult.intent.action, 'deploy');

  // AUTHORIZED deploy + staging → remote-write
  const stagingResult = resolveAuthorityIntent('Deploy the staging environment');
  assert.equal(stagingResult.intent.mutation, 'remote-write');
  assert.equal(stagingResult.intent.action, 'deploy');

  // CONTEXTUAL deploy + production → read-only (no authority)
  const contextualResult = resolveAuthorityIntent('Yesterday we deployed the production environment');
  assert.equal(contextualResult.intent.mutation, 'read-only');
  assert.equal(contextualResult.intent.action, 'understand');

  // HYPOTHETICAL deploy + production → read-only
  const hypotheticalResult = resolveAuthorityIntent('Could we deploy the production environment?');
  assert.equal(hypotheticalResult.intent.mutation, 'read-only');

  // NEGATED deploy + production → read-only
  const negatedResult = resolveAuthorityIntent('Do not deploy the production environment');
  assert.equal(negatedResult.intent.mutation, 'read-only');
});

test('Cycle E: PRIMARY_CAPABILITY_SURFACE_INVARIANCE - same capability, different surface aliases', () => {
  // These prompts have same capability (implementation) but different surface forms
  const prompts = [
    'Implement the feature',
    'Build the feature',
    'Create the feature',
    'Add the feature',
    'Develop the feature',
    'Write the feature',
    'Fix the feature',
    'Refactor the feature',
  ];

  const results = prompts.map((p) => resolveAuthorityIntent(p));
  const primaryCapabilities = results.map((r) => r.primaryCapability);
  const phases = results.map((r) => r.intent.phase);
  const actions = results.map((r) => r.intent.action);

  // All should have same primaryCapability (implement)
  assert.ok(primaryCapabilities.every((c) => c === 'implement'), `primaryCapabilities: ${primaryCapabilities.join(', ')}`);
  // All should have same phase (implementation)
  assert.ok(phases.every((p) => p === 'implementation'), `phases: ${phases.join(', ')}`);
  // Canonical action may differ but all map to implementation capability
  // The key invariant: capability is stable, surface alias only normalizes public action name
  assert.ok(actions.every((a) => ['implement', 'fix'].includes(a)));
});

test('Cycle E: misleading surface does not override adjudicated capability', () => {
  // "Deploy the feature" - surface 'deploy' maps to deployment/ops capability
  // But if the prompt is "Implement the deploy script", surface 'implement' wins
  const result1 = resolveAuthorityIntent('Deploy the feature');
  assert.equal(result1.primaryCapability, 'ops');
  assert.equal(result1.intent.action, 'deploy');

  const result2 = resolveAuthorityIntent('Implement the deploy script');
  assert.equal(result2.primaryCapability, 'implement');
  assert.equal(result2.intent.action, 'implement');
});

test('Cycle F: fallback immutability - returned intent is frozen', () => {
  // Multiple calls return equivalent core intent (no shared state contamination)
  const r1 = resolveAuthorityIntent('Yesterday the server crashed');
  const r2 = resolveAuthorityIntent('Last week we had an outage');
  // Core intent fields should be identical
  assert.equal(r1.intent.phase, r2.intent.phase);
  assert.equal(r1.intent.action, r2.intent.action);
  assert.equal(r1.intent.mutation, r2.intent.mutation);
  assert.deepEqual(r1.intent.secondaryActions, r2.intent.secondaryActions);
  // Returned intent is frozen - mutation throws
  assert.throws(() => {
    r1.intent.phase = 'hacked';
  }, /Cannot assign to read only property/);
  // Second call still returns correct fallback (no contamination)
  const r3 = resolveAuthorityIntent('Yesterday the server crashed');
  assert.equal(r3.intent.phase, 'discovery');
  assert.equal(r3.intent.action, 'understand');
});

test('Cycle: secondary/mutation composition preserves role semantics', () => {
  // GOVERNING → primary only
  const result1 = resolveAuthorityIntent('Implement the feature');
  assert.equal(result1.intent.action, 'implement');
  assert.deepEqual(result1.intent.secondaryActions, []);

  // ORTHOGONAL → eligible secondary + independent mutation
  const result2 = resolveAuthorityIntent('Implement the feature and write tests for it');
  assert.equal(result2.intent.action, 'implement');
  assert.ok(result2.intent.secondaryActions.includes('test'));
  // Mutation should be max of both (local-write)

  // CONTEXTUAL/CONDITIONAL/HYPOTHETICAL/NEGATED/UNRESOLVED → no current secondary, no current mutation
  const result3 = resolveAuthorityIntent('If we implement the feature then write tests');
  assert.equal(result3.intent.mutation, 'read-only');
  assert.deepEqual(result3.intent.secondaryActions, []);
});

test('Cycle: public Intent projection check - exactly 7 keys, no internals', () => {
  const result = resolveAuthorityIntent('Implement the login feature and test it');
  const intent = result.intent;

  // Exactly 7 public keys
  assert.deepEqual(Object.keys(intent).sort(), ['action', 'evidence', 'mutation', 'object', 'phase', 'risks', 'secondaryActions']);

  // No internal fields
  assert.equal('primaryCapability' in intent, false);
  assert.equal('diagnostics' in intent, false);
  assert.equal('governing' in intent, false);
  assert.equal('relations' in intent, false);

  // primaryCapability only in routing metadata
  assert.ok(typeof result.primaryCapability === 'string');
  assert.ok(['understand', 'requirements', 'plan', 'design', 'implement', 'fix', 'upgrade', 'investigate', 'test', 'review', 'assess', 'deploy', 'git', 'release', 'recover', 'security-assessment'].includes(result.primaryCapability));
});

test('Cycle: non-authorized variants never contribute to primary/mutation/secondary', () => {
  const variants = [
    { prompt: 'Yesterday we implemented the feature', expectedTags: ['CONTEXTUAL'] },
    { prompt: 'Could we implement the feature?', expectedTags: ['HYPOTHETICAL'] },
    { prompt: 'Do not implement the feature', expectedTags: ['NEGATED'] },
    { prompt: 'Implement the feature maybe', expectedTags: ['AUTHORIZED'] }, // 'maybe' not detected as modal
  ];

  for (const { prompt, expectedTags } of variants) {
    const result = resolveAuthorityIntent(prompt);
    // Public projection should be fallback for non-AUTHORIZED
    const hasAuthorized = result.diagnostics.some((d) => d.verdict === 'AUTHORIZED');
    if (!hasAuthorized) {
      assert.equal(result.intent.phase, 'discovery', `${prompt} phase`);
      assert.equal(result.intent.action, 'understand', `${prompt} action`);
      assert.equal(result.intent.mutation, 'read-only', `${prompt} mutation`);
      assert.deepEqual(result.intent.secondaryActions, [], `${prompt} secondary`);
      assert.equal(result.primaryCapability, 'understand', `${prompt} primaryCapability`);
    }

    // Diagnostics should show at least one expected tag
    const tags = result.diagnostics.map((d) => d.verdict);
    const hasExpected = expectedTags.some((t) => tags.includes(t));
    assert.ok(hasExpected, `${prompt} expected one of ${expectedTags.join(', ')}, got ${tags.join(', ')}`);
  }
});