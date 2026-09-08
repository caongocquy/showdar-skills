import { discoverScenarios, loadScenario } from './scenario-loader.js';
import { createResultContract } from './result-contract.js';
import { validateResult } from './scenario-validator.js';
import { scoreResult, aggregateScores, generateReport } from './scoring.js';
import { createMockAdapter, runScenarioWithAdapter } from './adapter.js';

export async function runBenchmark(options = {}) {
  const { 
    variant = 'showdar-0.3',
    scenarios: scenarioIds = null,
    adapter = null,
    outputDir = null
  } = options;
  
  const allScenarios = await discoverScenarios();
  const scenarios = scenarioIds 
    ? allScenarios.filter(s => scenarioIds.includes(s.id))
    : allScenarios;
  
  const runnerAdapter = adapter || createMockAdapter(variant);
  const results = [];
  const scenarioScores = [];
  
  console.log(`Running ${scenarios.length} scenarios with variant: ${variant}`);
  
  for (const scenario of scenarios) {
    console.log(`  Running: ${scenario.id}...`);
    
    const result = await runScenarioWithAdapter(scenario, runnerAdapter, variant);
    
    const validation = validateResult(result);
    if (!validation.valid) {
      console.error(`  Invalid result for ${scenario.id}: ${validation.errors.join(', ')}`);
      continue;
    }
    
    const scored = scoreResult(result, scenario);
    result.overall = scored.overall;
    result.hardFailure = scored.hardFailure;
    result.hardFailures = scored.hardFailures;
    scored.scenario = scenario;
    scored.result = result;
    
    results.push(result);
    scenarioScores.push(scored);
    
    console.log(`    Score: ${scored.overall}/1.00 (success: ${result.success})`);
  }
  
  const summary = aggregateScores(results);
  const report = generateReport(results, scenarioScores);
  
  if (outputDir) {
    await saveResults(outputDir, results, scenarioScores, summary, report);
  }
  
  return { results, scenarioScores, summary, report };
}

async function saveResults(outputDir, results, scenarioScores, summary, report) {
  const { promises: fs } = await import('fs');
  const { join } = await import('path');
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  await fs.writeFile(join(outputDir, `results-${timestamp}.json`), JSON.stringify(results, null, 2));
  await fs.writeFile(join(outputDir, `scores-${timestamp}.json`), JSON.stringify(scenarioScores, null, 2));
  await fs.writeFile(join(outputDir, `summary-${timestamp}.json`), JSON.stringify(summary, null, 2));
  await fs.writeFile(join(outputDir, `report-${timestamp}.txt`), report);
  
  console.log(`Results saved to ${outputDir}`);
}

export async function runAllVariants(scenarioIds = null, outputDir = null, options = {}) {
  const variants = ['baseline', 'legacy-showdar', 'showdar-0.3'];
  const allResults = {};
  const allReports = {};

  try {
    for (const variant of variants) {
      console.log(`\n=== Running variant: ${variant} ===`);
      const { results, scenarioScores, summary, report } = await runBenchmark({
        variant,
        scenarios: scenarioIds,
        outputDir,
        adapter: options.adapter ?? null
      });
      allResults[variant] = { results, scenarioScores, summary };
      allReports[variant] = report;
    }
  } finally {
    await options.adapter?.close?.();
  }

  const results = Object.values(allResults).flatMap((variant) => variant.results);
  const scenarioScores = Object.values(allResults).flatMap((variant) => variant.scenarioScores);
  return { allResults, allReports, results, scenarioScores, report: generateReport(results, scenarioScores) };
}
