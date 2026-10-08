import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/showdar.js');
const git = (cwd, ...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8' }).trim();
const guard = (cwd, mutation) => spawnSync(process.execPath, [cli, 'guard', '--mutation', mutation, '--json'], { cwd, encoding: 'utf8' });

function repo(branch = 'develop') {
  const cwd = mkdtempSync(path.join(tmpdir(), 'showdar-guard-'));
  git(cwd, 'init', '-q', '-b', branch);
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  writeFileSync(path.join(cwd, 'source.txt'), 'baseline\n');
  git(cwd, 'add', 'source.txt');
  git(cwd, 'commit', '-qm', 'baseline');
  return cwd;
}

test('develop/main blocked until git-start switches to a task branch', () => {
  const cwd = repo();
  try {
    let out = guard(cwd, 'local-write');
    assert.equal(out.status, 1, out.stderr);
    assert.equal(JSON.parse(out.stdout).data.code, 'task-branch-required');
    assert.equal(git(cwd, 'branch', '--show-current'), 'develop');
    const started = spawnSync(process.execPath, [cli, 'git-start', '--type', 'feature', '--name', 'Login flow', '--json'], { cwd, encoding: 'utf8' });
    assert.equal(started.status, 0, started.stderr);
    assert.equal(git(cwd, 'branch', '--show-current'), 'feature/login-flow');
    out = guard(cwd, 'local-write');
    assert.equal(out.status, 0, out.stderr);
    assert.equal(JSON.parse(out.stdout).data.code, 'task-branch-ready');
    git(cwd, 'switch', 'develop');
    assert.equal(guard(cwd, 'read-only').status, 0);
    git(cwd, 'branch', '-m', 'main');
    assert.equal(JSON.parse(guard(cwd, 'local-write').stdout).data.code, 'task-branch-required');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('explicit repository-local direct-work opt-in and custom integration branch', () => {
  const cwd = repo();
  try {
    git(cwd, 'config', 'showdar.gitDirectWork', 'true');
    assert.equal(JSON.parse(guard(cwd, 'local-write').stdout).data.code, 'direct-work-configured');
    git(cwd, 'config', 'showdar.gitDirectWork', 'false');
    assert.equal(JSON.parse(guard(cwd, 'local-write').stdout).data.allowed, false);
    git(cwd, 'branch', 'integration');
    git(cwd, 'switch', 'integration');
    git(cwd, 'config', 'showdar.gitBase', 'integration');
    assert.equal(JSON.parse(guard(cwd, 'local-write').stdout).data.code, 'task-branch-required');
    git(cwd, 'switch', '--detach');
    assert.equal(JSON.parse(guard(cwd, 'local-write').stdout).data.code, 'detached-head');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('guard is read-only and invalid mutation fails closed', () => {
  const cwd = repo();
  try {
    const index = path.join(cwd, '.git/index');
    const before = readFileSync(index);
    const refs = git(cwd, 'show-ref');
    assert.equal(guard(cwd, 'local-write').status, 1);
    assert.deepEqual(readFileSync(index), before);
    assert.equal(git(cwd, 'show-ref'), refs);
    const bad = guard(cwd, 'production-impacting');
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).ok, false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('all mutating skills and workflow entrypoints require the guard', () => {
  for (const id of ['build','debug','test','upgrade','design','recover','plan','requirements','ops','feature','bugfix','release','incident','git']) {
    const content = readFileSync(path.join(root, 'skills', 'showdar-' + id, 'SKILL.md'), 'utf8');
    assert.match(content, /showdar guard --mutation local-write --json/);
    assert.match(content, /before/i);
  }
});
