import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflowScenario, summarizeWorkflowResults } from '../benchmark/lib/workflow-eval-core.js';
import { validateWorkflowScenario } from '../benchmark/lib/workflow-scenario-loader.js';
import { createExtensionCatalog } from '../src/extension-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function usage() {
  console.log('Usage: node scripts/custom-workflows-eval.mjs --scenarios <dir> [--pack <pack.json>]...');
  console.log('Explicit opt-in only. Never part of npm run eval or the release gate.');
}

const args = process.argv.slice(2);
const scenariosDir = args[args.indexOf('--scenarios') + 1];
const packPaths = args.flatMap((arg, i) => (arg === '--pack' ? [args[i + 1]] : []));
if (!scenariosDir || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(scenariosDir ? 0 : 1);
}

const packs = [];
const workflows = {};
for (const packPath of packPaths) {
  const resolved = path.resolve(packPath);
  const manifest = JSON.parse(await readFile(resolved, 'utf8'));
  const packRoot = path.dirname(resolved);
  const docs = {};
  for (const workflow of manifest.workflows ?? []) {
    docs[workflow.id] = JSON.parse(await readFile(path.join(packRoot, workflow.path), 'utf8'));
  }
  packs.push({ manifest, workflows: docs });
  Object.assign(workflows, docs);
}
const catalog = createExtensionCatalog({ packs });
if (!catalog.ok) {
  console.error(`Invalid extension catalog:\n  ${catalog.errors.join('\n  ')}`);
  process.exit(1);
}
for (const id of Object.keys(workflows)) {
  if (!catalog.value.selectableStages[id]) {
    console.error(`Custom workflow not in catalog: ${id}`);
    process.exit(1);
  }
}

const dir = path.resolve(repoRoot, scenariosDir);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
if (!files.length) throw new Error(`No custom scenarios in ${scenariosDir}`);
const scenarios = [];
for (const file of files) {
  const scenario = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
  if (scenario.workflow?.startsWith('showdar-')) {
    console.error(`Custom corpus MUST NOT evaluate built-in workflows: ${file}`);
    process.exit(1);
  }
  if (!catalog.value.selectableStages[scenario.workflow]) {
    console.error(`Scenario ${file} references unknown custom workflow: ${scenario.workflow}`);
    process.exit(1);
  }
  const { id, workflow, selection, steps, resolutionStubs, expected } = scenario;
  if (!id || !workflow || !selection || !steps || !resolutionStubs || !expected) {
    console.error(`Invalid custom scenario ${file}: missing required top-level keys`);
    process.exit(1);
  }
  const shapeCheck = { ...scenario, workflow: 'showdar-feature' };
  const validation = await validateWorkflowScenario(shapeCheck);
  if (!validation.valid) {
    const structural = validation.errors.filter((e) => !e.includes('workflow'));
    if (structural.length) {
      console.error(`Invalid custom scenario ${file}: ${structural.join(', ')}`);
      process.exit(1);
    }
  }
  scenarios.push(scenario);
}
const results = scenarios.map((scenario) => {
  const result = runWorkflowScenario(scenario, catalog.value);
  if (!result.pass) console.error(`FAIL ${scenario.id}:\n  ${result.failures.join('\n  ')}`);
  return result;
});
const { passCount, failedIds, byWorkflow } = summarizeWorkflowResults(scenarios, results);
console.log(`Custom workflow eval: ${scenarios.length} scenarios`);
for (const [workflow, bucket] of [...byWorkflow.entries()].sort()) {
  console.log(`  ${workflow}: ${bucket.pass}/${bucket.total}`);
}
console.log(`Exact pass count: ${passCount}/${scenarios.length}`);
if (failedIds.length) {
  console.log(`Failed: ${failedIds.join(', ')}`);
  process.exit(1);
}
