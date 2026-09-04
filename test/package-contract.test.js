import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyNpmViewResult } from '../scripts/check-published-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function packManifest(cwd, destination) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--pack-destination', destination], {
    cwd, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout)[0].files.map(({ path: file }) => file).sort();
}

async function makePackageInputCopy(destination, packageFiles) {
  for (const encoded of packageFiles) {
    if (encoded === 'docs' || encoded.startsWith('docs/')) continue;
    try { await access(path.join(root, encoded)); } catch { continue; }
    const target = path.join(destination, encoded);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(root, encoded), target);
  }
}

test('package contract excludes internal docs and is reproducible without them', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'showdar-package-contract-'));
  const freshRoot = path.join(sandbox, 'fresh');
  const packDir = path.join(sandbox, 'pack');
  const prefix = path.join(sandbox, 'prefix');
  await mkdir(packDir, { recursive: true });
  try {
    const workspaceFiles = packManifest(root, packDir);
    assert.ok(!workspaceFiles.some((file) => file.startsWith('docs/')), 'workspace package must exclude docs/');
    assert.ok(!workspaceFiles.includes('RELEASING.md'), 'maintainer release notes must stay out of the npm package');
    assert.ok(!workspaceFiles.some((file) => file.startsWith('.github/')), 'workflow files must stay out of the npm package');
    assert.ok(!workspaceFiles.some((file) => file.startsWith('scripts/')), 'development scripts must stay out of the npm package');

    await makePackageInputCopy(freshRoot, workspaceFiles);
    const freshFiles = packManifest(freshRoot, packDir);
    assert.deepEqual(freshFiles, workspaceFiles, 'workspace and docs-free package inputs must produce the same file list');

    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: freshRoot, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = path.join(packDir, JSON.parse(packed.stdout)[0].filename);
    const installed = spawnSync('npm', ['install', '--prefix', prefix, '--ignore-scripts', tarball], { cwd: freshRoot, encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    await access(path.join(prefix, 'node_modules', 'showdar-skills', 'bin', 'showdar.js'));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('committed AGENTS instructions do not depend on ignored docs', async () => {
  const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(agents, /@docs\//);
});

test('release version guard accepts matching tags and rejects mismatches', () => {
  const guard = path.join(root, 'scripts', 'check-release-version.mjs');
  const matching = spawnSync(process.execPath, [guard, 'v0.2.0'], { cwd: root, encoding: 'utf8' });
  assert.equal(matching.status, 0, matching.stderr);
  assert.match(matching.stdout, /matches package version 0\.2\.0/);

  const mismatched = spawnSync(process.execPath, [guard, 'v9.9.9'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /does not match package version 0\.2\.0/);
});

test('published version guard distinguishes missing versions from registry failures', () => {
  assert.equal(classifyNpmViewResult({ status: 0, stdout: '"0.2.0"', stderr: '' }), 'published');
  assert.equal(classifyNpmViewResult({ status: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found' }), 'missing');
  assert.throws(
    () => classifyNpmViewResult({ status: 1, stdout: '', stderr: 'npm error code E401\nnpm error 401 Unauthorized' }),
    /npm view failed/,
  );
});
