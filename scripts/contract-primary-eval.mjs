import fs from 'node:fs';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { buildRoutePlan } from '../src/route-plan.js';

const suitePath = new URL('../evals/development-regression.json', import.meta.url);
const auditPath = new URL('../evals/development-contract-primary-audit.json', import.meta.url);
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

export function legacyPrimaryFromPrompt(prompt) {
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

export function evaluateContractPrimary({ suiteCases = suite.cases, auditCases = audit.cases, resolve = resolveIntentFromPrompt } = {}) {
  const auditById = new Map();
  for (const entry of auditCases) {
    if (auditById.has(entry.caseId)) {
      throw new Error(`Duplicate contract-primary audit case: ${entry.caseId}`);
    }
    auditById.set(entry.caseId, entry);
  }

  const suiteIds = suiteCases.map((c) => c.id);
  if (new Set(suiteIds).size !== suiteIds.length) {
    throw new Error('Duplicate development case id in suite');
  }
  const missing = suiteIds.filter((id) => !auditById.has(id));
  if (missing.length > 0) {
    throw new Error(`Contract-primary audit missing case ids: ${missing.join(', ')}`);
  }
  const extra = [...auditById.keys()].filter((id) => !suiteIds.includes(id));
  if (extra.length > 0) {
    throw new Error(`Contract-primary audit has unknown case ids: ${extra.join(', ')}`);
  }

  const promptById = new Map(suiteCases.map((c) => [c.id, c.prompt]));
  let contractCorrect = 0;
  let legacyAgreement = 0;
  const contractFailures = [];

  for (const entry of auditCases) {
    const prompt = promptById.get(entry.caseId);
    const resolved = resolve(prompt);
    // Structural thin-route primary (spec §8A): the resolver's own routed
    // primary, never the legacy route-plan. Legacy is diagnostic-only below.
    const structuralPrimary = resolved.primary?.skill ?? buildRoutePlan(resolved.intent).primary.skill;
    if (structuralPrimary === entry.expectedPrimarySkill) {
      contractCorrect++;
    } else {
      contractFailures.push({ id: entry.caseId, expected: entry.expectedPrimarySkill, actual: structuralPrimary });
    }
    if (structuralPrimary === legacyPrimaryFromPrompt(prompt)) {
      legacyAgreement++;
    }
  }

  const total = auditCases.length;
  return {
    total,
    contractCorrect,
    contractAccuracy: total === 0 ? 1 : contractCorrect / total,
    legacyAgreement,
    legacyAgreementRate: total === 0 ? 1 : legacyAgreement / total,
    contractFailures,
  };
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`, 'file:///').href;

if (invokedDirectly) {
  const result = evaluateContractPrimary();
  const percent = (v) => `${(v * 100).toFixed(1)}%`;

  console.log('\n=== T20 CONTRACT-PRIMARY EVALUATION REPORT ===');
  console.log(`Audited cases: ${result.total}`);
  console.log(`T20_CONTRACT_PRIMARY_ACCURACY: ${result.contractCorrect}/${result.total} (${percent(result.contractAccuracy)})`);
  for (const f of result.contractFailures) {
    console.log(`  FAIL ${f.id}: expected=${f.expected}, actual=${f.actual}`);
  }
  console.log(`LEGACY_COMPATIBILITY_DIAGNOSTIC: ${result.legacyAgreement}/${result.total} (${percent(result.legacyAgreementRate)})`);
  console.log('(legacy agreement is diagnostic-only; it does not affect T20 pass/fail)');

  if (result.contractCorrect !== result.total) process.exitCode = 1;
}
