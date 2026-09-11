import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import fs from 'fs';

const holdout = JSON.parse(fs.readFileSync('./evals/generalization-challenge.json', 'utf-8'));

let pass = 0, fail = 0;
const failures = [];

for (const tc of holdout.cases) {
  const result = resolveIntentFromPrompt(tc.prompt);
  const exp = tc.expected;
  let ok = true;
  const mismatches = [];
  
  if (result.intent.phase !== exp.phase) { ok = false; mismatches.push(`phase: ${result.intent.phase}≠${exp.phase}`); }
  if (result.intent.action !== exp.action) { ok = false; mismatches.push(`action: ${result.intent.action}≠${exp.action}`); }
  if (result.intent.object !== exp.object) { ok = false; mismatches.push(`object: ${result.intent.object}≠${exp.object}`); }
  if (result.intent.mutation !== exp.mutation) { ok = false; mismatches.push(`mutation: ${result.intent.mutation}≠${exp.mutation}`); }
  
  const expRisks = [...(exp.risks || [])].sort();
  const gotRisks = [...(result.intent.risks || [])].sort();
  if (JSON.stringify(expRisks) !== JSON.stringify(gotRisks)) { ok = false; mismatches.push(`risks: ${gotRisks}≠${expRisks}`); }
  
  for (const key of ['failureObserved', 'rootCauseKnown', 'behaviorDefined']) {
    const expVal = exp.evidence?.[key] ?? null;
    const gotVal = result.intent.evidence?.[key] ?? null;
    if (expVal !== gotVal) { ok = false; mismatches.push(`evidence.${key}: ${gotVal}≠${expVal}`); }
  }
  
  if (exp.constraints) {
    const expC = [...exp.constraints].sort();
    const gotC = [...(result.constraints || [])].sort();
    if (JSON.stringify(expC) !== JSON.stringify(gotC)) { ok = false; mismatches.push(`constraints: ${gotC}≠${expC}`); }
  }
  
  if (ok) pass++; else { fail++; failures.push({ id: tc.id, prompt: tc.prompt, mismatches }); }
}

console.log(`Holdout: ${holdout.cases.length} cases`);
console.log(`Pass: ${pass} (${(pass/holdout.cases.length*100).toFixed(1)}%)`);
console.log(`Fail: ${fail} (${(fail/holdout.cases.length*100).toFixed(1)}%)`);
console.log('\nFailures:');
for (const f of failures) {
  console.log(`  ${f.id}: ${f.mismatches.join(', ')}`);
  console.log(`    "${f.prompt}"`);
}

fs.writeFileSync('./evals/holdout-first-run.json', JSON.stringify({ pass, fail, failures }, null, 2));
