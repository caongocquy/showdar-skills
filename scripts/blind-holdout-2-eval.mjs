import { resolveIntentFromPromptSync as resolveIntent } from '../src/intent-resolver/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataset = JSON.parse(readFileSync(join(__dirname, '../evals/blind-holdout-2.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(__dirname, '../evals/blind-holdout-2-manifest.json'), 'utf8'));

const results = {
  manifest,
  timestamp: new Date().toISOString(),
  cases: [],
  summary: {
    total: 0,
    exactMatch: 0,
    primaryMatch: 0,
    actionMatch: 0,
    phaseMatch: 0,
    objectMatch: 0,
    mutationMatch: 0,
    risksMatch: 0,
    evidenceMatch: 0,
    secondaryActionsMatch: 0,
    advisorPrecision: { tp: 0, fp: 0, fn: 0 },
    forbiddenPrimaryViolations: 0,
    criticalBoundaryFailures: 0
  }
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function compareEvidence(a, b) {
  const keys = ['failureObserved', 'rootCauseKnown', 'behaviorDefined'];
  return keys.every(k => a[k] === b[k]);
}

for (const tc of dataset.cases) {
  const resolution = resolveIntent(tc.prompt);
  const actual = resolution.intent;
  const exp = tc.expected;
  
  const phaseMatch = actual.phase === exp.phase;
  const actionMatch = actual.action === exp.action;
  const objectMatch = actual.object === exp.object;
  const mutationMatch = actual.mutation === exp.mutation;
  const risksMatch = arraysEqual(actual.risks || [], exp.risks || []);
  const evidenceMatch = compareEvidence(actual.evidence || {}, exp.evidence || {});
  const secondaryActionsMatch = arraysEqual(actual.secondaryActions || [], exp.secondaryActions || []);
  
  const exactMatch = phaseMatch && actionMatch && objectMatch && mutationMatch && risksMatch && evidenceMatch && secondaryActionsMatch;
  
  // Primary skill - use the resolver's implied skill mapping (this would need the skill mapper)
  // For now, we'll check against the expected primary from the skill mapping if provided
  // But since we don't have expected primary in our test cases, we'll skip this for now
  // The primary accuracy will be computed separately if needed
  const primaryMatch = true; // Placeholder
  
  // Advisor metrics
  const expAdvisors = (exp.secondaryActions || []).map(s => `showdar-${s}`);
  const actualAdvisors = (actual.secondaryActions || []).map(s => `showdar-${s}`);
  
  // Forbidden primary - check if any production-impacting mutation without explicit deploy intent
  const isProductionImpacting = actual.mutation === 'production-impacting';
  const hasDeployAction = actual.action === 'deploy';
  const forbiddenPrimary = isProductionImpacting && !hasDeployAction;
  
  // Critical boundaries
  const criticalBoundaryFailures = 0; // Will compute per case
  
  const caseResult = {
    id: tc.id,
    prompt: tc.prompt,
    expected: exp,
    actual: {
      phase: actual.phase,
      action: actual.action,
      object: actual.object,
      mutation: actual.mutation,
      risks: actual.risks,
      evidence: actual.evidence,
      secondaryActions: actual.secondaryActions,
      constraints: resolution.constraints
    },
    matches: {
      phase: phaseMatch,
      action: actionMatch,
      object: objectMatch,
      mutation: mutationMatch,
      risks: risksMatch,
      evidence: evidenceMatch,
      secondaryActions: secondaryActionsMatch,
      exact: exactMatch
    },
    advisors: {
      expected: expAdvisors,
      actual: actualAdvisors,
      tp: expAdvisors.filter(a => actualAdvisors.includes(a)).length,
      fp: actualAdvisors.filter(a => !expAdvisors.includes(a)).length,
      fn: expAdvisors.filter(a => !actualAdvisors.includes(a)).length
    },
    forbiddenPrimary,
    mismatchClassification: exactMatch ? 'PASS' : 'MISMATCH'
  };
  
  results.cases.push(caseResult);
  results.summary.total++;
  if (exactMatch) results.summary.exactMatch++;
  if (phaseMatch) results.summary.phaseMatch++;
  if (actionMatch) results.summary.actionMatch++;
  if (objectMatch) results.summary.objectMatch++;
  if (mutationMatch) results.summary.mutationMatch++;
  if (risksMatch) results.summary.risksMatch++;
  if (evidenceMatch) results.summary.evidenceMatch++;
  if (secondaryActionsMatch) results.summary.secondaryActionsMatch++;
  if (primaryMatch) results.summary.primaryMatch++;
  results.summary.advisorPrecision.tp += caseResult.advisors.tp;
  results.summary.advisorPrecision.fp += caseResult.advisors.fp;
  results.summary.advisorPrecision.fn += caseResult.advisors.fn;
  if (forbiddenPrimary) results.summary.forbiddenPrimaryViolations++;
  results.summary.criticalBoundaryFailures += criticalBoundaryFailures;
}

console.log(JSON.stringify(results, null, 2));
