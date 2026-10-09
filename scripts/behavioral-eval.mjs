#!/usr/bin/env node
import { readFile, lstat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSuite } from './lib/behavioral-eval/scenario-contract.mjs';
import { gradeRecordedTrace } from './lib/behavioral-eval/trace-grader.mjs';
import { runCodexScenario, DEFAULT_TIMEOUT_MS, CONCURRENCY_LIMIT } from './lib/behavioral-eval/codex-cli-adapter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
const allowed = new Set(['--trace-dir', '--source-sha', '--json', '--run-codex', '--case', '--timeout-ms', '--model']);
for (const arg of args) {
  if (arg.startsWith('--') && !allowed.has(arg)) throw new Error(`Unsupported argument: ${arg}`);
}
const runCodex = args.includes('--run-codex');
const traceDir = option('--trace-dir');
const sourceSha = option('--source-sha');
const caseId = option('--case');
const timeoutValue = option('--timeout-ms');
const model = option('--model');
const timeoutMs = timeoutValue === null ? DEFAULT_TIMEOUT_MS : Number(timeoutValue);
if (traceDir && !sourceSha) throw new Error('--trace-dir requires --source-sha');
if (sourceSha && !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('--source-sha requires a full commit SHA');
if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60 * 1000) throw new Error('--timeout-ms must be between 1 and 1800000');
if (runCodex && (!caseId || !sourceSha || !model || args.filter(arg => arg === '--case').length !== 1)) throw new Error('--run-codex requires exactly one --case, --model, and a full --source-sha');
if (runCodex && traceDir) throw new Error('--run-codex cannot be combined with --trace-dir');
if (!runCodex && caseId) throw new Error('--case requires --run-codex');
if (!runCodex && model) throw new Error('--model requires --run-codex');
const suite = JSON.parse(await readFile(join(root, 'evals/behavioral/scenarios.json'), 'utf8'));
const errors = validateSuite(suite);
if (errors.length) throw new Error(`Invalid scenario suite:\n${errors.join('\n')}`);
const rows = [];
if (runCodex) {
  const scenario = suite.scenarios.find(item => item.id === caseId);
  if (!scenario) throw new Error(`Unknown behavioral case: ${caseId}`);
  const outcome = await runCodexScenario({ scenario, suite, sourceSha, model, allowModel: true, timeoutMs, concurrency: CONCURRENCY_LIMIT, repoRoot: root });
  rows.push({ id: scenario.id, family: scenario.family, critical: scenario.critical, ...outcome });
} else {
  for (const scenario of suite.scenarios) {
    let outcome = { status: 'NOT_RUN', reasons: ['No authorized host-tool trace supplied'] };
    if (traceDir) {
      const file = join(resolve(traceDir), `${scenario.id}.json`);
      try {
        if ((await lstat(file)).isSymbolicLink()) throw new Error('Trace file symlinks are refused');
        const trace = JSON.parse(await readFile(file, 'utf8'));
        outcome = gradeRecordedTrace(scenario, trace, { sourceSha });
      } catch (error) {
        if (error.code !== 'ENOENT') outcome = { status: 'BLOCKED', reasons: [`Unreadable or invalid trace: ${error.message}`] };
      }
    }
    rows.push({ id: scenario.id, family: scenario.family, critical: scenario.critical, ...outcome });
  }
}
const totals = Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_RUN'].map(k => [k, rows.filter(x => x.status === k).length]));
const report = {
  schemaVersion: 1,
  reportType: runCodex ? 'codex-cli-behavioral-run' : 'untrusted-trace-analysis',
  trustedRunnerSupported: false,
  analysisContract: 'MATCH/MISMATCH/INCOMPLETE compares submitted events only; rubric and provenance claims are untrusted',
  provenance: runCodex ? 'Codex CLI adapter; one explicitly selected case; model launch requires opt-in and sandbox preflight' : 'read-only trace import; no agent was launched',
  sourceSha: sourceSha ?? null,
  concurrencyLimit: runCodex ? CONCURRENCY_LIMIT : null,
  totals,
  cases: rows,
};
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Behavioral cases: ${rows.length}; PASS=${totals.PASS} FAIL=${totals.FAIL} BLOCKED=${totals.BLOCKED} NOT_RUN=${totals.NOT_RUN}`);
  for (const row of rows) console.log(`${row.id} ${row.status}${row.analysis ? ` analysis=${row.analysis.status}` : ''}${row.reasons.length ? ': ' + row.reasons.join('; ') : ''}`);
}
if (totals.FAIL || totals.BLOCKED) process.exitCode = 1;
