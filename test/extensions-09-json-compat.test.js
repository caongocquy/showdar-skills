import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPackScaffold } from '../src/pack-scaffold.js';
import { validatePackSource, inspectPack } from '../src/project.js';

const TEST_DIR = '/tmp/showdar-09-compat-' + Date.now();

async function scaffoldValidPack(dest, name) {
  return createPackScaffold({ destination: dest, name, vendor: 'test' });
}

test('v0.9 validate-pack --json shape preserved', async () => {
  const result = await scaffoldValidPack(path.join(TEST_DIR, 'vpack'), 'vpack');
  const out = await validatePackSource({ cwd: TEST_DIR, source: result.packDir });
  assert.ok('ok' in out);
  assert.ok('errors' in out);
  assert.ok(!('schemaVersion' in out), 'v0.9 validate-pack --json must NOT gain schemaVersion');
  assert.ok(!('command' in out), 'v0.9 validate-pack --json must NOT gain command envelope');
  assert.ok(!('data' in out), 'v0.9 validate-pack --json must NOT gain data envelope');
});

test('v0.9 inspect-pack --json shape preserved without checkpoint', async () => {
  const result = await scaffoldValidPack(path.join(TEST_DIR, 'ipack'), 'ipack');
  const out = await inspectPack({ cwd: TEST_DIR, source: result.packDir });
  assert.ok(!('schemaVersion' in out), 'v0.9 inspect-pack --json must NOT gain schemaVersion');
  assert.ok(!('command' in out), 'v0.9 inspect-pack --json must NOT gain command envelope');
  assert.ok('fullTreeHash' in out);
  assert.ok('skills' in out);
  assert.ok('workflows' in out);
  assert.ok('manifest' in out);
});

test('cleanup', async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});
