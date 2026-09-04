import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
