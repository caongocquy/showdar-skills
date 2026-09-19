import fs from 'node:fs';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';

const suitePath = new URL('../evals/development-regression.json', import.meta.url);
const auditPath = new URL('../evals/development-contract-primary-audit.json', import.meta.url);
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

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
  const contractFailures = [];

  for (const entry of auditCases) {
    const prompt = promptById.get(entry.caseId);
    const resolved = resolve(prompt);
    // 6G production primary only: absence is an evaluator failure, never a
    // reason to reconstruct routing via legacy machinery.
    const structuralPrimary = resolved.primary?.skill;
    if (structuralPrimary === undefined) {
      throw new Error(`6G resolver returned no production primary for case: ${entry.caseId}`);
    }
    if (structuralPrimary === entry.expectedPrimarySkill) {
      contractCorrect++;
    } else {
      contractFailures.push({ id: entry.caseId, expected: entry.expectedPrimarySkill, actual: structuralPrimary });
    }
  }

  const total = auditCases.length;
  return {
    total,
    contractCorrect,
    contractAccuracy: total === 0 ? 1 : contractCorrect / total,
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

  if (result.contractCorrect !== result.total) process.exitCode = 1;
}
