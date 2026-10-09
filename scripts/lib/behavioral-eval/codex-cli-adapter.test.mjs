import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runCodexScenario, parseCodexJsonl, buildCodexCommand } from './codex-cli-adapter.mjs';
import { authorizeBrokerCommand } from './command-policy.mjs';

const suite = JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json', import.meta.url), 'utf8'));
const scenario = suite.scenarios.find(x => x.id === 'BRAIN-001');
const sourceSha = 'a'.repeat(40);
const codexHelp = 'codex exec --json --sandbox workspace-write --cd DIR --ephemeral --ignore-user-config --strict-config --config';

function fakeProcess(output, { exitCode = 0, neverClose = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; child.emit('close', null, 'SIGTERM'); };
  queueMicrotask(() => {
    child.stdout.emit('data', output);
    if (!neverClose) child.emit('close', exitCode, null);
  });
  return child;
}

test('Codex invocation pins workspace-write, disables tool network, and avoids user config', () => {
  const invocation = buildCodexCommand('/tmp/fixture', 'gpt-5.6-codex');
  assert.equal(invocation.command, 'codex');
  assert.ok(invocation.args.includes('--json'));
  assert.ok(invocation.args.includes('--model') && invocation.args.includes('gpt-5.6-codex'));
  assert.ok(invocation.args.includes('--sandbox') && invocation.args.includes('workspace-write'));
  assert.ok(invocation.args.includes('--ignore-user-config'));
  assert.ok(invocation.args.includes('--ephemeral'));
  assert.ok(invocation.args.includes('approval_policy="on-request"'));
  assert.ok(invocation.args.includes('sandbox_workspace_write.network_access=false'));
  assert.ok(!invocation.args.includes('--ask-for-approval'));
  assert.ok(!invocation.args.some(arg => arg.includes('dangerously-bypass')));
});

test('JSONL parser captures command events and redacts secrets', () => {
  const command = JSON.stringify({ type: 'item.completed', item: {
    type: 'command_execution', command: 'printf %s sk-proj-12345678901234567890', exit_code: 0,
  } });
  const fileChange = JSON.stringify({ type: 'item.completed', item: {
    type: 'file_change', changes: [{ path: '/tmp/workspace/artifacts/result.md', kind: 'add' }],
  } });
  const parsed = parseCodexJsonl(`${command}\n${fileChange}`, { workspace: '/tmp/workspace' });
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.events[0].kind, 'tool_invoked');
  assert.equal(parsed.events[0].attributes.exitCode, 0);
  assert.match(parsed.events[0].attributes.command, /\[REDACTED\]/);
  assert.deepEqual(parsed.events[1], { kind: 'file_written', attributes: { path: 'artifacts/result.md', changeType: 'add' } });
  assert.doesNotMatch(JSON.stringify(parsed), /sk-proj-/);
});

test('model execution fails closed unless both opt-ins and explicit API credentials exist', async () => {
  let launched = false;
  const noOptIn = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: false,
    env: { OPENAI_API_KEY: 'secret' }, spawnProcess: () => { launched = true; } });
  const noCredential = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1' }, spawnProcess: () => { launched = true; } });
  assert.equal(noOptIn.status, 'BLOCKED');
  assert.match(noOptIn.reasons.join(' '), /SHOWDAR_BEHAVIORAL_ALLOW_MODEL/);
  assert.equal(noCredential.status, 'BLOCKED');
  assert.match(noCredential.reasons.join(' '), /OPENAI_API_KEY/);
  assert.equal(launched, false);
});

test('Codex CLI adapter blocks before process launch when preventive command mediation is unavailable', async () => {
  let launched = false;
  const apiKey = 'sk-test-12345678901234567890';
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: apiKey },
    spawnProcess: () => { launched = true; throw new Error('must not launch'); }, simulateProcess: false,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.execution.agentLaunched, false);
  assert.match(result.reasons.join(' '), /preventive exact-argv command mediation/i);
  assert.doesNotMatch(JSON.stringify(result), /sk-test-/);
  assert.equal(launched, false);
});

test('positive command policy accepts only exact argv entries and rejects shell or path escapes', () => {
  const workspace = '/tmp/showdar-fixture';
  assert.equal(authorizeBrokerCommand({ command: '/usr/bin/git', args: ['status', '--short', '--branch'], cwd: workspace, workspace }), null);
  for (const request of [
    { command: 'sh', args: ['-c', 'git status; touch /tmp/pwned'] },
    { command: '/usr/bin/git', args: ['status', '--short', '&&', 'curl', 'https://example.test'] },
    { command: 'npm', args: ['install', 'left-pad'] },
    { command: '/usr/bin/git', args: ['push', 'origin', 'main'] },
    { command: 'node', args: ['-e', 'process.env.OPENAI_API_KEY'] },
    { command: '/usr/bin/git', args: ['status', '--short', '../../../Users/other/.ssh'] },
    { command: '/bin/sh', args: ['-c', 'echo bypass'] },
    { command: '/usr/bin/git', args: ['-C', '/Users/other', 'status'] },
  ]) {
    assert.match(authorizeBrokerCommand({ ...request, workspace }) ?? '', /denied/i, JSON.stringify(request));
  }
});

test('sandbox preflight failure blocks before Codex can make a model request', async () => {
  const calls = [];
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'sk-test-12345678901234567890' },
    spawnProcess: (command, args, options) => {
      calls.push([command, args]);
      if (command === '/usr/bin/sandbox-exec') assert.equal(options.env.OPENAI_API_KEY, undefined);
      return fakeProcess('sandbox_apply: Operation not permitted', { exitCode: 71 });
    },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(calls[0]?.[0], '/usr/bin/sandbox-exec');
  assert.match(result.reasons.join(' '), /sandbox/i);
  assert.equal(result.execution.agentLaunched, false);
  assert.equal(result.provenance, 'fake-process-fixture');
  assert.equal(result.execution.sandboxProbe, 'simulated-failed');
  assert.equal(calls.some(([command, args]) => command === 'codex' && args[0] === 'exec' && !args.includes('--help')), false);
});

test('concurrency above the single-case limit blocks before setup or process launch', async () => {
  let launched = false;
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true, concurrency: 2,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'sk-test-12345678901234567890' },
    spawnProcess: () => { launched = true; },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reasons.join(' '), /Concurrency is limited to 1/);
  assert.equal(launched, false);
});

test('fake process captures isolated fixture artifacts but can never report behavioral PASS', async () => {
  const output = JSON.stringify({ type: 'item.completed', item: {
    type: 'command_execution', command: 'cat README.md', exit_code: 0, aggregated_output: 'fixture output',
  } }) + '\n' + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
  const fakeRunner = (command, args, options) => {
    if (command === '/usr/bin/sandbox-exec') return fakeProcess('');
    if (args.includes('--help')) return fakeProcess(codexHelp);
    assert.equal(execFileSync('git', ['-C', options.cwd, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'feature/rate-lookup');
    mkdirSync(path.join(options.cwd, 'artifacts'), { recursive: true });
    writeFileSync(path.join(options.cwd, 'artifacts/decision.json'), '{"decision":"fixture","token":"sk-test-12345678901234567890"}');
    return fakeProcess(output);
  };
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'sk-test-12345678901234567890' },
    spawnProcess: fakeRunner, timeoutMs: 1000,
  });
  assert.equal(result.execution.kind, 'simulated');
  assert.equal(result.execution.sandboxProbe, 'simulated-passed');
  assert.equal(result.execution.agentLaunched, false);
  assert.equal(result.status, 'NOT_RUN');
  assert.notEqual(result.status, 'PASS');
  assert.ok(result.trace.events.some(event => event.kind === 'tool_invoked'));
  assert.ok(result.artifacts.some(artifact => artifact.path === 'artifacts/decision.json'));
  assert.doesNotMatch(result.artifacts[0].content, /sk-test-/);
  assert.doesNotMatch(JSON.stringify(result), /sk-test-/);
});

test('timed-out Codex process is killed and reported BLOCKED', async () => {
  let child;
  const fakeRunner = (command, args) => command === '/usr/bin/sandbox-exec'
    ? fakeProcess('')
    : args.includes('--help') ? fakeProcess(codexHelp) : (child = fakeProcess('', { neverClose: true }));
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'sk-test-12345678901234567890' },
    spawnProcess: fakeRunner, timeoutMs: 10,
  });
  assert.equal(child.killed, true);
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reasons.join(' '), /timed out/);
});


test('unsupported sandbox platform is tested separately from fake process behavior', async () => {
  let launched = false;
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'fixture-key' },
    simulatedPlatform: 'linux', spawnProcess: () => { launched = true; throw new Error('must not launch'); },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.execution.sandboxProbe, 'unsupported-platform');
  assert.match(result.reasons.join(' '), /host platform linux/);
  assert.equal(result.execution.agentLaunched, false);
  assert.equal(launched, false);
});

test('simulation platform injection cannot enable real-agent execution', async () => {
  for (const simulatedPlatform of ['darwin', 'linux']) {
    let launched = false;
    const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
      env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'fixture-key' },
      simulatedPlatform, simulateProcess: false,
      spawnProcess: () => { launched = true; throw new Error('must not launch'); },
    });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.execution.kind, 'real-agent');
    assert.match(result.reasons.join(' '), /preventive exact-argv command mediation/);
    assert.equal(result.execution.agentLaunched, false);
    assert.equal(launched, false);
  }
});

test('simulation flags without an injected process cannot reach the real spawn path', async () => {
  const result = await runCodexScenario({ scenario, suite, sourceSha, model: 'gpt-5.6-codex', allowModel: true,
    env: { SHOWDAR_BEHAVIORAL_ALLOW_MODEL: '1', OPENAI_API_KEY: 'fixture-key' },
    simulateProcess: true, simulatedPlatform: 'darwin',
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.execution.kind, 'real-agent');
  assert.equal(result.execution.agentLaunched, false);
  assert.match(result.reasons.join(' '), /preventive exact-argv command mediation/);
});
