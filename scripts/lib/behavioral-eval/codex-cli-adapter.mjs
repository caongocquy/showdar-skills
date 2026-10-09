import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gradeRecordedTrace, TRUSTED_RUNNER_BLOCKER } from './trace-grader.mjs';

export const ADAPTER_VERSION = 1;
export const CONCURRENCY_LIMIT = 1;
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 32 * 1024;
const OBSERVABLE_KINDS = ['tool_invoked', 'verification_observed', 'file_written', 'git_mutation'];
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:OPENAI_API_KEY|CODEX_API_KEY|API_KEY|TOKEN|PASSWORD|SECRET)\s*[:=]\s*[^\s,;]+/gi,
];

const redact = (value, secrets = []) => {
  let text = String(value ?? '');
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[REDACTED]');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  return text;
};

function safeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new Error(`Unsafe fixture path: ${String(relativePath)}`);
  }
  const parts = relativePath.split(/[\\/]+/);
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe fixture path: ${relativePath}`);
  return parts;
}

function inside(root, relativePath) {
  const target = path.resolve(root, ...safeRelativePath(relativePath));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Fixture path escapes workspace: ${relativePath}`);
  return target;
}

function commandEvent(item, secrets) {
  const command = redact(item.command ?? '', secrets);
  const exitCode = Number.isInteger(item.exit_code) ? item.exit_code : null;
  const events = [{ kind: 'tool_invoked', attributes: { tool: 'command_execution', command, exitCode } }];
  if (/\b(?:npm|pnpm|yarn|node)\b.*(?:\btest\b|\bcheck\b|\bvalidate\b|\blint\b)/i.test(command)) {
    events.push({ kind: 'verification_observed', attributes: { command, exitCode, passed: exitCode === 0 } });
  }
  if (/\bgit\s+(?:commit|push|merge|rebase|reset|checkout|switch|tag|clean)\b/i.test(command)) {
    events.push({ kind: 'git_mutation', attributes: { command, exitCode } });
  }
  return events;
}

export function parseCodexJsonl(input, { secrets = [], workspace } = {}) {
  const events = [];
  const assistantMessages = [];
  const errors = [];
  let complete = false;
  const lines = String(input).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch { errors.push(`Invalid JSONL record at line ${index + 1}`); continue; }
    if (record.type === 'turn.completed') complete = true;
    if (record.type !== 'item.completed' || !record.item || typeof record.item !== 'object') continue;
    const item = record.item;
    if (item.type === 'command_execution') events.push(...commandEvent(item, secrets));
    else if (item.type === 'file_change') {
      const changes = Array.isArray(item.changes) ? item.changes : [item];
      for (const change of changes) {
        const filePath = typeof change.path === 'string' ? change.path : null;
        let reportedPath = filePath ? redact(filePath, secrets) : null;
        if (workspace && filePath) {
          const absolute = path.resolve(workspace, filePath);
          reportedPath = absolute.startsWith(`${workspace}${path.sep}`) ? path.relative(workspace, absolute) : '[outside-fixture]';
        }
        events.push({ kind: 'file_written', attributes: { path: reportedPath, changeType: redact(change.kind ?? '', secrets) } });
      }
    }
    else if (['mcp_tool_call', 'web_search', 'browser_use'].includes(item.type)) {
      const tool = redact(item.tool ?? item.type, secrets);
      events.push({ kind: 'tool_invoked', attributes: { tool } });
    }
    if (item.type === 'agent_message' && typeof item.text === 'string') assistantMessages.push(redact(item.text, secrets));
  }
  return { events, assistantMessages, errors, complete };
}

export function buildCodexCommand(workspace, model) {
  return {
    command: 'codex',
    args: [
      'exec', '--json', '--model', model, '--sandbox', 'workspace-write',
      '--cd', workspace, '--ephemeral', '--ignore-user-config', '--strict-config',
      '--config', 'approval_policy="on-request"',
      '--config', 'sandbox_workspace_write.network_access=false',
      '--config', 'shell_environment_policy.inherit="none"', '-'
    ],
  };
}

function buildScenarioPrompt(scenario, template) {
  return [
    `Behavioral evaluation case ${scenario.id}.`,
    `Fixture branch: ${template.branch}. Installed skills are available under .agents/skills/.`,
    'Work only inside this disposable fixture. Do not access network services or perform remote mutations.',
    'Complete the user request and leave requested evidence under artifacts/ when appropriate.',
    '',
    scenario.prompt,
  ].join('\n');
}

function restrictedEnvironment({ workspace, apiKey }) {
  const home = path.join(workspace, '.home');
  const codexHome = path.join(home, '.codex');
  const tmp = path.join(workspace, '.tmp');
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    CODEX_HOME: codexHome,
    TMPDIR: tmp,
    LANG: 'C.UTF-8',
    NO_COLOR: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    OPENAI_API_KEY: apiKey,
  };
}

async function writeFixtureFiles(workspace, files) {
  for (const [relative, content] of Object.entries(files)) {
    const parts = safeRelativePath(relative);
    if (parts[0] === '.git' || (parts[0] === '.agents' && parts[1] === 'skills')) throw new Error(`Fixture path is reserved: ${relative}`);
    const target = inside(workspace, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  }
}

function initializeFixtureRepository(workspace, branch, env) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..')) throw new Error(`Invalid fixture branch: ${branch}`);
  const gitEnv = {
    PATH: env.PATH,
    HOME: env.HOME,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Showdar Behavioral Eval',
    GIT_AUTHOR_EMAIL: 'behavioral-eval@example.invalid',
    GIT_COMMITTER_NAME: 'Showdar Behavioral Eval',
    GIT_COMMITTER_EMAIL: 'behavioral-eval@example.invalid',
  };
  execFileSync('git', ['init', '--quiet', '--initial-branch', branch, workspace], { env: gitEnv });
  execFileSync('git', ['-C', workspace, 'add', '--all'], { env: gitEnv });
  execFileSync('git', ['-C', workspace, '-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'Seed behavioral fixture'], { env: gitEnv });
}

async function copySkill(workspace, repoRoot, skillId) {
  if (!/^showdar-[a-z-]+$/.test(skillId)) throw new Error(`Invalid skill ID: ${skillId}`);
  const source = path.join(repoRoot, 'skills', skillId);
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error(`Installed skill directory is unavailable: ${skillId}`);
  const targetRoot = inside(workspace, `.agents/skills/${skillId}`);
  const copyDirectory = async (from, to) => {
    await mkdir(to, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Skill contains a symlink: ${skillId}/${entry.name}`);
      const childFrom = path.join(from, entry.name);
      const childTo = path.join(to, entry.name);
      if (entry.isDirectory()) await copyDirectory(childFrom, childTo);
      else if (entry.isFile()) await writeFile(childTo, await readFile(childFrom), { flag: 'wx', mode: 0o600 });
    }
  };
  await copyDirectory(source, targetRoot);
}

async function collectOneArtifact(workspace, relative, secrets) {
  const target = inside(workspace, relative);
  try {
    let current = workspace;
    let info;
    for (const part of safeRelativePath(relative)) {
      current = path.join(current, part);
      info = await lstat(current);
      if (info.isSymbolicLink()) return { path: relative, exists: false, reason: 'symlink refused' };
      if (current !== target && !info.isDirectory()) return { path: relative, exists: false, reason: 'parent is not a directory' };
    }
    if (info.isFile()) {
      if (info.size > 1024 * 1024) return { path: relative, exists: true, reason: 'artifact exceeds 1 MiB collection limit', size: info.size };
      const bytes = await readFile(target);
      return {
        path: relative,
        exists: true,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        content: redact(bytes.subarray(0, MAX_ARTIFACT_BYTES).toString('utf8'), secrets),
        truncated: bytes.byteLength > MAX_ARTIFACT_BYTES,
      };
    }
    if (info.isDirectory()) {
      const children = (await readdir(target)).sort();
      return { path: relative, exists: true, entries: children.slice(0, 100), truncated: children.length > 100 };
    }
    return { path: relative, exists: false, reason: 'unsupported artifact type' };
  } catch (error) {
    if (error.code === 'ENOENT') return { path: relative, exists: false };
    throw error;
  }
}

async function collectArtifacts(workspace, scenario, secrets) {
  const paths = [...new Set(scenario.oracle.rubric.map(entry => entry.artifact))];
  return Promise.all(paths.map(relative => collectOneArtifact(workspace, relative, secrets)));
}

function initialResult(scenario, sourceSha, kind, status, reasons) {
  return {
    schemaVersion: 1,
    runId: randomUUID(),
    scenarioId: scenario.id,
    sourceSha,
    status,
    reasons,
    provenance: kind === 'simulated' ? 'fake-process-fixture' : 'codex-cli-adapter',
    execution: { kind, agentLaunched: false, adapterVersion: ADAPTER_VERSION, concurrencyLimit: CONCURRENCY_LIMIT, sandbox: 'workspace-write', toolNetworkAccess: false },
    trace: null,
    artifacts: [],
  };
}

async function captureProcess(child, prompt, { timeoutMs, maxOutputBytes }) {
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let timedOut = false;
  let outputExceeded = false;
  let inputError;
  let killTimer;
  const terminate = () => {
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
  };
  const append = (target, chunk) => {
    const value = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    outputBytes += Buffer.byteLength(value);
    if (outputBytes > maxOutputBytes && !outputExceeded) {
      outputExceeded = true;
      terminate();
      return;
    }
    if (target === 'stdout') stdout += value;
    else stderr += value;
  };
  child.stdout?.on('data', chunk => append('stdout', chunk));
  child.stderr?.on('data', chunk => append('stderr', chunk));
  child.stdin?.on('error', error => { inputError = error; });
  child.stdin?.end(prompt);
  const exit = await new Promise(resolveExit => {
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); clearTimeout(killTimer); resolveExit({ error }); });
    child.once('close', (code, signal) => { clearTimeout(timer); clearTimeout(killTimer); resolveExit({ code, signal }); });
  });
  return { ...exit, stdout, stderr, timedOut, outputExceeded, inputError };
}

async function runChild(processRunner, command, args, { cwd, env, prompt = '', timeoutMs, maxOutputBytes }) {
  let child;
  try {
    child = processRunner(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return { error, stdout: '', stderr: '', timedOut: false, outputExceeded: false };
  }
  return captureProcess(child, prompt, { timeoutMs, maxOutputBytes });
}

function supportedCodexHelp(text) {
  return ['--json', '--sandbox', 'workspace-write', '--cd', '--ephemeral', '--ignore-user-config', '--strict-config', '--config']
    .every(option => text.includes(option));
}

function checkExecutionGate({ allowModel, env, sourceSha, timeoutMs, concurrency, model, simulated }) {
  if (concurrency !== CONCURRENCY_LIMIT) return `Concurrency is limited to ${CONCURRENCY_LIMIT}`;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60 * 1000) return 'Timeout must be between 1ms and 30 minutes';
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) return 'A pinned 40-character source SHA is required';
  if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(model)) return 'An explicit model name is required for comparable runs';
  if (allowModel !== true || env.SHOWDAR_BEHAVIORAL_ALLOW_MODEL !== '1') return 'Real execution requires both --run-codex and SHOWDAR_BEHAVIORAL_ALLOW_MODEL=1';
  if (typeof env.OPENAI_API_KEY !== 'string' || !env.OPENAI_API_KEY.trim()) return 'Explicit OPENAI_API_KEY is required; user Codex auth/config is not inherited';
  if (simulated) return null;
  return 'Codex CLI does not expose preventive exact-argv command mediation; use a broker-backed runner before enabling real execution. ' + TRUSTED_RUNNER_BLOCKER;
}

function mapHostFailure(captured) {
  if (captured.error) return `Codex process could not start: ${captured.error.message}`;
  if (captured.inputError) return `Codex prompt input failed: ${captured.inputError.message}`;
  if (captured.timedOut) return 'Codex process timed out and was terminated';
  if (captured.outputExceeded) return 'Codex process output exceeded the configured limit';
  if (captured.code !== 0) {
    const detail = redact(captured.stderr || captured.stdout).trim().slice(0, 1000);
    return `Process exited with status ${captured.code ?? captured.signal ?? 'unknown'}${detail ? `: ${detail}` : ''}`;
  }
  return null;
}

export async function runCodexScenario({
  scenario, suite, sourceSha, allowModel = false, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = CONCURRENCY_LIMIT, model, repoRoot = process.cwd(), spawnProcess, simulateProcess = typeof spawnProcess === 'function',
  simulatedPlatform = 'darwin',
} = {}) {
  const simulated = typeof spawnProcess === 'function' && simulateProcess;
  const kind = simulated ? 'simulated' : 'real-agent';
  const blocked = checkExecutionGate({ allowModel, env, sourceSha, timeoutMs, concurrency, model, simulated });
  const result = initialResult(scenario, sourceSha ?? null, kind, blocked ? 'BLOCKED' : 'NOT_RUN', blocked ? [blocked] : []);
  if (blocked) return result;
  const template = suite?.fixtureTemplates?.[scenario?.fixture?.template];
  if (!template || !scenario?.oracle?.rubric) {
    result.status = 'BLOCKED';
    result.reasons = ['Scenario fixture or artifact rubric is missing'];
    return result;
  }
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'showdar-behavioral-'));
  const secrets = [env.OPENAI_API_KEY];
  const processRunner = spawnProcess ?? spawn;
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const envForCli = restrictedEnvironment({ workspace, apiKey: env.OPENAI_API_KEY });
    await mkdir(path.join(workspace, '.home', '.codex'), { recursive: true, mode: 0o700 });
    await mkdir(path.join(workspace, '.tmp'), { recursive: true, mode: 0o700 });
    await mkdir(path.join(workspace, 'artifacts'), { recursive: true, mode: 0o700 });
    await writeFixtureFiles(workspace, template.files);
    for (const skillId of scenario.installedSkills) await copySkill(workspace, repoRoot, skillId);
    initializeFixtureRepository(workspace, template.branch, envForCli);
    result.fixture = { template: scenario.fixture.template, declaredBranch: template.branch, isolated: true };
    const { OPENAI_API_KEY: _apiKey, ...probeEnv } = envForCli;
    // Fake process fixtures model a sandbox independently of the host; real runs use the actual OS.
    const platform = simulated ? simulatedPlatform : process.platform;
    if (platform !== 'darwin') {
      result.status = 'BLOCKED';
      result.reasons = [`Sandbox preflight is not implemented for host platform ${platform}`];
      result.execution.sandboxProbe = 'unsupported-platform';
      return result;
    }
    const sandboxProbe = await runChild(processRunner, '/usr/bin/sandbox-exec', [
      '-p', '(version 1) (deny default) (allow process-exec) (allow file-read*)', '/usr/bin/true',
    ], { cwd: workspace, env: probeEnv, timeoutMs: Math.min(timeoutMs, 10_000), maxOutputBytes: 64 * 1024 });
    const sandboxFailure = mapHostFailure(sandboxProbe);
    if (sandboxFailure) {
      result.status = 'BLOCKED';
      result.reasons = [`Sandbox preflight failed: ${redact(sandboxFailure, secrets)}`];
      result.execution.sandboxProbe = simulated ? 'simulated-failed' : 'failed';
      return result;
    }
    result.execution.sandboxProbe = simulated ? 'simulated-passed' : 'passed';
    const help = await runChild(processRunner, 'codex', ['exec', '--help'], {
      cwd: workspace, env: probeEnv, timeoutMs: Math.min(timeoutMs, 10_000), maxOutputBytes: 64 * 1024,
    });
    const helpFailure = mapHostFailure(help);
    if (helpFailure || !supportedCodexHelp(help.stdout)) {
      result.status = 'BLOCKED';
      result.reasons = [helpFailure ?? 'Codex CLI does not expose the required JSONL and sandbox options'];
      result.execution.capabilityProbe = 'failed';
      return result;
    }
    const invocation = buildCodexCommand(workspace, model);
    result.execution.agentLaunched = !simulated;
    result.provenance = simulated ? 'fake-process-fixture' : 'codex-cli-jsonl';
    const captured = await runChild(processRunner, invocation.command, invocation.args, {
      cwd: workspace, env: envForCli, prompt: buildScenarioPrompt(scenario, template), timeoutMs, maxOutputBytes: MAX_OUTPUT_BYTES,
    });
    const parsed = parseCodexJsonl(captured.stdout, { secrets, workspace });
    result.execution = {
      ...result.execution,
      startedAt,
      durationMs: Date.now() - started,
      exitCode: captured.code ?? null,
      signal: captured.signal ?? null,
      capabilityProbe: 'passed',
      model,
      stderr: redact(captured.stderr, secrets),
    };
    result.trace = {
      schemaVersion: 1,
      scenarioId: scenario.id,
      sourceSha,
      source: simulated ? 'fake-process' : 'codex-cli',
      complete: captured.code === 0 && parsed.complete && parsed.errors.length === 0 && !captured.timedOut && !captured.outputExceeded,
      observableKinds: OBSERVABLE_KINDS,
      events: parsed.events,
      assistantMessages: parsed.assistantMessages,
      rubricGrades: [], // Legacy trace field; never independent grading evidence.
      parserErrors: parsed.errors,
    };
    result.artifacts = await collectArtifacts(workspace, scenario, secrets);
    const hostFailure = mapHostFailure(captured);
    if (simulated) {
      result.status = hostFailure ? 'BLOCKED' : 'NOT_RUN';
      result.reasons = hostFailure
        ? [redact(hostFailure, secrets)]
        : ['Fake-process fixture only; simulated traces are never behavioral results'];
    } else if (hostFailure) {
      result.status = 'BLOCKED';
      result.reasons = [redact(hostFailure, secrets)];
    } else {
      const graded = gradeRecordedTrace(scenario, result.trace, { sourceSha });
      result.status = graded.status;
      result.reasons = graded.reasons;
      result.analysis = graded.analysis;
    }
  } catch (error) {
    result.status = 'BLOCKED';
    result.reasons = [redact(`Fixture setup failed: ${error.message}`, secrets)];
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  return result;
}
