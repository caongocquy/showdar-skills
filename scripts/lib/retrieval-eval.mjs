import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../../engine/csv.mjs';
import { searchRows } from '../../engine/search.mjs';

export const HIT_K = [1, 3, 5];

const SELECTOR_FIELDS = {
  rowIdsAny: 'id',
  categoriesAny: 'category',
  tagsAny: 'tags',
  stacksAny: 'stack',
  targetsAny: 'target',
  preferredLevelsAny: 'preferred_level',
  surfacesAny: 'surface',
  productsAny: 'product',
  patternsAny: 'pattern',
};

function values(value) {
  return String(value ?? '')
    .split(/[,|;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAny(actual, expected) {
  const actualValues = values(actual);
  const expectedValues = (Array.isArray(expected) ? expected : [expected]).flatMap(values);
  return expectedValues.some((item) => actualValues.includes(item));
}

function filtersMatch(row, filters) {
  return Object.entries(filters).every(([field, expected]) => {
    const expectedValues = (Array.isArray(expected) ? expected : [expected]).flatMap(values);
    const actualValues = values(row[field]);
    return expectedValues.length > 0 && expectedValues.every((item) => actualValues.includes(item));
  });
}

function selectors(expected) {
  const output = [];
  for (const [name, field] of Object.entries(SELECTOR_FIELDS)) {
    if (expected[name] !== undefined) output.push([field, expected[name]]);
  }
  for (const [field, expectedValues] of Object.entries(expected.fieldsAny ?? {})) {
    output.push([field, expectedValues]);
  }
  return output;
}

function rowMatches(row, expected) {
  const checks = selectors(expected);
  return checks.length > 0 && checks.every(([field, expectedValues]) => matchesAny(row[field], expectedValues));
}

function validateCase(caseDef) {
  if (!caseDef || typeof caseDef !== 'object' || Array.isArray(caseDef)) throw new Error('evaluation case must be an object');
  for (const field of ['id', 'skill', 'dataset', 'query']) {
    if (typeof caseDef[field] !== 'string' || !caseDef[field].trim()) throw new Error(`evaluation case ${field} must be a non-empty string`);
  }
  const expected = caseDef.expected;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) throw new Error(`evaluation case ${caseDef.id} must define expected`);
  const topK = expected.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1 || topK > 5) throw new Error(`evaluation case ${caseDef.id} expected.topK must be an integer from 1 to 5`);
  if (!expected.empty && selectors(expected).length === 0) throw new Error(`evaluation case ${caseDef.id} needs semantic selectors or expected.empty`);
  if (caseDef.filters !== undefined && (!caseDef.filters || typeof caseDef.filters !== 'object' || Array.isArray(caseDef.filters))) {
    throw new Error(`evaluation case ${caseDef.id} filters must be an object`);
  }
}

export async function loadEvalSuite(file) {
  const suite = JSON.parse(await readFile(file, 'utf8'));
  if (!suite || typeof suite !== 'object' || Array.isArray(suite)) throw new Error('evaluation suite must be an object');
  if (suite.schemaVersion !== 1) throw new Error('evaluation suite schemaVersion must be 1');
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) throw new Error('evaluation suite must contain cases');
  const ids = new Set();
  for (const caseDef of suite.cases) {
    validateCase(caseDef);
    if (ids.has(caseDef.id)) throw new Error(`duplicate evaluation case id: ${caseDef.id}`);
    ids.add(caseDef.id);
  }
  return suite;
}

async function loadDataset(repoRoot, caseDef, cache) {
  const indexPath = path.join(repoRoot, 'skills', caseDef.skill, 'data', 'index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const dataset = index.datasets?.find((entry) => entry.file === caseDef.dataset);
  if (!dataset) throw new Error(`${caseDef.skill}: dataset ${caseDef.dataset} is not listed in data/index.json`);
  const key = `${caseDef.skill}:${dataset.file}`;
  if (!cache.has(key)) {
    const file = path.join(repoRoot, 'skills', caseDef.skill, dataset.file);
    cache.set(key, {
      rows: parseCsv(await readFile(file, 'utf8')),
      metadata: dataset,
    });
  }
  return cache.get(key);
}

export async function loadCorpus(repoRoot, suite) {
  const cache = new Map();
  const corpus = new Map();
  for (const caseDef of suite.cases) corpus.set(`${caseDef.skill}:${caseDef.dataset}`, await loadDataset(repoRoot, caseDef, cache));
  return corpus;
}

export function evaluateCase(caseDef, rows, metadata = {}) {
  validateCase(caseDef);
  const expected = caseDef.expected;
  const filters = caseDef.filters ?? {};
  const limit = Math.max(...HIT_K, expected.topK ?? 5);
  const results = searchRows(rows, caseDef.query, {
    fields: metadata.searchableFields ?? Object.keys(rows[0] ?? {}),
    filters,
    limit,
    includeZero: false,
  });
  const hits = Object.fromEntries(HIT_K.map((k) => [k, expected.empty ? null : results.slice(0, k).some(({ row }) => rowMatches(row, expected))]));
  const filterPass = expected.filtersMatch !== true || results.every(({ row }) => filtersMatch(row, filters));
  const scorePass = (expected.minScore === undefined || results[0]?.score >= expected.minScore)
    && (expected.maxScore === undefined || (results[0]?.score ?? 0) <= expected.maxScore);
  const passed = expected.empty
    ? results.length === 0 && filterPass && scorePass
    : hits[expected.topK ?? 5] === true && filterPass && scorePass;
  return {
    id: caseDef.id,
    skill: caseDef.skill,
    dataset: caseDef.dataset,
    query: caseDef.query,
    expected,
    filters,
    passed,
    positive: !expected.empty,
    hits,
    results,
  };
}

export async function runEvaluation(repoRoot, suiteFile) {
  const suite = await loadEvalSuite(suiteFile);
  const corpus = await loadCorpus(repoRoot, suite);
  const results = suite.cases.map((caseDef) => {
    const dataset = corpus.get(`${caseDef.skill}:${caseDef.dataset}`);
    return evaluateCase(caseDef, dataset.rows, dataset.metadata);
  });
  return { suite, results, summary: summarizeResults(results) };
}

export function summarizeResults(results) {
  const overall = {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
  };
  const hitAt = Object.fromEntries(HIT_K.map((k) => {
    const positive = results.filter((result) => result.positive);
    const passed = positive.filter((result) => result.hits[k] === true).length;
    return [k, { passed, total: positive.length, rate: positive.length ? passed / positive.length : 1 }];
  }));
  const perSkill = {};
  for (const result of results) {
    perSkill[result.skill] ??= { total: 0, passed: 0, failed: 0, positive: 0 };
    perSkill[result.skill].total += 1;
    perSkill[result.skill].passed += result.passed ? 1 : 0;
    perSkill[result.skill].failed += result.passed ? 0 : 1;
    perSkill[result.skill].positive += result.positive ? 1 : 0;
  }
  return { overall, hitAt, perSkill };
}

export function formatFailure(result) {
  const actual = result.results.slice(0, 5).map(({ row, score, matchedTokens }) => ({
    id: row.id,
    score,
    matchedTokens,
    category: row.category,
    stack: row.stack,
    tags: row.tags,
    row,
  }));
  return [
    `Evaluation failure: ${result.id}`,
    `skill: ${result.skill}`,
    `dataset: ${result.dataset}`,
    `query: ${result.query}`,
    `expected: ${JSON.stringify(result.expected)}`,
    `actual top results: ${JSON.stringify(actual, null, 2)}`,
  ].join('\n');
}

export function serializeEvaluation(results) {
  return JSON.stringify(results.map((result) => ({
    id: result.id,
    skill: result.skill,
    passed: result.passed,
    hits: result.hits,
    results: result.results.map(({ row, score, index, matchedTokens }) => ({
      id: row.id,
      score,
      index,
      matchedTokens,
    })),
  })));
}

export function formatRate({ passed, total }) {
  return `${passed}/${total} (${total ? (passed / total * 100).toFixed(1) : '100.0'}%)`;
}

export function formatReport(summary, failures = []) {
  const lines = [
    'Retrieval evaluation',
    '',
    `Cases: ${summary.overall.total}`,
    `Passed: ${summary.overall.passed}`,
    `Failed: ${summary.overall.failed}`,
    '',
    ...HIT_K.map((k) => `Hit@${k}: ${formatRate(summary.hitAt[k])}`),
    '',
    'Per skill:',
    ...Object.entries(summary.perSkill).sort(([a], [b]) => a.localeCompare(b)).map(([skill, stat]) => `  ${skill.padEnd(18)} ${formatRate(stat)}`),
  ];
  if (failures.length) lines.push('', 'Failures:', ...failures.map(formatFailure));
  return `${lines.join('\n')}\n`;
}
