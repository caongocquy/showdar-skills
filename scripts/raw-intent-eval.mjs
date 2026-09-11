import fs from 'node:fs';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { buildRoutePlan } from '../src/route-plan.js';

const fixturePath = new URL('../evals/development-regression.json', import.meta.url);
const suite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const cases = suite.cases;
const ids = new Set();

let phaseCorrect = 0;
let actionCorrect = 0;
let objectCorrect = 0;
let mutationCorrect = 0;
let riskPrecisionTP = 0;
let riskPrecisionFP = 0;
let riskRecallTP = 0;
let riskRecallFN = 0;
let evidenceCorrect = { failureObserved: 0, rootCauseKnown: 0, behaviorDefined: 0 };
let evidenceTotal = { failureObserved: 0, rootCauseKnown: 0, behaviorDefined: 0 };
let primarySkillCorrect = 0;
let advisorPrecisionTP = 0;
let advisorPrecisionFP = 0;
let advisorRecallTP = 0;
let advisorRecallFN = 0;
let forbiddenPrimaryViolations = 0;
let confidenceDistribution = { high: 0, medium: 0, low: 0 };
let lowConfidenceCount = 0;
let legacyVsShadowAgree = 0;
let legacyVsShadowDisagree = 0;

let exactMatchCount = 0;
let exactFailCount = 0;

const fieldMismatches = {
  phase: 0,
  action: 0,
  object: 0,
  mutation: 0,
  risks: 0,
  evidence: 0,
  secondaryActions: 0,
};

const primaryFailures = [];
const advisorFailures = [];
const failingCases = [];

function compareArrays(expected, actual, label) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const tp = [...expectedSet].filter(x => actualSet.has(x)).length;
  const fp = [...actualSet].filter(x => !expectedSet.has(x)).length;
  const fn = [...expectedSet].filter(x => !actualSet.has(x)).length;
  return { tp, fp, fn };
}

function legacyPrimaryFromPrompt(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const skillMap = {
    'showdar-understand': ['understand', 'investigate', 'explore', 'map', 'trace', 'analyze', 'architecture', 'repository', 'codebase'],
    'showdar-plan': ['plan', 'planning', 'strategy', 'roadmap', 'approach', 'scope', 'breakdown', 'prepare'],
    'showdar-design': ['design', 'ui', 'ux', 'layout', 'visual', 'responsive', 'accessibility', 'mockup', 'wireframe'],
    'showdar-build': ['implement', 'build', 'create', 'add', 'develop', 'write', 'code', 'feature', 'functionality', 'fix', 'modify'],
    'showdar-debug': ['debug', 'diagnose', 'troubleshoot', 'crash', 'error', 'fail', 'broken', 'bug', 'issue', 'root cause', 'why'],
    'showdar-test': ['test', 'testing', 'automated test', 'unit test', 'integration test', 'e2e', 'regression test'],
    'showdar-review': ['review', 'audit', 'code review', 'pr review', 'correctness', 'maintainability'],
    'showdar-upgrade': ['upgrade', 'migrate', 'dependency', 'framework', 'version'],
    'showdar-ship': ['release', 'ship', 'publish', 'deliver', 'handoff', 'readiness', 'package', 'assess.*release'],
    'showdar-recover': ['recover', 'reconstruct', 'resume', 'interrupted', 'partial'],
    'showdar-git': ['git', 'commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'cherry-pick'],
    'showdar-requirements': ['requirements', 'define', 'specify', 'acceptance', 'criteria', 'business rule', 'user story'],
    'showdar-quality': ['quality', 'qa', 'regression matrix', 'risk coverage', 'compatibility matrix', 'scenario', 'matrix'],
    'showdar-security': ['security', 'threat model', 'vulnerability', 'auth', 'authorization', 'secrets', 'exploit'],
    'showdar-ops': ['deploy', 'deployment', 'ci', 'cd', 'pipeline', 'container', 'environment', 'infrastructure', 'observability', 'rollback'],
  };

  let bestMatch = null;
  let bestScore = 0;

  for (const [skill, triggers] of Object.entries(skillMap)) {
    let score = 0;
    for (const trigger of triggers) {
      const regex = new RegExp(`\\b${trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerPrompt)) {
        score += trigger.split(' ').length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  return bestMatch || 'showdar-build';
}

function checkForbiddenPrimary(intent, routePlan) {
  // Forbidden: debug/build ownership violations per specialization rules
  if (intent.evidence.failureObserved === true && intent.evidence.rootCauseKnown === false) {
    if (routePlan.primary.skill !== 'showdar-debug') {
      return { violation: 'unexplained-failure-not-debug', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'implementation' && ['implement', 'modify', 'fix'].includes(intent.action) &&
      intent.evidence.rootCauseKnown === true && intent.evidence.behaviorDefined === true) {
    if (routePlan.primary.skill !== 'showdar-build') {
      return { violation: 'known-cause-not-build', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'operations' && ['deploy', 'modify'].includes(intent.action)) {
    if (routePlan.primary.skill !== 'showdar-ops') {
      return { violation: 'deployment-not-ops', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'delivery' && ['assess', 'release', 'review'].includes(intent.action) && intent.mutation === 'read-only') {
    if (routePlan.primary.skill !== 'showdar-ship') {
      return { violation: 'release-readiness-not-ship', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'verification' && intent.action === 'assess') {
    if (routePlan.primary.skill !== 'showdar-quality') {
      return { violation: 'qa-scope-not-quality', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'verification' && intent.action === 'test') {
    if (routePlan.primary.skill !== 'showdar-test') {
      return { violation: 'automated-test-not-test', primary: routePlan.primary.skill };
    }
  }
  if (intent.action === 'upgrade') {
    if (routePlan.primary.skill !== 'showdar-upgrade') {
      return { violation: 'upgrade-not-upgrade', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'repository' && intent.action === 'git') {
    if (routePlan.primary.skill !== 'showdar-git') {
      return { violation: 'git-not-git', primary: routePlan.primary.skill };
    }
  }
  if (intent.phase === 'recovery' && intent.action === 'recover') {
    if (routePlan.primary.skill !== 'showdar-recover') {
      return { violation: 'recovery-not-recover', primary: routePlan.primary.skill };
    }
  }
  if (intent.risks.includes('security') && ['assess', 'review'].includes(intent.action) && ['discovery', 'verification'].includes(intent.phase)) {
    if (routePlan.primary.skill !== 'showdar-security') {
      return { violation: 'security-assessment-not-security', primary: routePlan.primary.skill };
    }
  }
  return null;
}

for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate raw-intent case: ${testCase.id}`);
  ids.add(testCase.id);

  const resolved = resolveIntentFromPrompt(testCase.prompt);
  const intent = resolved.intent;
  const expected = testCase.expected;

  const expectedRiskSet = new Set(expected.risks ?? []);
  const actualRiskSet = new Set(intent.risks);
  const { tp: riskTP, fp: riskFP, fn: riskFN } = compareArrays(expected.risks ?? [], intent.risks, 'risks');
  riskPrecisionTP += riskTP;
  riskPrecisionFP += riskFP;
  riskRecallTP += riskTP;
  riskRecallFN += riskFN;

  const phaseMatch = intent.phase === expected.phase;
  const actionMatch = intent.action === expected.action;
  const objectMatch = intent.object === expected.object;
  const mutationMatch = intent.mutation === expected.mutation;
  const risksMatch = JSON.stringify([...intent.risks].sort()) === JSON.stringify([...(expected.risks ?? [])].sort());
  const failureObservedMatch = intent.evidence.failureObserved === (expected.evidence?.failureObserved ?? null);
  const rootCauseKnownMatch = intent.evidence.rootCauseKnown === (expected.evidence?.rootCauseKnown ?? null);
  const behaviorDefinedMatch = intent.evidence.behaviorDefined === (expected.evidence?.behaviorDefined ?? null);
  const evidenceMatch = failureObservedMatch && rootCauseKnownMatch && behaviorDefinedMatch;

  if (phaseMatch) phaseCorrect++; else fieldMismatches.phase++;
  if (actionMatch) actionCorrect++; else fieldMismatches.action++;
  if (objectMatch) objectCorrect++; else fieldMismatches.object++;
  if (mutationMatch) mutationCorrect++; else fieldMismatches.mutation++;
  if (!risksMatch) fieldMismatches.risks++;
  if (!evidenceMatch) fieldMismatches.evidence++;

  for (const key of ['failureObserved', 'rootCauseKnown', 'behaviorDefined']) {
    const expectedVal = expected.evidence?.[key];
    const actualVal = intent.evidence[key];
    evidenceTotal[key]++;
    if (expectedVal !== null && expectedVal !== undefined) {
      if (actualVal === expectedVal) evidenceCorrect[key]++;
    } else if (actualVal === null) {
      evidenceCorrect[key]++;
    }
  }

  const routePlan = buildRoutePlan(intent);
  const actualPrimary = routePlan.primary.skill;
  const expectedPrimary = legacyPrimaryFromPrompt(testCase.prompt);
  const primaryMatch = actualPrimary === expectedPrimary;
  if (primaryMatch) {
    primarySkillCorrect++;
  } else {
    primaryFailures.push({ id: testCase.id, expected: expectedPrimary, actual: actualPrimary });
  }

  const forbiddenPrimary = checkForbiddenPrimary(intent, routePlan);
  if (forbiddenPrimary) {
    forbiddenPrimaryViolations++;
    console.error(`FORBIDDEN PRIMARY VIOLATION ${testCase.id}: ${forbiddenPrimary.violation}, got ${forbiddenPrimary.primary}`);
  }

  const expectedAdvisors = [];
  if (expected.secondaryActions) {
    for (const sa of expected.secondaryActions) {
      const skillMap = {
        'security': 'showdar-security',
        'test': 'showdar-test',
        'quality': 'showdar-quality',
        'review': 'showdar-review',
        'upgrade': 'showdar-upgrade',
        'release': 'showdar-ship',
        'deploy': 'showdar-ops',
        'operations': 'showdar-ops',
        'recover': 'showdar-recover',
        'git': 'showdar-git',
      };
      if (skillMap[sa]) expectedAdvisors.push(skillMap[sa]);
    }
  }
  const actualAdvisors = routePlan.advisors.map(a => a.skill);
  const { tp: advTP, fp: advFP, fn: advFN } = compareArrays(expectedAdvisors, actualAdvisors, 'advisors');
  advisorPrecisionTP += advTP;
  advisorPrecisionFP += advFP;
  advisorRecallTP += advTP;
  advisorRecallFN += advFN;
  if (advFP > 0 || advFN > 0) {
    advisorFailures.push({ id: testCase.id, expected: expectedAdvisors, actual: actualAdvisors, fp: advFP, fn: advFN });
  }

  const legacyPrimary = legacyPrimaryFromPrompt(testCase.prompt);
  if (legacyPrimary === actualPrimary) {
    legacyVsShadowAgree++;
  } else {
    legacyVsShadowDisagree++;
    console.error(`DISAGREE ${testCase.id}: legacy=${legacyPrimary}, shadow=${actualPrimary}`);
  }

  confidenceDistribution[resolved.confidence]++;
  if (resolved.confidence === 'low') lowConfidenceCount++;

  const isExactMatch = phaseMatch && actionMatch && objectMatch && mutationMatch && risksMatch && evidenceMatch;

  if (isExactMatch) {
    exactMatchCount++;
  } else {
    exactFailCount++;
    failingCases.push({
      id: testCase.id,
      expected: {
        phase: expected.phase,
        action: expected.action,
        object: expected.object,
        mutation: expected.mutation,
        risks: expected.risks ?? [],
        evidence: expected.evidence ?? {},
      },
      actual: {
        phase: intent.phase,
        action: intent.action,
        object: intent.object,
        mutation: intent.mutation,
        risks: intent.risks,
        evidence: intent.evidence,
      },
      mismatches: {
        phase: !phaseMatch,
        action: !actionMatch,
        object: !objectMatch,
        mutation: !mutationMatch,
        risks: !risksMatch,
        evidence: !evidenceMatch,
      },
    });
    console.error(`FAIL ${testCase.id}: expected phase=${expected.phase} action=${expected.action} object=${expected.object} mutation=${expected.mutation} risks=${JSON.stringify(expected.risks ?? [])} evidence=${JSON.stringify(expected.evidence ?? {})}, got phase=${intent.phase} action=${intent.action} object=${intent.object} mutation=${intent.mutation} risks=${JSON.stringify(intent.risks)} evidence=${JSON.stringify(intent.evidence)}`);
  }
}

const total = cases.length;
const percent = (value, total) => total === 0 ? '100.0%' : `${(value / total * 100).toFixed(1)}%`;
const precision = (tp, fp) => tp + fp === 0 ? '100.0%' : `${(tp / (tp + fp) * 100).toFixed(1)}%`;
const recall = (tp, fn) => tp + fn === 0 ? '100.0%' : `${(tp / (tp + fn) * 100).toFixed(1)}%`;

console.log(`\n=== RAW-INTENT EVALUATION REPORT ===`);
console.log(`Total cases: ${total}`);
console.log(`Exact fully-passing cases: ${exactMatchCount}/${total} (${percent(exactMatchCount, total)})`);
console.log(`Exact failing cases: ${exactFailCount}/${total} (${percent(exactFailCount, total)})`);
console.log('');

console.log('Intent field accuracy:');
console.log(`  Phase: ${phaseCorrect}/${total} (${percent(phaseCorrect, total)})`);
console.log(`  Action: ${actionCorrect}/${total} (${percent(actionCorrect, total)})`);
console.log(`  Object: ${objectCorrect}/${total} (${percent(objectCorrect, total)})`);
console.log(`  Mutation: ${mutationCorrect}/${total} (${percent(mutationCorrect, total)})`);
console.log('');

console.log('Field-level mismatch counts:');
for (const [field, count] of Object.entries(fieldMismatches)) {
  console.log(`  ${field}: ${count}`);
}
console.log('');

console.log('Risk metrics:');
console.log(`  Precision: ${precision(riskPrecisionTP, riskPrecisionFP)} (TP=${riskPrecisionTP}, FP=${riskPrecisionFP})`);
console.log(`  Recall: ${recall(riskRecallTP, riskRecallFN)} (TP=${riskRecallTP}, FN=${riskRecallFN})`);
console.log('');

console.log('Evidence slot accuracy:');
for (const key of ['failureObserved', 'rootCauseKnown', 'behaviorDefined']) {
  console.log(`  ${key}: ${evidenceCorrect[key]}/${evidenceTotal[key]} (${percent(evidenceCorrect[key], evidenceTotal[key])})`);
}
console.log('');

console.log('Primary skill accuracy (vs legacy keyword mapping):');
console.log(`  ${primarySkillCorrect}/${total} (${percent(primarySkillCorrect, total)})`);
console.log(`  Primary failures: ${primaryFailures.length}`);
for (const pf of primaryFailures) {
  console.log(`    ${pf.id}: expected=${pf.expected}, actual=${pf.actual}`);
}
console.log('');

console.log('Forbidden-primary violations:');
console.log(`  ${forbiddenPrimaryViolations}`);
console.log('');

console.log('Advisor metrics:');
console.log(`  Precision: ${precision(advisorPrecisionTP, advisorPrecisionFP)} (TP=${advisorPrecisionTP}, FP=${advisorPrecisionFP})`);
console.log(`  Recall: ${recall(advisorRecallTP, advisorRecallFN)} (TP=${advisorRecallTP}, FN=${advisorRecallFN})`);
console.log(`  Advisor failures: ${advisorFailures.length}`);
for (const af of advisorFailures) {
  console.log(`    ${af.id}: expected=${JSON.stringify(af.expected)}, actual=${JSON.stringify(af.actual)} (FP=${af.fp}, FN=${af.fn})`);
}
console.log('');

console.log('Confidence distribution:');
for (const [level, count] of Object.entries(confidenceDistribution)) {
  console.log(`  ${level}: ${count} (${percent(count, total)})`);
}
console.log(`Low-confidence cases: ${lowConfidenceCount}`);
console.log('');

console.log('Legacy vs 0.3 shadow primary agreement:');
console.log(`  Agree: ${legacyVsShadowAgree}`);
console.log(`  Disagree: ${legacyVsShadowDisagree}`);
console.log(`  Agreement rate: ${percent(legacyVsShadowAgree, total)}`);
console.log('');

console.log('=== REMAINING FAILING CASES ===');
for (const fc of failingCases) {
  const mismatches = Object.entries(fc.mismatches).filter(([_, v]) => v).map(([k]) => k).join(', ');
  console.log(`  ${fc.id}: mismatches=[${mismatches}]`);
}

if (primarySkillCorrect !== total) process.exitCode = 1;