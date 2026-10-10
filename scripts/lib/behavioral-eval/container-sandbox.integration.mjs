import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDockerIsolation, SANDBOX_PROBES } from './container-sandbox.mjs';

// This is intentionally NOT *.test.mjs: it must run in a separate
// Docker-capable CI job after explicitly provisioning the approved image.
// Never silently skip real isolation verification.
test('real Docker isolation refuses network, host reads and root writes', { timeout: 120_000 }, async () => {
  const result = await verifyDockerIsolation();
  assert.equal(result.available, true, JSON.stringify(result));
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.trustedRunnerSupported, false);
  assert.match(result.imageDigest, /^node@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.checks, SANDBOX_PROBES.map(probe => ({ probe, status: 'PASS' })));
});
