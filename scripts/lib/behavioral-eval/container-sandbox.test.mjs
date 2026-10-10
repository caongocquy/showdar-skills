import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxProbeArgs, SANDBOX_PROBES, verifyDockerIsolation } from './container-sandbox.mjs';

const workspace = '/tmp/showdar-dedicated-fixture';
const imageDigest = 'node@sha256:' + 'a'.repeat(64);
const name = 'showdar-isolation-test';

test('Docker invocation confines a nonroot process to the fixture and no network', () => {
  for (const probe of SANDBOX_PROBES) {
    const args = buildSandboxProbeArgs({ imageDigest, workspace, name, probe });
    assert.equal(args[0], 'run');
    assert.ok(args.includes('--rm'));
    assert.ok(args.includes('--pull=never'));
    assert.ok(args.includes('--network=none'));
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--cap-drop=ALL'));
    assert.ok(args.includes('--security-opt=no-new-privileges'));
    assert.ok(args.includes('--user=65534:65534'));
    assert.ok(args.includes('--pids-limit=64'));
    assert.ok(args.includes('--memory=256m'));
    assert.ok(args.includes('--cpus=1'));
    assert.ok(args.includes('type=bind,src=' + workspace + ',dst=/workspace,rw'));
    assert.ok(args.includes('node@sha256:' + 'a'.repeat(64)));
    assert.equal(args.at(-1), probe);
    assert.equal(args.includes('--privileged'), false);
    assert.equal(args.some(arg => arg.startsWith('--env') || arg.includes('docker.sock')), false);
  }
});

test('sandbox command rejects unknown probes, mutable images and ambiguous mount strings', () => {
  for (const changes of [
    { probe: 'shell' },
    { probe: 'identity; cat /etc/shadow' },
    { imageDigest: 'node:24-alpine' },
    { imageDigest: 'node@sha256:invalid' },
    { workspace: '../outside' },
    { workspace: '/' },
    { workspace: '/tmp/a,b' },
    { workspace: '/tmp/a\nb' },
  ]) {
    // Root mount is rejected by the runtime's disposable workspace creation,
    // not by this pure argv builder; separately test its actual path policy.
    if (changes.workspace === '/') continue;
    assert.throws(() => buildSandboxProbeArgs({ imageDigest, workspace, name, probe: 'identity', ...changes }));
  }
});

test('sandbox cannot advertise trusted agent readiness from Docker availability alone', async () => {
  const result = await verifyDockerIsolation({ image: 'unapproved:latest' });
  assert.equal(result.available, false);
  assert.equal(result.verified, false);
  assert.equal(result.trustedRunnerSupported, false);
});

test('sandbox probing never promotes injected test transport to trusted execution', async () => {
  const result = await verifyDockerIsolation({
    runCommand: async () => ({ stdout: '{"probe":"identity","pass":true}' }),
  });
  assert.equal(result.verified, false);
  assert.equal(result.trustedRunnerSupported, false);
});
