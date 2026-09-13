import { resolveIntentFromPromptSync as resolveIntent } from "./src/intent-resolver/index.js";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load contract-correct audit overlays AND original datasets for prompts
const blindAudit = JSON.parse(readFileSync(join(__dirname, 'evals/blind-holdout-2-secondary-contract-audit.json'), 'utf8'));
const devAudit = JSON.parse(readFileSync(join(__dirname, 'evals/development-regression-secondary-contract-audit.json'), 'utf8'));
const blindDataset = JSON.parse(readFileSync(join(__dirname, 'evals/blind-holdout-2.json'), 'utf8'));
const devDataset = JSON.parse(readFileSync(join(__dirname, 'evals/development-regression.json'), 'utf8'));

function evalDataset(name, dataset, auditObj) {
  console.log(`\n=== ${name} CONTRACT-CORRECT EVALUATION ===`);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let secondaryTp = 0, secondaryFp = 0, secondaryFn = 0;
  
  for (const audit of auditObj.cases) {
    // Use the prompt from the original dataset
    const tc = dataset.cases.find(c => c.id === audit.id);
    if (!tc) continue;
    const prompt = tc.prompt;
    const resolution = resolveIntent(prompt);
    const actual = resolution.intent;
    const expected = audit.contractCorrectExpected || [];
    const actualSec = actual.secondaryActions || [];
    
    // For each expected secondary
    for (const exp of expected) {
      if (actualSec.includes(exp)) {
        tp++;
        secondaryTp++;
      } else {
        fn++;
        secondaryFn++;
      }
    }
    // For each actual not expected
    for (const act of actualSec) {
      if (!expected.includes(act)) {
        fp++;
        secondaryFp++;
      }
    }
    // TN: no expected and no actual
    if (expected.length === 0 && actualSec.length === 0) {
      tn++;
    }
  }
  
  const precision = tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(1) : 'N/A';
  const recall = tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(1) : 'N/A';
  const secPrecision = secondaryTp + secondaryFp > 0 ? (secondaryTp / (secondaryTp + secondaryFp) * 100).toFixed(1) : 'N/A';
  const secRecall = secondaryTp + secondaryFn > 0 ? (secondaryTp / (secondaryTp + secondaryFn) * 100).toFixed(1) : 'N/A';

  // Unambiguous reconciled counts (computed, not from summary field)
  const casesWithExplicit = auditObj.cases.filter(c => (c.contractCorrectExpected || []).length > 0).length;
  const expectedLabels = auditObj.cases.reduce((n, c) => n + (c.contractCorrectExpected || []).length, 0);

  console.log(`  Total cases: ${auditObj.cases.length}`);
  console.log(`  Cases with explicit secondary work: ${casesWithExplicit}`);
  console.log(`  Expected secondary labels: ${expectedLabels}`);
  console.log(`  Overlay summary.contractCorrectNonEmpty (diagnostic): ${auditObj.summary.contractCorrectNonEmpty}`);
  console.log(`  Overall: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);
  console.log(`  Precision: ${precision}%`);
  console.log(`  Recall: ${recall}%`);
  console.log(`  Secondary-specific: TP=${secondaryTp} FP=${secondaryFp} FN=${secondaryFn}`);
  console.log(`  Secondary Precision: ${secPrecision}%`);
  console.log(`  Secondary Recall: ${secRecall}%`);
  
  return { tp, fp, fn, tn, secondaryTp, secondaryFp, secondaryFn };
}

evalDataset("BLIND HOLDOUT #2", blindDataset, blindAudit);
evalDataset("DEVELOPMENT REGRESSION", devDataset, devAudit);
