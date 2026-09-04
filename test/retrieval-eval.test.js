import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateCase,
  formatFailure,
  loadEvalSuite,
  runEvaluation,
  serializeEvaluation,
  summarizeResults,
} from '../scripts/lib/retrieval-eval.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suiteFile = path.join(repoRoot, 'evals/retrieval-cases.json');

const rows = [
  { id: 'rn-list', category: 'performance', tags: 'virtualized list,scroll', stack: 'react-native', summary: 'Keep long lists smooth' },
  { id: 'rn-nav', category: 'navigation', tags: 'navigation,deep link', stack: 'react-native', summary: 'Keep route state serializable' },
  { id: 'flutter-build', category: 'rebuilds', tags: 'rebuild performance', stack: 'flutter', summary: 'Limit rebuild scope' },
];
const metadata = { searchableFields: ['category', 'tags', 'stack', 'summary'], filterFields: ['category', 'stack'] };

test('loader rejects a missing eval suite with a useful filesystem error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-eval-loader-'));
  try {
    await assert.rejects(() => loadEvalSuite(path.join(root, 'missing.json')), /missing\.json|ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runner accepts semantic selectors and exact filters', () => {
  const result = evaluateCase({
    id: 'rn-scroll',
    skill: 'demo',
    dataset: 'data/demo.csv',
    query: 'long list scroll',
    filters: { stack: 'react-native' },
    expected: { topK: 3, categoriesAny: ['performance'], tagsAny: ['virtualized list'], filtersMatch: true },
  }, rows, metadata);
  assert.equal(result.passed, true);
  assert.equal(result.hits[1], true);
  assert.ok(result.results.every(({ row }) => row.stack === 'react-native'));
});

test('runner supports intentional no-match cases', () => {
  const result = evaluateCase({
    id: 'no-match',
    skill: 'demo',
    dataset: 'data/demo.csv',
    query: 'quantum submarine compiler',
    expected: { empty: true },
  }, rows, metadata);
  assert.equal(result.passed, true);
  assert.deepEqual(result.hits, { 1: null, 3: null, 5: null });
});

test('metrics exclude no-match cases from Hit@K denominators', () => {
  const positive = evaluateCase({
    id: 'positive', skill: 'demo', dataset: 'data/demo.csv', query: 'long list',
    expected: { topK: 5, tagsAny: ['virtualized list'] },
  }, rows, metadata);
  const negative = evaluateCase({
    id: 'negative', skill: 'demo', dataset: 'data/demo.csv', query: 'not in corpus',
    expected: { empty: true },
  }, rows, metadata);
  const summary = summarizeResults([positive, negative]);
  assert.deepEqual(summary.overall, { total: 2, passed: 2, failed: 0 });
  assert.equal(summary.hitAt[1].total, 1);
  assert.equal(summary.hitAt[1].passed, 1);
  assert.deepEqual(summary.perSkill.demo, { total: 2, passed: 2, failed: 0, positive: 1 });
});

test('failure output contains diagnostic retrieval evidence', () => {
  const result = evaluateCase({
    id: 'wrong-result', skill: 'demo', dataset: 'data/demo.csv', query: 'route',
    expected: { topK: 1, categoriesAny: ['performance'], tagsAny: ['virtualized list'] },
  }, rows, metadata);
  const output = formatFailure(result);
  assert.match(output, /wrong-result/);
  assert.match(output, /expected/);
  assert.match(output, /rn-nav/);
  assert.match(output, /matchedTokens/);
  assert.match(output, /score/);
});

test('evaluation serialization is deterministic for identical input', () => {
  const definition = {
    id: 'stable', skill: 'demo', dataset: 'data/demo.csv', query: 'long list',
    expected: { topK: 5, tagsAny: ['virtualized list'] },
  };
  const first = evaluateCase(definition, rows, metadata);
  const second = evaluateCase(definition, rows, metadata);
  assert.equal(serializeEvaluation([first]), serializeEvaluation([second]));
  assert.deepEqual(first.results.map(({ row, score, matchedTokens }) => ({ id: row.id, score, matchedTokens })), second.results.map(({ row, score, matchedTokens }) => ({ id: row.id, score, matchedTokens })));
});

test('flagship suite loads every skill and evaluates deterministically', async () => {
  const suite = await loadEvalSuite(suiteFile);
  assert.equal(suite.cases.length, 123);
  assert.deepEqual([...new Set(suite.cases.map((caseDef) => caseDef.skill))].sort(), [
    'showdar-build',
    'showdar-debug',
    'showdar-design',
    'showdar-git',
    'showdar-ops',
    'showdar-plan',
    'showdar-quality',
    'showdar-recover',
    'showdar-requirements',
    'showdar-review',
    'showdar-security',
    'showdar-ship',
    'showdar-test',
    'showdar-understand',
    'showdar-upgrade',
  ]);
  const first = await runEvaluation(repoRoot, suiteFile);
  const second = await runEvaluation(repoRoot, suiteFile);
  assert.equal(first.results.length, suite.cases.length);
  assert.equal(serializeEvaluation(first.results), serializeEvaluation(second.results));
  assert.deepEqual(first.summary, second.summary);
});
