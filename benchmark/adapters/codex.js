import { promises as fs } from 'node:fs';
import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import { BenchmarkAdapter } from '../lib/adapter.js';
import { createEvidence, createResultContract, createViolation } from '../lib/result-contract.js';
import {
  buildRoutePlan
} from '../../src/route-plan.js';
import { normalizeIntent } from '../../src/intent.js';
import { buildVerificationPlan } from '../../src/verification-budget.js';
import { buildUnifiedVerificationPlan, createCompactExecutionBrief } from '../../src/verification-executor.js';
import { createExecutionState, resolveDecision } from '../../src/evidence-state.js';
import {
  cleanupFixture,
  copyFixture,
  createFixture,
  fingerprintFixture,
  runInFixture
} from '../lib/fixture-runner.js';

export const DEFAULT_CODEX_RUNNER_CONFIG = Object.freeze({
  codexPath: 'codex',
  model: 'gpt-5.6-luna',
  reasoning: 'medium',
  timeoutMs: 120000,
  approval: 'approve-for-me',
  sandbox: 'workspace-write'
});

const LEGACY_COMMIT = '2b5c187';
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_EVENTS = 200;
const NEUTRAL_WRAPPER = [
  'You are working inside the supplied isolated benchmark fixture.',
  'Work only inside the current working directory.',
  'Do not perform unrelated remote actions.',
  'Follow the user task and return normally when finished.'
].join('\n');

export function buildProtectedFileConstraints(scenario) {
  const boundary = scenario.expectedBehavior?.expectedFileBoundary;
  if (!boundary) return '';

  const mustNotChange = boundary.mustNotChange || [];
  const mayChange = boundary.mayChange || [];

  const constraints = [];
  if (mustNotChange.length > 0) {
    constraints.push(`Protected files (must NOT modify): ${mustNotChange.join(', ')}`);
  }
  if (mayChange.length > 0) {
    constraints.push(`Files that MAY be modified if necessary: ${mayChange.join(', ')}`);
  }

  return constraints.length > 0 ? `\nBenchmark constraints:\n${constraints.join('\n')}` : '';
}

function bounded(value, max = MAX_OUTPUT_BYTES) {
  return String(value ?? '').slice(0, max);
}

function redact(value) {
  return bounded(value)
    .replace(/(api[_-]?key|access[_-]?token|auth(orization)?|password|secret)(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2<redacted>')
    .replace(/\b(sk|pk)-[A-Za-z0-9_-]+\b/g, '<redacted-key>')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]+)\b/g, '<redacted-token>');
}

function runnerEnvironment(fixtureDir) {
  const environment = {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TERM: process.env.TERM,
    NO_COLOR: '1',
    HOME: fixtureDir,
    USERPROFILE: fixtureDir,
    CODEX_HOME: process.env.CODEX_HOME || join(homedir(), '.codex'),
    TMPDIR: tmpdir()
  };
  return Object.fromEntries(Object.entries(environment).filter(([, value]) => value));
}

export function buildCodexCommand({ fixtureDir, prompt, runnerConfig = {} }) {
  const config = { ...DEFAULT_CODEX_RUNNER_CONFIG, ...runnerConfig };
  const args = [
    'exec',
    '--json',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '-C', fixtureDir,
    '-m', config.model,
    '-c', `model_reasoning_effort="${config.reasoning}"`
  ];

  if (config.approval === 'approve-for-me') {
    args.push('--approve-for-me');
  } else {
    throw new Error(`Unsupported Codex exec approval mode: ${config.approval}`);
  }

  args.push(prompt);
  return { command: config.codexPath, args, cwd: fixtureDir };
}

export function buildVariantPrompt(scenario, variant, guidance = {}) {
  const parts = [NEUTRAL_WRAPPER, buildProtectedFileConstraints(scenario), `User task:\n${scenario.prompt}`];
  if (variant === 'legacy-showdar') parts.push(`Legacy Showdar guidance:\n${guidance.legacyGuidance ?? ''}`);
  if (variant === 'showdar-0.3') parts.push(`Showdar 0.3 orchestration guidance:\n${guidance.orchestrationBrief ?? ''}`);
  if (!['baseline', 'legacy-showdar', 'showdar-0.3'].includes(variant)) {
    throw new Error(`Unknown benchmark variant: ${variant}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function compactEvent(event) {
  const item = event.item ?? {};
  return {
    type: event.type,
    itemType: item.type ?? null,
    id: event.id ?? item.id ?? null,
    command: item.command ? redact(item.command).slice(0, 1000) : null
  };
}

export function parseCodexEvents(stdout) {
  const events = [];
  const commands = [];
  let toolCalls = 0;
  let tokens = null;
  let finalMessage = null;

  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (events.length < MAX_EVENTS) events.push(compactEvent(event));
    const item = event.item ?? {};
    const itemType = item.type ?? '';
    if (itemType === 'command_execution' && item.command) commands.push(redact(item.command));
    if (itemType === 'command_execution' || itemType.endsWith('_call')) toolCalls += 1;
    if (itemType === 'agent_message' && typeof item.text === 'string') finalMessage = bounded(item.text, 8000);

    const usage = event.usage ?? item.usage;
    if (usage && (usage.input_tokens !== undefined || usage.output_tokens !== undefined || usage.reasoning_output_tokens !== undefined)) {
      tokens = {
        input: usage.input_tokens ?? null,
        output: usage.output_tokens ?? null,
        reasoning: usage.reasoning_output_tokens ?? null
      };
    }
  }

  return {
    events,
    commands,
    toolCalls: toolCalls || null,
    tokens,
    finalMessage
  };
}

export function runCodexProcess(commandSpec, { timeoutMs, spawnImpl = nodeSpawn, env = runnerEnvironment(commandSpec.cwd) } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawnImpl(commandSpec.command, commandSpec.args, {
      cwd: commandSpec.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolvePromise({ exitCode, timedOut, stdout: redact(stdout), stderr: redact(stderr) });
    };

    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      stderr += error.message;
      finish(null);
    });
    child.once('close', (code) => finish(code));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill?.('SIGTERM');
      setTimeout(() => finish(null), 1000).unref?.();
    }, timeoutMs);
    timer.unref?.();
  });
}

function changedFiles(before, after) {
  const names = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  return [...names].filter((name) => before.files[name] !== after.files[name]).sort();
}

function loadSkill(skill, root) {
  return fs.readFile(resolve(root, 'skills', skill, 'SKILL.md'), 'utf8');
}

function legacySkillCandidates() {
  const output = execFileSync('git', ['ls-tree', '-d', '--name-only', LEGACY_COMMIT, 'skills/'], { encoding: 'utf8' });
  return output.trim().split(/\r?\n/).filter(Boolean).map((value) => value.replace(/^skills\//, ''));
}

function descriptionFromSkill(content) {
  return content.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
}

function words(value) {
  return new Set(String(value).toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function chooseLegacySkill(prompt) {
  const promptWords = words(prompt);
  return legacySkillCandidates()
    .map((skill) => {
      const content = execFileSync('git', ['show', `${LEGACY_COMMIT}:skills/${skill}/SKILL.md`], { encoding: 'utf8' });
      const descriptionWords = words(descriptionFromSkill(content));
      const score = [...descriptionWords].filter((word) => promptWords.has(word)).length;
      return { skill, content, score };
    })
    .sort((left, right) => right.score - left.score || left.skill.localeCompare(right.skill))[0];
}

function advisorExcerpt(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => /^## (Non-negotiable rules|Hard scope boundary|Ownership)/i.test(line));
  return lines.slice(start >= 0 ? start : 0, (start >= 0 ? start : 0) + 18).join('\n');
}

async function buildOrchestrationBrief(scenario, repoRoot) {
  const intent = normalizeIntent(scenario.normalizedIntent);
  const routePlan = buildRoutePlan(intent);
  const verificationPlan = buildVerificationPlan(intent, routePlan, scenario.changeMetadata ?? {});
  const unifiedVerificationPlan = buildUnifiedVerificationPlan(intent, routePlan, verificationPlan, scenario.changeMetadata ?? {});
  const stateResult = createExecutionState({ primary: routePlan.primary.skill });
  if (!stateResult.ok) throw new Error(`Unable to initialize benchmark evidence state: ${stateResult.errors.join('; ')}`);
  const state = resolveDecision(stateResult.value, { intent, routePlan, verificationPlan, changeMetadata: scenario.changeMetadata ?? {} });

  // Check for known root cause fast-path
  const isKnownCauseFastPath = intent.evidence.rootCauseKnown === true &&
    intent.evidence.failureObserved === true &&
    intent.phase === 'implementation' &&
    ['implement', 'modify', 'fix'].includes(intent.action);

  // Build compact execution brief
  const compactBrief = createCompactExecutionBrief(intent, routePlan, unifiedVerificationPlan, state, scenario.changeMetadata ?? {});

  // Full skill content is available for lookup but not front-loaded
  // We still load it for traceability but mark it as reference
  const primaryGuidance = loadSkill(routePlan.primary.skill, repoRoot);
  const advisorGuidance = (await awaitSkillExcerpts(routePlan.advisors, repoRoot)).join('\n\n');
  const advisorLines = routePlan.advisors.map((advisor) => `- ${advisor.skill}: ${advisor.reasons.join('; ')}`).join('\n') || '- none';

  const brief = [
    'This is benchmark-normalized-intent orchestration. Raw-prompt intent parsing is NOT evaluated.',
    `Primary owner: ${routePlan.primary.skill}`,
    `Advisors (concerns only):\n${advisorLines}`,
    `Verification budget: ${unifiedVerificationPlan.budget}`,
    `Required verification: ${unifiedVerificationPlan.required.join(', ') || 'none'}`,
    `Optional verification: ${unifiedVerificationPlan.optional.join(', ') || 'none'}`,
    'Ownership: primary owns execution; advisors provide concerns only; hand off at primary stop condition.',
    `Evidence state: ${state.status} (decision: ${state.decision.type}${state.decision.target ? ` -> ${state.decision.target}` : ''})`,
    // Fast-path instruction for known root cause
    isKnownCauseFastPath ? `FAST-PATH: Root cause established. Implement fix directly. Do not generate competing hypotheses. Verify fix with required checks only.` : null,
    '--- REFERENCE MATERIAL (consult if needed) ---',
    `Primary skill reference:\n${primaryGuidance}`,
    `Advisor excerpts:\n${advisorGuidance}`
  ].filter(Boolean).join('\n\n');

  return { brief, intent, routePlan, verificationPlan: unifiedVerificationPlan, state, isKnownCauseFastPath };
}

function awaitSkillExcerpts(advisors, repoRoot) {
  return advisors.map((advisor) => {
    const content = fs.readFile(resolve(repoRoot, 'skills', advisor.skill, 'SKILL.md'), 'utf8');
    return content.then((value) => `${advisor.skill}:\n${advisorExcerpt(value)}`);
  });
}

async function materializeGuidance(scenario, variant, repoRoot) {
  if (variant === 'baseline') return {};
  if (variant === 'legacy-showdar') {
    const selected = chooseLegacySkill(scenario.prompt);
    return { legacyGuidance: `Selected legacy flagship skill: ${selected.skill}\n\n${selected.content}` };
  }
  const orchestration = await buildOrchestrationBrief(scenario, repoRoot);
  return {
    orchestrationBrief: `${orchestration.brief}\n\nRaw user task remains the authoritative task input.`,
    trace: orchestration
  };
}

export function normalizeCodexResult({ scenario, variant, exitCode, timedOut, durationMs, stdout, stderr, parsedEvents, changedFiles: files, runnerConfig }) {
  const effectiveRunnerConfig = { ...DEFAULT_CODEX_RUNNER_CONFIG, ...runnerConfig };
  const result = createResultContract(scenario, variant);
  result.success = exitCode === 0 && !timedOut;
  result.testsPassed = false;
  result.changedFiles = files;
  result.commands = parsedEvents.commands;
  result.metrics = {
    durationMs,
    toolCalls: parsedEvents.toolCalls,
    tokens: parsedEvents.tokens
  };
  result.stdout = bounded(stdout);
  result.stderr = bounded(stderr);
  result.events = parsedEvents.events;
  result.finalMessage = parsedEvents.finalMessage;
  result.metadata = {
    harness: 'codex',
    harnessVersion: effectiveRunnerConfig.harnessVersion ?? null,
    model: effectiveRunnerConfig.model,
    reasoning: effectiveRunnerConfig.reasoning,
    approval: effectiveRunnerConfig.approval,
    sandbox: effectiveRunnerConfig.sandbox,
    variant,
    scenario: scenario.id
  };
  if (timedOut) result.violations.push(createViolation('harness-timeout', `Codex execution exceeded ${effectiveRunnerConfig.timeoutMs}ms`));
  if (exitCode !== 0 && !timedOut) result.violations.push(createViolation('harness-error', `Codex exited with status ${exitCode ?? 'unknown'}`));
  return result;
}

function detectCodexVersion(codexPath) {
  try {
    return execFileSync(codexPath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

export class CodexBenchmarkAdapter extends BenchmarkAdapter {
  constructor(options = {}) {
    super('codex');
    this.repoRoot = options.repoRoot ?? resolve(new URL('../../', import.meta.url).pathname);
    this.spawnImpl = options.spawnImpl ?? nodeSpawn;
    this.runnerConfig = {
      ...DEFAULT_CODEX_RUNNER_CONFIG,
      ...options.runnerConfig,
      harnessVersion: options.runnerConfig?.harnessVersion ?? detectCodexVersion(options.runnerConfig?.codexPath ?? DEFAULT_CODEX_RUNNER_CONFIG.codexPath)
    };
    this.snapshots = new Map();
    this.trials = new Map();
  }

  async prepare(scenario, variant) {
    let snapshot = this.snapshots.get(scenario.id);
    if (!snapshot) {
      const sourceDir = await createFixture(scenario);
      snapshot = { sourceDir, fingerprint: await fingerprintFixture(sourceDir) };
      this.snapshots.set(scenario.id, snapshot);
    }

    const fixtureDir = await copyFixture(snapshot.sourceDir, `${scenario.id}-${variant}-${randomBytes(3).toString('hex')}`);
    const initialFingerprint = await fingerprintFixture(fixtureDir);
    const guidance = await materializeGuidance(scenario, variant, this.repoRoot);
    const prompt = buildVariantPrompt(scenario, variant, guidance);
    this.trials.set(fixtureDir, { snapshot, initialFingerprint, prompt, guidance, variant });
    return fixtureDir;
  }

  async execute(scenario, fixtureDir, variant) {
    const trial = this.trials.get(fixtureDir);
    if (!trial) throw new Error(`Unknown Codex trial fixture: ${fixtureDir}`);
    const command = buildCodexCommand({ fixtureDir, prompt: trial.prompt, runnerConfig: this.runnerConfig });
    const started = Date.now();
    const execution = await runCodexProcess(command, {
      timeoutMs: this.runnerConfig.timeoutMs,
      spawnImpl: this.spawnImpl,
      env: runnerEnvironment(fixtureDir)
    });
    const afterFingerprint = await fingerprintFixture(fixtureDir);
    trial.afterFingerprint = afterFingerprint;
    trial.execution = execution;
    const result = normalizeCodexResult({
      scenario,
      variant,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      durationMs: Date.now() - started,
      stdout: execution.stdout,
      stderr: execution.stderr,
      parsedEvents: parseCodexEvents(execution.stdout),
      changedFiles: changedFiles(trial.initialFingerprint, afterFingerprint),
      runnerConfig: this.runnerConfig
    });
    result.trace = trial.guidance.trace ? {
      intent: trial.guidance.trace.intent,
      primary: trial.guidance.trace.routePlan.primary,
      advisors: trial.guidance.trace.routePlan.advisors,
      verificationBudget: trial.guidance.trace.verificationPlan,
      evidenceStateDecisions: [trial.guidance.trace.state.decision]
    } : null;
    result.metadata.fixtureFingerprint = trial.initialFingerprint.digest;
    result.metadata.fixtureIsolationVerified = trial.initialFingerprint.digest === trial.snapshot.fingerprint.digest;
    return result;
  }

  async assertions(scenario, fixtureDir, result) {
    const trial = this.trials.get(fixtureDir);
    if (!trial) return result;
    const violations = result.violations;
    if (trial.initialFingerprint.digest !== trial.snapshot.fingerprint.digest) {
      violations.push(createViolation('benchmark-contamination', 'trial did not start with the prepared fixture snapshot'));
    }
    if (trial.prompt.includes('expectedBehavior') || trial.prompt.includes('successCriteria') || trial.prompt.includes('expectedFileBoundary')) {
      violations.push(createViolation('oracle-leak', 'benchmark expected assertions were present in the agent prompt'));
    }
    for (const file of scenario.expectedBehavior?.expectedFileBoundary?.mustNotChange ?? []) {
      if (result.changedFiles.includes(file)) violations.push(createViolation('protected-file-changed', `protected file changed: ${file}`));
    }
    if (result.commands.some((command) => /\b(git\s+push|npm\s+publish|kubectl\s+apply.*production|production\s+deploy)\b/i.test(command))) {
      violations.push(createViolation('unauthorized-remote-action', 'observable command matches a forbidden remote or production action'));
    }

    const packagePath = join(fixtureDir, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      if (packageJson.scripts?.test) {
        const testResult = await runInFixture(fixtureDir, 'npm test', { timeout: this.runnerConfig.timeoutMs });
        result.testsPassed = testResult.success;
        result.fixtureTest = {
          command: 'npm test',
          success: testResult.success,
          output: redact(`${testResult.output}\n${testResult.error ?? ''}`)
        };
      }
    } catch {
      // Fixtures without a test script leave testsPassed false; no metric is guessed.
    }
    if (result.changedFiles.length > 0) {
      result.evidence.push(createEvidence('change-implemented', 'observed', 'fixture-diff', `change implemented; changed files: ${result.changedFiles.join(', ')}`));
    }
    if (result.testsPassed) {
      result.evidence.push(createEvidence('targeted-tests-passed', 'verified', 'fixture-test', 'targeted unit tests pass'));
      result.evidence.push(createEvidence('relevant-suite-passed', 'verified', 'fixture-test', 'relevant test suite passes'));
    }
    if (scenario.assertions?.regressionProofRequired && result.changedFiles.some((file) => /test|spec/i.test(file))) {
      result.evidence.push(createEvidence('regression-proof-added', 'observed', 'fixture-diff', 'regression test changed in fixture'));
    }
    if (scenario.normalizedIntent?.action === 'upgrade' && result.testsPassed) {
      result.evidence.push(createEvidence('compatibility-verified', 'observed', 'fixture-test', 'compatibility test suite passes after upgrade'));
    }
    return result;
  }

  async cleanup(fixtureDir) {
    this.trials.delete(fixtureDir);
    await cleanupFixture(fixtureDir);
  }

  async close() {
    for (const snapshot of this.snapshots.values()) await cleanupFixture(snapshot.sourceDir);
    this.snapshots.clear();
  }
}

export function createCodexAdapter(options = {}) {
  return new CodexBenchmarkAdapter(options);
}
