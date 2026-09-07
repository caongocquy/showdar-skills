import fs from 'node:fs';
import { buildRoutePlan } from '../src/route-plan.js';

const fixturePath = new URL('../evals/structured-routing-cases.json', import.meta.url);
const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ids = new Set();
let primaryCorrect = 0;
let requiredHits = 0;
let requiredTotal = 0;
let predictedRelevant = 0;
let predictedTotal = 0;
let forbiddenViolations = 0;
let exactPass = 0;

for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate structured routing case: ${testCase.id}`);
  ids.add(testCase.id);
  const plan = buildRoutePlan(testCase.intent);
  const actualAdvisors = plan.advisors.map(({ skill }) => skill);
  const expectedAdvisors = testCase.requiredAdvisors ?? [];
  const forbidden = testCase.forbiddenAdvisors ?? [];
  const actualSet = new Set(actualAdvisors);
  const expectedSet = new Set(expectedAdvisors);
  const casePrimaryCorrect = plan.primary.skill === testCase.expectedPrimary;
  const caseRequiredHits = expectedAdvisors.filter((skill) => actualSet.has(skill)).length;
  const caseForbiddenViolations = actualAdvisors.filter((skill) => forbidden.includes(skill)).length;
  const caseExact = casePrimaryCorrect
    && actualAdvisors.length === expectedSet.size
    && actualAdvisors.every((skill) => expectedSet.has(skill))
    && caseRequiredHits === expectedSet.size
    && caseForbiddenViolations === 0;

  if (casePrimaryCorrect) primaryCorrect += 1;
  requiredHits += caseRequiredHits;
  requiredTotal += expectedAdvisors.length;
  predictedRelevant += actualAdvisors.filter((skill) => expectedSet.has(skill)).length;
  predictedTotal += actualAdvisors.length;
  forbiddenViolations += caseForbiddenViolations;
  if (caseExact) exactPass += 1;
  else console.error(`FAIL ${testCase.id}: primary=${plan.primary.skill}, advisors=${actualAdvisors.join(',') || 'none'}`);
}

if (cases.length < 20) throw new Error(`Structured routing fixture must contain at least 20 cases; found ${cases.length}`);

const percent = (value, total) => `${(total === 0 ? 1 : value / total * 100).toFixed(1)}%`;
console.log(`Structured routing evaluation: ${cases.length} cases`);
console.log(`Primary accuracy: ${primaryCorrect}/${cases.length} (${percent(primaryCorrect, cases.length)})`);
console.log(`Required-advisor recall: ${requiredHits}/${requiredTotal} (${percent(requiredHits, requiredTotal)})`);
console.log(`Advisor precision: ${predictedRelevant}/${predictedTotal} (${percent(predictedRelevant, predictedTotal)})`);
console.log(`Forbidden-advisor violations: ${forbiddenViolations}`);
console.log(`Exact route plans: ${exactPass}/${cases.length} (${percent(exactPass, cases.length)})`);

if (exactPass !== cases.length) process.exitCode = 1;
