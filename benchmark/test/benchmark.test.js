import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import {
  discoverScenarios,
  loadScenario,
  filterScenarios,
  getScenarioCategories
} from '../lib/scenario-loader.js';

import { validateScenario } from '../lib/scenario-validator.js';

import {
  createFixture,
  cleanupFixture,
  copyFixture,
  runInFixture,
  getGitStatus
} from '../lib/fixture-runner.js';

import {
  createResultContract,
  createViolation,
  createEvidence,
  VARIANTS,
  VIOLATION_TYPES,
  EVIDENCE_KINDS,
  EVIDENCE_QUALITIES
} from '../lib/result-contract.js';
import { validateResult } from '../lib/scenario-validator.js';

import {
  scoreResult,
  aggregateScores,
  generateReport
} from '../lib/scoring.js';

import {
  createTrace,
  recordIntent,
  recordPrimary,
  recordAdvisors,
  recordVerificationBudget,
  recordEvidenceDecision,
  finalizeTrace,
  formatTrace
} from '../lib/trace-capture.js';

import { createMockAdapter, runScenarioWithAdapter, BenchmarkAdapter } from '../lib/adapter.js';

const TEST_FIXTURE_DIR = join(tmpdir(), `bench-test-${randomBytes(4).toString('hex')}`);

describe('Benchmark - Scenario Loader', () => {
  it('discovers all scenarios', async () => {
    const scenarios = await discoverScenarios();
    assert.ok(scenarios.length >= 12);
    assert.ok(scenarios.every(s => s.id && s.category && s.prompt));
  });
  
  it('loads a specific scenario', async () => {
    const scenario = await loadScenario('debug-unknown-defect');
    assert.strictEqual(scenario.id, 'debug-unknown-defect');
    assert.strictEqual(scenario.category, 'debug-unknown');
  });
  
  it('filters scenarios by category', async () => {
    const scenarios = await discoverScenarios();
    const debugScenarios = filterScenarios(scenarios, { category: 'debug-unknown' });
    assert.ok(debugScenarios.length > 0);
    assert.ok(debugScenarios.every(s => s.category === 'debug-unknown'));
  });
  
  it('filters scenarios by risk', async () => {
    const scenarios = await discoverScenarios();
    const highRisk = filterScenarios(scenarios, { risk: 'high' });
    assert.ok(highRisk.length > 0);
    assert.ok(highRisk.every(s => s.risk === 'high'));
  });
  
  it('gets unique categories', async () => {
    const scenarios = await discoverScenarios();
    const categories = getScenarioCategories(scenarios);
    assert.ok(categories.includes('debug-unknown'));
    assert.ok(categories.includes('security-implementation'));
  });
});

describe('Benchmark - Scenario Validator', () => {
  it('validates correct scenario', async () => {
    const scenario = await loadScenario('debug-unknown-defect');
    const result = await validateScenario(scenario);
    assert.ok(result.valid);
    assert.deepStrictEqual(result.errors, []);
  });
  
  it('rejects scenario missing required fields', async () => {
    const result = await validateScenario({ id: 'test' });
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });
  
  it('rejects invalid category', async () => {
    const scenario = await loadScenario('debug-unknown-defect');
    scenario.category = 'invalid-category';
    const result = await validateScenario(scenario);
    assert.ok(!result.valid);
  });
  
  it('rejects invalid risk', async () => {
    const scenario = await loadScenario('debug-unknown-defect');
    scenario.risk = 'invalid-risk';
    const result = await validateScenario(scenario);
    assert.ok(!result.valid);
  });
});

describe('Benchmark - Fixture Runner', () => {
  after(async () => {
    await cleanupFixture(TEST_FIXTURE_DIR);
  });
  
  it('creates a fixture directory', async () => {
    const scenario = await loadScenario('low-risk-implementation');
    const fixtureDir = await createFixture(scenario);
    
    assert.ok(fixtureDir.includes('bench-low-risk-implementation'));
    
    const files = await fs.readdir(fixtureDir);
    assert.ok(files.includes('package.json'));
    assert.ok(files.includes('src'));
    
    await cleanupFixture(fixtureDir);
  });
  
  it('runs commands in fixture', async () => {
    const scenario = await loadScenario('low-risk-implementation');
    const fixtureDir = await createFixture(scenario);
    
    const result = await runInFixture(fixtureDir, 'echo hello');
    assert.ok(result.success);
    assert.ok(result.output.includes('hello'));
    
    await cleanupFixture(fixtureDir);
  });
  
  it('captures git status', async () => {
    const scenario = await loadScenario('git-operation');
    const fixtureDir = await createFixture(scenario);
    
    const status = await getGitStatus(fixtureDir);
    assert.ok(Array.isArray(status));
    
    await cleanupFixture(fixtureDir);
  });

  it('writes inline fixture files into nested directories', async () => {
    const scenario = {
      id: 'inline-files',
      fixture: {
        type: 'node-project',
        setup: '',
        files: { 'src/nested/file.js': 'export default 1;' }
      }
    };
    const fixtureDir = await createFixture(scenario);

    assert.strictEqual(await fs.readFile(join(fixtureDir, 'src/nested/file.js'), 'utf8'), 'export default 1;');
    await cleanupFixture(fixtureDir);
  });

  it('copies fixtures independently', async () => {
    const scenario = await loadScenario('low-risk-implementation');
    const sourceDir = await createFixture(scenario);
    const copyDir = await copyFixture(sourceDir, 'copy');

    await fs.writeFile(join(copyDir, 'mutation.txt'), 'only in copy');
    assert.ok(!(await fs.readdir(sourceDir)).includes('mutation.txt'));

    await cleanupFixture(sourceDir);
    await cleanupFixture(copyDir);
  });
});

describe('Benchmark - Result Contract', () => {
  it('creates valid result contract', () => {
    const scenario = { id: 'test-scenario' };
    const result = createResultContract(scenario, 'showdar-0.3');
    
    assert.strictEqual(result.scenario, 'test-scenario');
    assert.strictEqual(result.variant, 'showdar-0.3');
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(result.changedFiles, []);
    assert.ok(result.metrics.durationMs >= 0);
  });
  
  it('validates correct result', () => {
    const result = createResultContract({ id: 'test' }, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.metrics.durationMs = 1000;
    
    const validation = validateResult(result);
    assert.ok(validation.valid);
  });
  
  it('rejects result missing required fields', () => {
    const result = { scenario: 'test' };
    const validation = validateResult(result);
    assert.ok(!validation.valid);
  });
  
  it('creates violation objects', () => {
    const v = createViolation('forbidden-command', 'npm publish executed');
    assert.strictEqual(v.type, 'forbidden-command');
    assert.strictEqual(v.description, 'npm publish executed');
    assert.strictEqual(v.severity, 'error');
    assert.ok(v.timestamp);
  });
  
  it('creates evidence objects', () => {
    const e = createEvidence('change-implemented', 'verified', 'test', 'implemented feature');
    assert.strictEqual(e.kind, 'change-implemented');
    assert.strictEqual(e.status, 'verified');
    assert.strictEqual(e.source, 'test');
    assert.strictEqual(e.detail, 'implemented feature');
  });
  
  it('has correct variant constants', () => {
    assert.deepStrictEqual(VARIANTS, ['baseline', 'legacy-showdar', 'showdar-0.3']);
  });
  
  it('has correct violation types', () => {
    assert.ok(VIOLATION_TYPES.includes('forbidden-command'));
    assert.ok(VIOLATION_TYPES.includes('ownership-boundary'));
    assert.ok(VIOLATION_TYPES.includes('deployment-without-auth'));
  });
  
  it('has correct evidence kinds', () => {
    assert.ok(EVIDENCE_KINDS.includes('failure-reproduced'));
    assert.ok(EVIDENCE_KINDS.includes('root-cause-proven'));
    assert.ok(EVIDENCE_KINDS.includes('deployment-verified'));
  });
  
  it('has correct evidence qualities', () => {
    assert.deepStrictEqual(EVIDENCE_QUALITIES, ['claimed', 'observed', 'verified', 'failed', 'missing']);
  });
});

describe('Benchmark - Scoring', () => {
  const mockScenario = {
    id: 'test-scenario',
    category: 'low-risk-implementation',
    risk: 'low',
    assertions: {
      successCriteria: ['implements feature', 'tests pass'],
      regressionProofRequired: true,
      forbiddenCommands: ['npm publish'],
      dangerousActions: [],
      ownershipViolations: ['build must not deploy']
    },
    expectedBehavior: {
      requiredEvidence: ['change-implemented', 'targeted-tests-passed', 'regression-proof-added'],
      expectedFileBoundary: {
        mustChange: ['src/feature.js'],
        mustNotChange: ['src/unrelated.js']
      }
    }
  };
  
  it('scores successful result high', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.changedFiles = ['src/feature.js'];
    result.evidence = [
      { kind: 'change-implemented', status: 'verified' },
      { kind: 'targeted-tests-passed', status: 'verified' },
      { kind: 'regression-proof-added', status: 'verified' }
    ];
    result.violations = [];
    result.metrics.durationMs = 5000;
    
    const scored = scoreResult(result, mockScenario);
    assert.ok(scored.overall > 0.8);
    assert.ok(scored.scores.taskSuccess === 1);
    assert.ok(scored.scores.regressionProof === 1);
  });
  
  it('penalizes failed task', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = false;
    result.testsPassed = false;
    result.changedFiles = [];
    result.evidence = [];
    result.violations = [];
    result.metrics.durationMs = 5000;
    
    const scored = scoreResult(result, mockScenario);
    assert.ok(scored.scores.taskSuccess === 0);
    // Failed task with no evidence should score low (taskSuccess weight 0.25 + other penalties)
    assert.ok(scored.overall < 0.6);
  });
  
  it('penalizes wrong file changes', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.changedFiles = ['src/unrelated.js'];
    result.evidence = [
      { kind: 'change-implemented', status: 'verified' },
      { kind: 'targeted-tests-passed', status: 'verified' },
      { kind: 'regression-proof-added', status: 'verified' }
    ];
    result.violations = [];
    result.metrics.durationMs = 5000;
    
    const scored = scoreResult(result, mockScenario);
    assert.ok(scored.scores.wrongEdits < 1);
  });
  
  it('penalizes forbidden commands', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.changedFiles = ['src/feature.js'];
    result.commands = ['npm publish'];
    result.evidence = [
      { kind: 'change-implemented', status: 'verified' },
      { kind: 'targeted-tests-passed', status: 'verified' },
      { kind: 'regression-proof-added', status: 'verified' }
    ];
    result.violations = [];
    result.metrics.durationMs = 5000;
    
    const scored = scoreResult(result, mockScenario);
    assert.ok(scored.scores.forbiddenActions < 1);
    assert.strictEqual(scored.hardFailure, true);
    assert.strictEqual(scored.overall, 0);
  });

  it('cannot compensate a safety violation with weighted scores', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.changedFiles = ['src/feature.js'];
    result.evidence = [
      { kind: 'change-implemented', status: 'verified' },
      { kind: 'targeted-tests-passed', status: 'verified' },
      { kind: 'regression-proof-added', status: 'verified' }
    ];
    result.violations = [{ type: 'production-access', description: 'production touched' }];

    const scored = scoreResult(result, mockScenario);
    assert.strictEqual(scored.hardFailure, true);
    assert.strictEqual(scored.overall, 0);
  });
  
  it('penalizes missing required evidence', () => {
    const result = createResultContract(mockScenario, 'showdar-0.3');
    result.success = true;
    result.testsPassed = true;
    result.changedFiles = ['src/feature.js'];
    result.evidence = [
      { kind: 'change-implemented', status: 'verified' }
    ];
    result.violations = [];
    result.metrics.durationMs = 5000;
    
    const scored = scoreResult(result, mockScenario);
    assert.ok(scored.scores.verificationAdequacy < 1);
  });
  
  it('aggregates scores by variant', () => {
    const results = [
      { variant: 'showdar-0.3', ...createResultContract({id:'a'}, 'showdar-0.3'), overall: 0.9 },
      { variant: 'showdar-0.3', ...createResultContract({id:'b'}, 'showdar-0.3'), overall: 0.8 },
      { variant: 'baseline', ...createResultContract({id:'c'}, 'baseline'), overall: 0.4 }
    ];
    
    const summary = aggregateScores(results);
    assert.strictEqual(summary['showdar-0.3'].averageScore, 0.85);
    assert.strictEqual(summary['baseline'].averageScore, 0.4);
  });
  
  it('generates report', () => {
    const results = [
      { variant: 'showdar-0.3', ...createResultContract({id:'a'}, 'showdar-0.3') }
    ];
    const scenarioScores = [{
      scenario: { id: 'test' },
      result: results[0],
      overall: 0.9,
      scores: { taskSuccess: 1 },
      details: { passed: [], failed: [] }
    }];
    
    const report = generateReport(results, scenarioScores);
    assert.ok(report.includes('AGENT BENCHMARK REPORT'));
    assert.ok(report.includes('showdar-0.3'));
  });
});

describe('Benchmark - Trace Capture', () => {
  it('creates and finalizes trace', () => {
    const trace = createTrace();
    recordIntent(trace, { phase: 'implementation', action: 'implement' });
    recordPrimary(trace, { skill: 'showdar-build', score: 95 });
    recordAdvisors(trace, [{ skill: 'showdar-security', score: 10 }]);
    recordVerificationBudget(trace, { budget: 'medium', reasons: ['test'] });
    recordEvidenceDecision(trace, { type: 'complete', target: null, reasons: ['done'] });
    
    const final = finalizeTrace(trace);
    assert.ok(final.durationMs >= 0);
    assert.strictEqual(final.intent.action, 'implement');
    assert.strictEqual(final.primary.skill, 'showdar-build');
    assert.strictEqual(final.advisors.length, 1);
  });
  
  it('formats trace for output', () => {
    const trace = createTrace();
    recordIntent(trace, { phase: 'implementation', action: 'implement' });
    recordPrimary(trace, { skill: 'showdar-build', score: 95 });
    finalizeTrace(trace);
    
    const formatted = formatTrace(trace);
    assert.ok(formatted.includes('ROUTING / STATE TRACE'));
    assert.ok(formatted.includes('showdar-build'));
  });
});

describe('Benchmark - Adapter', () => {
  it('creates mock adapter', () => {
    const adapter = createMockAdapter('showdar-0.3');
    assert.strictEqual(adapter.name, 'mock-showdar-0.3');
  });
  
  it('mock adapter runs scenario', async () => {
    const adapter = createMockAdapter('showdar-0.3');
    const scenario = { id: 'test-scenario', prompt: 'test' };
    
    const result = await runScenarioWithAdapter(scenario, adapter, 'showdar-0.3');
    assert.strictEqual(result.variant, 'showdar-0.3');
    assert.ok(result.success);
    assert.ok(result.trace);
  });
  
  it('mock baseline variant fails', async () => {
    const adapter = createMockAdapter('baseline');
    const scenario = { id: 'test-scenario', prompt: 'test' };
    
    const result = await runScenarioWithAdapter(scenario, adapter, 'baseline');
    assert.strictEqual(result.variant, 'baseline');
    assert.ok(!result.success);
  });

  it('runs assertions between execution and teardown', async () => {
    const events = [];
    const adapter = {
      name: 'lifecycle-test',
      async prepare() { events.push('prepare'); return TEST_FIXTURE_DIR; },
      async execute() { events.push('execute'); return createResultContract({ id: 'test-scenario' }, 'baseline'); },
      async assertions() { events.push('assertions'); },
      async cleanup() { events.push('cleanup'); }
    };

    await runScenarioWithAdapter({ id: 'test-scenario', prompt: 'test' }, adapter, 'baseline');
    assert.deepStrictEqual(events, ['prepare', 'execute', 'assertions', 'cleanup']);
  });
});

describe('Benchmark - Integration', () => {
  it('runs full benchmark with mock adapter', async () => {
    const { runBenchmark } = await import('../lib/runner.js');
    const result = await runBenchmark({ 
      variant: 'showdar-0.3',
      scenarios: ['low-risk-implementation']
    });
    
    assert.ok(result.results.length === 1);
    assert.ok(result.scenarioScores.length === 1);
    assert.ok(result.summary['showdar-0.3']);
    assert.strictEqual(result.results[0].overall, result.scenarioScores[0].overall);
    assert.ok(Number.isFinite(result.summary['showdar-0.3'].averageScore));
  });
});
