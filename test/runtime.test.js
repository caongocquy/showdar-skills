import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectStacks as canonicalDetectStacks } from '../engine/detect-stack.mjs';
import { VENDORED_RUNTIME_FILES } from '../src/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = ['ci', 'electron', 'expo', 'fastify', 'html-tailwind', 'ios', 'node', 'package-manager', 'react', 'workspace'];

async function makeFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'showdar-runtime-'));
  await mkdir(path.join(fixture, 'Client.xcodeproj'), { recursive: true });
  await mkdir(path.join(fixture, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(fixture, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  await writeFile(path.join(fixture, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({
    packageManager: 'pnpm@9.12.0',
    workspaces: ['packages/*'],
    dependencies: {
      '@fastify/core': '^10.0.0',
      electron: '^32.0.0',
      expo: '^51.0.0',
      react: '^18.0.0',
      tailwindcss: '^3.0.0',
    },
  }));
  return fixture;
}

test('canonical and every source vendored detector return equivalent sorted stacks', async () => {
  const fixture = await makeFixture();
  try {
    const actual = [await canonicalDetectStacks(fixture)];
    for (const relative of VENDORED_RUNTIME_FILES) {
      const module = await import(pathToFileURL(path.join(root, relative)).href);
      actual.push(await module.detectStacks(fixture));
    }
    for (const stacks of actual) assert.deepEqual(stacks, expected);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
