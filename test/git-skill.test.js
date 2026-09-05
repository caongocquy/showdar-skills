import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('showdar-git documents safe local Git workflow boundaries', async () => {
  const text = await read('skills/showdar-git/SKILL.md');
  assert.match(text, /git status/);
  assert.match(text, /git diff --cached/);
  assert.match(text, /git add.*explicit|explicit.*git add/i);
  assert.match(text, /git add \./);
  assert.match(text, /git add -A/);
  assert.match(text, /force-push/);
  assert.match(text, /GitHub Actions/);
  assert.match(text, /FEATURE\/TASK/);
  assert.match(text, /EXCLUDED/);
  assert.match(text, /Do not push unless explicitly requested|push.*explicitly requested/i);
});

test('showdar-git routing is separate from review, ship, recover, and debug', async () => {
  const map = await read('router/skill-map.yaml');
  const triggers = await read('router/triggers.yaml');
  const conflicts = await read('router/conflicts.yaml');
  assert.match(map, /git:/);
  assert.match(map, /skill: showdar-git/);
  assert.match(map, /commit.*stage.*merge.*rebase.*cherry-pick.*push/i);
  assert.match(triggers, /showdar-git/);
  assert.match(conflicts, /showdar-git/);
  assert.match(conflicts, /showdar-review/);
  assert.match(conflicts, /showdar-ship/);
  assert.match(conflicts, /showdar-recover/);
  assert.match(conflicts, /showdar-debug/);
});

test('collect-diff resolves valid revisions and rejects option-like revisions', async () => {
  const script = path.join(root, 'skills/showdar-review/scripts/collect-diff.mjs');
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const tags = spawnSync('git', ['tag', '--points-at', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  for (const base of ['HEAD', branch, sha, ...tags.slice(0, 1)]) {
    const result = spawnSync(process.execPath, [script, root, base], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.base, base);
    assert.ok(Array.isArray(output.files));
    assert.equal(typeof output.diff, 'string');
  }

  const sandbox = await mkdtemp(path.join(tmpdir(), 'showdar-diff-guard-'));
  try {
    const external = path.join(sandbox, 'unexpected-diff-output');
    await writeFile(external, 'sentinel\n');
    const result = spawnSync(process.execPath, [script, root, `--output=${external}`], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /revision must not begin/i);
    assert.equal(await readFile(external, 'utf8'), 'sentinel\n');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('collect-diff rejects invalid revisions before running diff', () => {
  const script = path.join(root, 'skills/showdar-review/scripts/collect-diff.mjs');
  const result = spawnSync(process.execPath, [script, root, 'not-a-real-revision'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /collect-diff|unknown revision|bad revision|ambiguous argument/i);
});
