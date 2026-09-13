import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assembleRequestFrame } from '../src/intent-resolver/frame/request-frame.js';

export async function loadStructuralCases() {
  const filePath = path.resolve(import.meta.dirname, '../evals/structural-routing-cases.json');
  const data = await readFile(filePath, 'utf8');
  const json = JSON.parse(data);
  // Support both legacy array format or new { version, cases, scopedConstraintCases }
  const mainCases = json.cases ?? json;
  const scopedCases = json.scopedConstraintCases ?? [];
  return [...mainCases, ...scopedCases];
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

test('assembleRequestFrame: clause-initial unknown verb yields UNKNOWN_SURFACE_OPERATION without throwing', async () => {
  const prompt = 'Frobnicate the widget';
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on unknown surface operation');

  // Diagnostic present
  const unknownDiag = frame.diagnostics.find(d => d.code === 'UNKNOWN_SURFACE_OPERATION');
  assert.ok(unknownDiag, 'expected UNKNOWN_SURFACE_OPERATION diagnostic');
  assert.ok(typeof unknownDiag.detail === 'string', 'diagnostic detail should be string');
});

test('assembleRequestFrame: mixed known+unknown clauses yield diagnostic for the unknown part', async () => {
  const prompt = 'Deploy the api and frobnicate the widget';
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on mixed known+unknown clauses');

  // The known part assembles normally
  assert.ok(frame.actions.length >= 1, 'expected at least one action from the known clause');

  // The unknown part yields a diagnostic (UNRESOLVED_RELATION per ruling: segment has verb but clause has no frame)
  const diag = frame.diagnostics.find(d => d.code === 'UNRESOLVED_RELATION');
  assert.ok(diag, 'expected diagnostic for the unknown clause');
});

test('assembleRequestFrame: politeness-prefixed unknown verb yields diagnostic without throwing', async () => {
  const prompt = 'Please frobnicate the widget';
  let frame;
  assert.doesNotThrow(() => {
    frame = assembleRequestFrame(prompt);
  }, 'should not throw on politeness-prefixed input');

  const unknownDiag = frame.diagnostics.find(d => d.code === 'UNKNOWN_SURFACE_OPERATION');
  assert.ok(unknownDiag, 'expected UNKNOWN_SURFACE_OPERATION diagnostic');
  // Conservative assembly: frames still present, nothing authoritative over-claimed
  assert.ok(Array.isArray(frame.clauses) && frame.clauses.length >= 1, 'expected clauses');
  assert.ok(Array.isArray(frame.actions), 'expected actions array');
});

test('assembleRequestFrame: known verbs produce no UNKNOWN_SURFACE_OPERATION diagnostic', async () => {
  const prompt = 'Deploy the api and run the test suite.';
  const frame = assembleRequestFrame(prompt);
  const unknownDiag = frame.diagnostics.find(d => d.code === 'UNKNOWN_SURFACE_OPERATION');
  assert.ok(!unknownDiag, 'known verbs must not yield UNKNOWN_SURFACE_OPERATION');
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
