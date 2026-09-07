import fs from 'node:fs';
import { buildRoutePlan } from '../src/route-plan.js';
import { buildVerificationPlan } from '../src/verification-budget.js';

const fixturePath = new URL('../evals/verification-budget-cases.json', import.meta.url);
const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ids = new Set();
let budgetCorrect = 0;
let requiredHits = 0;
let requiredTotal = 0;
let forbiddenViolations = 0;
let exactPass = 0;

for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate verification-budget case: ${testCase.id}`);
  ids.add(testCase.id);
  const routePlan = buildRoutePlan(testCase.intent);
  const plan = buildVerificationPlan(testCase.intent, routePlan, testCase.change);
  const expectedRequired = testCase.expectedRequired ?? [];
  const forbidden = testCase.forbiddenChecks ?? [];
  const actualChecks = [...plan.required, ...plan.optional];
  const actualRequired = new Set(plan.required);
  const caseRequiredHits = expectedRequired.filter((check) => actualRequired.has(check)).length;
  const caseForbiddenViolations = actualChecks.filter((check) => forbidden.includes(check)).length;
  const caseExact = plan.budget === testCase.expectedBudget
    && JSON.stringify(plan.required) === JSON.stringify(expectedRequired)
    && caseForbiddenViolations === 0;

  if (plan.budget === testCase.expectedBudget) budgetCorrect += 1;
  requiredHits += caseRequiredHits;
  requiredTotal += expectedRequired.length;
  forbiddenViolations += caseForbiddenViolations;
  if (caseExact) exactPass += 1;
  else console.error(`FAIL ${testCase.id}: budget=${plan.budget}, required=${plan.required.join(',') || 'none'}`);
}

if (cases.length < 20) throw new Error(`Verification-budget fixture must contain at least 20 cases; found ${cases.length}`);

const percent = (value, total) => `${(total === 0 ? 1 : value / total * 100).toFixed(1)}%`;
console.log(`Verification-budget evaluation: ${cases.length} cases`);
console.log(`Exact budget accuracy: ${budgetCorrect}/${cases.length} (${percent(budgetCorrect, cases.length)})`);
console.log(`Required-check recall: ${requiredHits}/${requiredTotal} (${percent(requiredHits, requiredTotal)})`);
console.log(`Forbidden-check violations: ${forbiddenViolations}`);
console.log(`Exact verification plans: ${exactPass}/${cases.length} (${percent(exactPass, cases.length)})`);

if (exactPass !== cases.length) process.exitCode = 1;
