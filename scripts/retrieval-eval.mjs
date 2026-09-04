#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport, runEvaluation } from './lib/retrieval-eval.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suiteFile = path.join(packageRoot, 'evals', 'retrieval-cases.json');

try {
  const evaluation = await runEvaluation(packageRoot, suiteFile);
  console.log(formatReport(evaluation.summary, evaluation.results.filter((result) => !result.passed)));
  if (evaluation.summary.overall.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(`retrieval evaluation: ${error.message}`);
  process.exitCode = 1;
}
