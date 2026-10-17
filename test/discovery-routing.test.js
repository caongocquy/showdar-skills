import { readFileSync } from 'node:fs';
import { resolveIntentFromPrompt } from '../src/intent-resolver/index.js';
import { evaluateContractPrimary } from '../scripts/contract-primary-eval.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('routing metadata defines capability boundaries for adjacent skills', async () => {
  const conflicts = await readFile(path.join(root, 'router/conflicts.yaml'), 'utf8');
  for (const pair of [
    'showdar-understand vs showdar-requirements',
    'showdar-requirements vs showdar-plan',
    'showdar-plan vs showdar-build',
    'showdar-design vs showdar-build',
    'showdar-debug vs showdar-recover',
    'showdar-test vs showdar-quality',
    'showdar-review vs showdar-security',
    'showdar-review vs showdar-ship',
    'showdar-ship vs showdar-ops',
    'showdar-git vs showdar-ops',
    'showdar-git vs showdar-recover',
    'showdar-quality vs showdar-ship',
    'showdar-upgrade vs showdar-build',
  ]) assert.match(conflicts, new RegExp(`pair: ${pair.replaceAll('-', '\\-')}`));
});

test('Git-specific recovery outranks generic interrupted-work recovery', async () => {
  const triggers = await readFile(path.join(root, 'router/triggers.yaml'), 'utf8');
  assert.ok(triggers.indexOf('  - showdar-git') < triggers.indexOf('  - showdar-recover'));
  assert.match(triggers, /rebase.*cherry-pick.*conflict.*showdar-git/i);
  assert.match(triggers, /interrupted implementation.*showdar-recover/i);
});

// Expected labels were frozen by an independent docs-only oracle before routing.
// All 37 cases remain in audit metrics; parser limitations are not counted as PASS.
const suite = JSON.parse(readFileSync(new URL('../evals/skill-triggering-cases.json', import.meta.url), 'utf8'));
const scoped = suite.cases.filter(c => c.regressionScope === 'ownership-and-controls');

for (const c of scoped) {
  test(`${c.id}: ${c.prompt}`, () => {
    assert.equal(resolveIntentFromPrompt(c.prompt).primary.skill, c.expectedPrimarySkill);
  });
}

test('Q01 artifact ownership preserves the baseline mutation classification on every oracle case', () => {
  for (const c of suite.cases) {
    // This is a no-regression check, not an endorsement of inherited authority gaps.
    assert.equal(resolveIntentFromPrompt(c.prompt).intent.mutation, c.baselineMutation, c.id);
  }
});

test('Q01 uses the existing contract-primary evaluator with independent labels', () => {
  const result = evaluateContractPrimary({
    suiteCases: scoped,
    auditCases: scoped.map(c => ({ caseId: c.id, expectedPrimarySkill: c.expectedPrimarySkill })),
  });
  assert.deepEqual(result.contractFailures, []);
});

for (const artifact of ['acceptance criteria', 'manual QA scenarios', 'CI workflow']) {
  for (const prompt of [
    `Do not create ${artifact}.`,
    `The docs say "create ${artifact}".`,
    `\`create ${artifact}\``,
  ]) {
    test(`Q01 operation scope does not authorize inert/negated input: ${prompt}`, () => {
      assert.equal(resolveIntentFromPrompt(prompt).intent.mutation, 'read-only');
    });
  }
}

// Baseline is Review: readiness is merely the content being searched for.
test('Q01 readiness mentions inside a document search do not select Ship', () => {
  assert.equal(resolveIntentFromPrompt('Check the docs for a phrase saying the release is ready to ship.').primary.skill, 'showdar-review');
});
