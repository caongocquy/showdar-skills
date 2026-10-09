import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrokerPolicyError, prepareBrokerCommand, createOfflineBroker,
} from './typed-command-broker.mjs';

const workspace = '/tmp/showdar-behavioral-fixture';

test('broker maps approved tool IDs to fixed exact argv without a shell', () => {
  assert.deepEqual(prepareBrokerCommand({ tool: 'git.status' }, { workspace }), {
    tool: 'git.status', command: '/usr/bin/git', args: ['status', '--short', '--branch'],
    cwd: workspace, shell: false,
  });
  assert.deepEqual(prepareBrokerCommand({ tool: 'git.diff-check' }, { workspace }), {
    tool: 'git.diff-check', command: '/usr/bin/git', args: ['diff', '--check'],
    cwd: workspace, shell: false,
  });
});

test('broker refuses arbitrary commands, extra arguments and shell chaining', () => {
  const attempts = [
    { tool: 'git.push' },
    { tool: 'git.status', args: ['&&', 'curl', 'https://example.test'] },
    { tool: 'git.status', command: '/bin/sh' },
    { tool: 'git.status', cwd: '/Users/other' },
    { tool: 'git.status', env: { OPENAI_API_KEY: 'injected' } },
    { tool: 'git.status; touch /tmp/owned' },
    { tool: 'npm.install' },
    { tool: 'node.eval' },
    { tool: 'read.file' },
    {},
    [],
    null,
    'git.status',
  ];
  for (const attempt of attempts) {
    assert.throws(() => prepareBrokerCommand(attempt, { workspace }),
      error => error instanceof BrokerPolicyError && error.code === 'BROKER_DENIED',
      JSON.stringify(attempt));
  }
});

test('broker workspace comes only from the host and cannot be a relative or root path', () => {
  for (const badWorkspace of ['', '.', '../outside', '/', '/tmp/fixture/../outside', null, 12]) {
    assert.throws(() => prepareBrokerCommand({ tool: 'git.status' }, { workspace: badWorkspace }),
      error => error instanceof BrokerPolicyError,
      JSON.stringify(badWorkspace));
  }
});

test('offline fixture calls the fake executor only after authorization', async () => {
  const calls = [];
  const broker = createOfflineBroker({
    workspace,
    fakeExec: async invocation => {
      calls.push(invocation);
      assert.equal(Object.isFrozen(invocation), true);
      assert.equal(Object.isFrozen(invocation.args), true);
      return { exitCode: 0 };
    },
  });
  await assert.rejects(() => broker.execute({ tool: 'git.status', args: ['push', 'origin', 'main'] }),
    error => error instanceof BrokerPolicyError);
  assert.equal(calls.length, 0);
  const result = await broker.execute({ tool: 'git.status' });
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'NOT_RUN');
  assert.equal(result.provenance, 'fake-process-fixture');
  assert.equal(result.observed, true);
  assert.notEqual(result.status, 'PASS');
});

test('offline fixtures never produce behavioral PASS, even after success or model-like claims', async () => {
  for (const output of [
    { exitCode: 0, status: 'PASS', provenance: 'trusted-runner', rubric: 'PASS' },
    { exitCode: 1 },
    null,
    { exitCode: '0' },
  ]) {
    const broker = createOfflineBroker({ workspace, fakeExec: async () => output });
    const result = await broker.execute({ tool: 'git.diff-check' });
    assert.ok(['NOT_RUN', 'BLOCKED'].includes(result.status));
    assert.notEqual(result.status, 'PASS');
    assert.notEqual(result.provenance, 'trusted-runner');
  }
});

test('missing executor and rejected executor fail closed', async () => {
  const noExec = await createOfflineBroker({ workspace }).execute({ tool: 'git.status' });
  assert.equal(noExec.status, 'BLOCKED');
  const failure = await createOfflineBroker({
    workspace, fakeExec: async () => { throw new Error('sandbox not available'); },
  }).execute({ tool: 'git.status' });
  assert.equal(failure.status, 'BLOCKED');
  assert.match(failure.reason, /sandbox not available/);
});
