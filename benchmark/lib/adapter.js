export const ADAPTER_INTERFACE_VERSION = '1.0.0';

export class BenchmarkAdapter {
  constructor(name) {
    this.name = name;
  }
  
  async setup(scenario) {
    throw new Error('setup() must be implemented by adapter');
  }
  
  async run(scenario, fixtureDir) {
    throw new Error('run() must be implemented by adapter');
  }

  async assert(scenario, fixtureDir, result) {
    return result;
  }
  
  async teardown() {
    // Optional
  }

  async prepare(scenario, variant) {
    return this.setup(scenario, variant);
  }

  async execute(scenario, fixtureDir, variant) {
    return this.run(scenario, fixtureDir, variant);
  }

  async assertions(scenario, fixtureDir, result) {
    return this.assert(scenario, fixtureDir, result);
  }

  async cleanup(context) {
    return this.teardown(context);
  }
  
  getName() {
    return this.name;
  }
}

export async function runScenarioWithAdapter(scenario, adapter, variant) {
  const fixtureDir = await (adapter.prepare?.(scenario, variant) ?? adapter.setup(scenario, variant));
  
  try {
    const result = await (adapter.execute?.(scenario, fixtureDir, variant) ?? adapter.run(scenario, fixtureDir, variant));
    const asserted = await (adapter.assertions?.(scenario, fixtureDir, result)
      ?? adapter.assert?.(scenario, fixtureDir, result)
      ?? result);
    return { ...result, ...(asserted ?? {}), variant };
  } finally {
    await (adapter.cleanup?.(fixtureDir, scenario, variant) ?? adapter.teardown?.());
  }
}

export function createMockAdapter(variant) {
  return {
    name: `mock-${variant}`,
    async setup(scenario) {
      return `/tmp/mock-fixture-${scenario.id}`;
    },
    async run(scenario, fixtureDir) {
      // Mock implementation - returns a deterministic result for testing
      return {
        scenario: scenario.id,
        variant,
        timestamp: new Date().toISOString(),
        success: variant !== 'baseline',
        testsPassed: variant !== 'baseline',
        changedFiles: variant === 'showdar-0.3' ? ['src/correct-file.js'] : ['src/wrong-file.js'],
        commands: variant === 'baseline' ? ['npm publish'] : ['npm test'],
        evidence: variant === 'showdar-0.3' ? [
          { kind: 'change-implemented', status: 'verified', source: 'mock', detail: 'mock implementation' }
        ] : [],
        violations: variant === 'baseline' ? [
          { type: 'forbidden-command', description: 'npm publish executed', severity: 'error' }
        ] : [],
        metrics: { durationMs: 5000, toolCalls: 10, tokens: 5000 },
        trace: variant === 'showdar-0.3' ? {
          intent: { phase: 'implementation', action: 'implement' },
          primary: { skill: 'showdar-build', score: 95 },
          advisors: [{ skill: 'showdar-security', score: 10 }],
          verificationBudget: { budget: 'medium', reasons: ['test'] },
          evidenceStateDecisions: [{ type: 'complete', target: null, reasons: ['done'] }],
          durationMs: 5000
        } : null
      };
    },
    async teardown() {}
  };
}
