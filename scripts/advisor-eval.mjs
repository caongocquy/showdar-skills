import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { buildRoutePlan } from '../src/route-plan.js';
import fs from 'fs';

const challenge = JSON.parse(fs.readFileSync('./evals/generalization-challenge.json', 'utf-8'));

const skillMap = {
  'test': 'showdar-test',
  'security': 'showdar-security',
  'quality': 'showdar-quality',
  'review': 'showdar-review',
  'upgrade': 'showdar-upgrade',
  'release': 'showdar-ship',
  'deploy': 'showdar-ops',
  'operations': 'showdar-ops',
  'recover': 'showdar-recover',
  'git': 'showdar-git',
};

function compareArrays(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const tp = [...expectedSet].filter(x => actualSet.has(x)).length;
  const fp = [...actualSet].filter(x => !expectedSet.has(x)).length;
  const fn = [...expectedSet].filter(x => !actualSet.has(x)).length;
  return { tp, fp, fn };
}

let advisorPrecisionTP = 0;
let advisorPrecisionFP = 0;
let advisorRecallTP = 0;
let advisorRecallFN = 0;
let labeledCount = 0;

for (const tc of challenge.cases) {
  const result = resolveIntentFromPrompt(tc.prompt);
  const routePlan = buildRoutePlan(result.intent);
  
  // Expected advisors from secondaryActions
  const expectedAdvisors = [];
  if (tc.expected.secondaryActions) {
    for (const sa of tc.expected.secondaryActions) {
      if (skillMap[sa]) expectedAdvisors.push(skillMap[sa]);
    }
  }
  
  const actualAdvisors = routePlan.advisors.map(a => a.skill);
  const { tp, fp, fn } = compareArrays(expectedAdvisors, actualAdvisors);
  
  advisorPrecisionTP += tp;
  advisorPrecisionFP += fp;
  advisorRecallTP += tp;
  advisorRecallFN += fn;
  
  if (tc.expected.secondaryActions !== undefined) {
    labeledCount++;
  }
  
  if (fp > 0 || fn > 0) {
    console.log(`ADVISOR MISMATCH ${tc.id}: expected=${JSON.stringify(expectedAdvisors)}, actual=${JSON.stringify(actualAdvisors)} (FP=${fp}, FN=${fn})`);
  }
}

const precision = advisorPrecisionTP + advisorPrecisionFP === 0 ? 100.0 : (advisorPrecisionTP / (advisorPrecisionTP + advisorPrecisionFP) * 100).toFixed(1);
const recall = advisorRecallTP + advisorRecallFN === 0 ? 100.0 : (advisorRecallTP / (advisorRecallTP + advisorRecallFN) * 100).toFixed(1);

console.log(`\n=== ADVISOR METRICS (35 cases, all labeled) ===`);
console.log(`Labeled cases: ${labeledCount}/35 (${(labeledCount/35*100).toFixed(1)}%)`);
console.log(`TP: ${advisorPrecisionTP}, FP: ${advisorPrecisionFP}, FN: ${advisorRecallFN}`);
console.log(`Precision: ${precision}%`);
console.log(`Recall: ${recall}%`);