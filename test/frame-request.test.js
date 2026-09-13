import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assembleRequestFrame } from '../src/intent-resolver/frame/request-frame.js';

export async function loadStructuralCases() {
  const filePath = path.resolve(import.meta.dirname, '../evals/structural-routing-cases.json');
  const data = await readFile(filePath, 'utf8');
  const json = JSON.parse(data);
  // Support both legacy array format or new { version, cases }
  return json.cases ?? json;
}

test('structural routing fixture schema keys', async () => {
  const cases = await loadStructuralCases();
  const requiredTop = ['id', 'input', 'expected'];
  const requiredExpected = ['clauses', 'actions', 'relations', 'constraints', 'intent', 'primary', 'advisors'];
  for (const c of cases) {
    for (const k of requiredTop) {
      assert.ok(Object.prototype.hasOwnProperty.call(c, k), `Case missing top-level key ${k}`);
    }
    const exp = c.expected;
    for (const ek of requiredExpected) {
      assert.ok(Object.prototype.hasOwnProperty.call(exp, ek), `Case ${c.id} missing expected.${ek}`);
    }
  }
});

// T06 assembly tests

test('assembleRequestFrame: valid multi-clause prompt produces all six keys', async () => {
  const prompt = 'Deploy the api and run the test suite.';
  const frame = assembleRequestFrame(prompt);

  // All six keys present
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'clauses'), 'missing clauses');
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'actions'), 'missing actions');
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'contexts'), 'missing contexts');
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'constraints'), 'missing constraints');
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'relations'), 'missing relations');
  assert.ok(Object.prototype.hasOwnProperty.call(frame, 'diagnostics'), 'missing diagnostics');

  // Types are arrays
  assert.ok(Array.isArray(frame.clauses));
  assert.ok(Array.isArray(frame.actions));
  assert.ok(Array.isArray(frame.contexts));
  assert.ok(Array.isArray(frame.constraints));
  assert.ok(Array.isArray(frame.relations));
  assert.ok(Array.isArray(frame.diagnostics));

  // At least one clause, one action for this prompt
  assert.ok(frame.clauses.length >= 1, 'expected at least one clause');
  assert.ok(frame.actions.length >= 1, 'expected at least one action');
});

test('assembleRequestFrame: unknown verb yields UNKNOWN_SURFACE_OPERATION diagnostic without throwing', async () => {
  const prompt = 'Frobnicate the widget and then deploy it.'; // "frobnicate" not in surface map
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on unknown surface operation');

  // Diagnostic present
  const unknownDiag = frame.diagnostics.find(d => d.code === 'UNKNOWN_SURFACE_OPERATION');
  assert.ok(unknownDiag, 'expected UNKNOWN_SURFACE_OPERATION diagnostic');
  assert.ok(typeof unknownDiag.detail === 'string', 'diagnostic detail should be string');
});

test('assembleRequestFrame: empty input yields NO_GOVERNING_ACTION without throwing', async () => {
  const prompt = '';
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on empty input');

  const noGovDiag = frame.diagnostics.find(d => d.code === 'NO_GOVERNING_ACTION');
  assert.ok(noGovDiag, 'expected NO_GOVERNING_ACTION diagnostic on empty input');
  assert.ok(typeof noGovDiag.detail === 'string');
});

test('assembleRequestFrame: ambiguous/non-action input yields NO_GOVERNING_ACTION without throwing', async () => {
  const prompt = 'The weather is nice today.';
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on ambiguous input');

  const noGovDiag = frame.diagnostics.find(d => d.code === 'NO_GOVERNING_ACTION');
  assert.ok(noGovDiag, 'expected NO_GOVERNING_ACTION diagnostic on ambiguous input');
});
