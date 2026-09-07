import fs from 'node:fs';
import { createExecutionState, resolveDecision } from '../src/evidence-state.js';

const fixturePath = new URL('../evals/evidence-state-cases.json', import.meta.url);
const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ids = new Set();

let stateDecisionPassCount = 0;
let decisionAccuracyCount = 0;
let handoffTargetAccuracyCount = 0;
let forbiddenTransitionViolations = 0;
let requiredEvidenceViolations = 0;
let blockerAccuracyCount = 0;

for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate evidence-state case: ${testCase.id}`);
  ids.add(testCase.id);

  const initialRes = createExecutionState({
    primary: testCase.routePlan.primary?.skill ?? testCase.routePlan.primary,
    evidence: testCase.evidence,
    blockers: testCase.blockers,
  });

  if (!initialRes.ok) {
    throw new Error(`Failed to create state for case ${testCase.id}: ${initialRes.errors.join('; ')}`);
  }

  const context = {
    intent: testCase.intent,
    routePlan: testCase.routePlan,
    verificationPlan: testCase.verificationPlan,
    changeMetadata: testCase.change ?? {},
    ...testCase.context,
  };

  const finalState = resolveDecision(initialRes.value, context);

  // Checks
  const decisionTypeMatch = finalState.decision.type === testCase.expectedDecision.type;
  const statusMatch = finalState.status === testCase.expectedStatus;
  const handoffTargetMatch = testCase.expectedDecision.type === 'handoff'
    ? finalState.decision.target === testCase.expectedDecision.target
    : finalState.decision.target === null;

  if (decisionTypeMatch) decisionAccuracyCount++;
  if (handoffTargetMatch) handoffTargetAccuracyCount++;
  if (testCase.expectedDecision.type === 'blocked' ? finalState.decision.type === 'blocked' : true) blockerAccuracyCount++;

  // Forbidden transition check
  let forbiddenViolation = false;
  if (testCase.forbiddenTransition) {
    const fromSkill = testCase.routePlan.primary?.skill ?? testCase.routePlan.primary;
    if (
      fromSkill === testCase.forbiddenTransition.from &&
      finalState.decision.type === 'handoff' &&
      finalState.decision.target === testCase.forbiddenTransition.to
    ) {
      forbiddenViolation = true;
      forbiddenTransitionViolations++;
    }
  }

  // Required evidence completion violation check
  let requiredEvidenceViolation = false;
  if (testCase.expectedDecision.type === 'complete') {
    if (finalState.decision.type !== 'complete') {
      requiredEvidenceViolation = true;
      requiredEvidenceViolations++;
    }
  }

  const isExactPass = decisionTypeMatch && statusMatch && handoffTargetMatch && !forbiddenViolation && !requiredEvidenceViolation;

  if (isExactPass) {
    stateDecisionPassCount++;
  } else {
    console.error(`FAIL ${testCase.id}: expected decision=${testCase.expectedDecision.type} target=${testCase.expectedDecision.target} status=${testCase.expectedStatus}, got decision=${finalState.decision.type} target=${finalState.decision.target} status=${finalState.status}`);
  }
}

if (cases.length < 20) {
  throw new Error(`Evidence-state fixture must contain at least 20 cases; found ${cases.length}`);
}

const percent = (value, total) => `${(total === 0 ? 100 : (value / total) * 100).toFixed(1)}%`;

console.log(`Phase 4 Evidence State / Handoff Evaluation: ${cases.length} cases`);
console.log(`Exact state-decision pass count: ${stateDecisionPassCount}/${cases.length} (${percent(stateDecisionPassCount, cases.length)})`);
console.log(`Decision accuracy: ${decisionAccuracyCount}/${cases.length} (${percent(decisionAccuracyCount, cases.length)})`);
console.log(`Handoff-target accuracy: ${handoffTargetAccuracyCount}/${cases.length} (${percent(handoffTargetAccuracyCount, cases.length)})`);
console.log(`Blocker classification accuracy: ${blockerAccuracyCount}/${cases.length} (${percent(blockerAccuracyCount, cases.length)})`);
console.log(`Forbidden-transition violations: ${forbiddenTransitionViolations}`);
console.log(`Required-evidence completion violations: ${requiredEvidenceViolations}`);

if (stateDecisionPassCount !== cases.length) {
  process.exitCode = 1;
}