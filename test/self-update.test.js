import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSelfUpdate } from '../src/self-update.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'bin', 'showdar.js');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
}

test('CLI version aliases return exactly the package version', () => {
  for (const flag of ['-v', '-V', '--version']) {
    const result = run(flag);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '0.15.1');
  }
});

test('self-update and upgrade aliases show dry-run command without invoking a package manager', () => {
  for (const verb of ['update', 'upgrade']) {
    const result = run(verb, '--manager', 'npm', '--dry-run');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /npm install -g showdar-skills@latest/);
  }
  const brew = run('update', '--manager', 'brew', '--dry-run');
  assert.equal(brew.status, 0, brew.stderr);
  assert.match(brew.stdout, /brew upgrade caongocquy\/showdar\/showdar-skills/);
  const pnpm = run('update', '--manager', 'pnpm', '--dry-run');
  assert.equal(pnpm.status, 0, pnpm.stderr);
  assert.match(pnpm.stdout, /pnpm add -g showdar-skills@latest/);
});

test('unsupported update manager never invokes a command', () => {
  const result = run('update', '--manager', 'curl', '--dry-run');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported update manager/);
});

test('source checkout is not silently upgraded as a global package', () => {
  assert.throws(
    () => planSelfUpdate({ packageRoot, roots: {} }),
    /Cannot identify a globally installed Showdar CLI/
  );
});

test('detects npm and pnpm global install roots using real filesystem paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-update-'));
  try {
    const actual = path.join(root, 'store', 'showdar-skills');
    await mkdir(actual, { recursive: true });
    const npmRoot = path.join(root, 'npm', 'node_modules');
    await mkdir(npmRoot, { recursive: true });
    await symlink(actual, path.join(npmRoot, 'showdar-skills'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(planSelfUpdate({ packageRoot: actual, roots: { npm: npmRoot } }).manager, 'npm');
    const pnpmRoot = path.join(root, 'pnpm', 'global', 'node_modules');
    await mkdir(pnpmRoot, { recursive: true });
    await symlink(actual, path.join(pnpmRoot, 'showdar-skills'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(planSelfUpdate({ packageRoot: actual, roots: { pnpm: pnpmRoot, npm: npmRoot } }).manager, 'pnpm');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recognizes Homebrew Cellar installs without probing npm', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-brew-'));
  try {
    const packageDir = path.join(root, 'Cellar', 'showdar-skills', '0.15.1', 'libexec');
    await mkdir(packageDir, { recursive: true });
    assert.equal(planSelfUpdate({ packageRoot: packageDir, roots: {} }).manager, 'brew');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
