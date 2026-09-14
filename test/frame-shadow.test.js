import test from 'node:test';
import assert from 'node:assert/strict';
import { runShadow } from '../src/intent-resolver/frame/shadow.js';

test('runShadow returns correct structure with agreement/issues', async () => {
  const diff = runShadow('Rebuild the search index and check it for stale entries.');
  assert.ok('agreement' in diff && 'issues' in diff);
  assert.equal(typeof diff.agreement.primarySkill, 'boolean');
});

test('runShadow legacy side has phase/action/mutation/secondaryActions/primarySkill', async () => {
  const diff = runShadow('Deploy the api to staging.');
  const legacy = diff.legacy;
  assert.ok(legacy.phase);
  assert.ok(legacy.action);
  assert.ok(legacy.mutation);
  assert.ok(Array.isArray(legacy.secondaryActions));
  assert.ok(legacy.primarySkill);
});

test('runShadow structural side has phase/action/mutation/secondaryActions from projectors', async () => {
  const diff = runShadow('Deploy the api to staging.');
  const structural = diff.structural;
  assert.ok(structural.phase);
  assert.ok(structural.action);
  assert.ok(structural.mutation); // T11: mutation now projected
  assert.ok(Array.isArray(structural.secondaryActions)); // T14: secondaryActions now projected
  assert.ok(typeof structural.primarySkill === 'string'); // T17: primarySkill flows via the thin mapper
});

test('runShadow agreement shows phase/action/mutation match when structural matches legacy', async () => {
  const diff = runShadow('implement X + audit X');
  assert.equal(diff.agreement.phase, true);
  assert.equal(diff.agreement.action, true);
  assert.equal(typeof diff.agreement.mutation, 'boolean');
  // T14: secondary now compared as arrays
  assert.equal(typeof diff.agreement.secondary, 'boolean');
  assert.equal(typeof diff.agreement.primarySkill, 'boolean');
});

test('runShadow issues array contains diagnostic codes', async () => {
  const diff = runShadow('unknown verb xyz');
  assert.ok(Array.isArray(diff.issues));
  // Issues should contain objects with code and detail
  if (diff.issues.length > 0) {
    assert.ok('code' in diff.issues[0]);
    assert.ok('detail' in diff.issues[0]);
  }
});