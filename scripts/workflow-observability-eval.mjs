import { runWorkflowScenario, summarizeWorkflowResults } from '../benchmark/lib/workflow-eval-core.js';
import { discoverWorkflowScenarios } from '../benchmark/lib/workflow-scenario-loader.js';

const scenarios = await discoverWorkflowScenarios();
if (!scenarios.length) throw new Error('No workflow scenarios discovered');
const results = scenarios.map((scenario) => {
  const result = runWorkflowScenario(scenario);
  if (!result.pass) console.error(`FAIL ${scenario.id}:\n  ${result.failures.join('\n  ')}`);
  return result;
});
const { passCount, failedIds, byWorkflow } = summarizeWorkflowResults(scenarios, results);

console.log(`Workflow observability eval: ${scenarios.length} scenarios`);
for (const [workflow, bucket] of [...byWorkflow.entries()].sort()) {
  console.log(`  ${workflow}: ${bucket.pass}/${bucket.total}`);
}
console.log(`Exact pass count: ${passCount}/${scenarios.length}`);
if (failedIds.length) console.log(`Failed: ${failedIds.join(', ')}`);
if (failedIds.length) process.exitCode = 1;
