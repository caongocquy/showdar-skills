import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/showdar.js', import.meta.url));
function git(cwd, ...args) {
  const out = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
}
function repo(branch = 'develop') {
  const cwd = mkdtempSync(path.join(tmpdir(), 'git-start-'));
  git(cwd, 'init', '-b', branch);
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(path.join(cwd, 'source.txt'), 'baseline\n');
  git(cwd, 'add', 'source.txt');
  git(cwd, 'commit', '-m', 'baseline');
  return cwd;
}
function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, 'git-start', '--type', 'feature', '--name', 'Plan Pricing Rate Table Form', ...args, '--json'], { cwd, encoding: 'utf8' });
}
const cleanup = cwd => rmSync(cwd, { recursive: true, force: true });

for (const type of ['feature', 'fix', 'refactor', 'test', 'docs', 'chore', 'release', 'hotfix']) test(`clean develop: ${type}, preflight before task edits`, () => {
  const cwd = repo();
  try {
    const head = git(cwd, 'rev-parse', 'HEAD');
    const refs = git(cwd, 'show-ref');
    const args = ['--type', type, ...(type === 'hotfix' ? ['--base', 'develop'] : [])];
    let out = run(cwd, ...args, '--dry-run');
    assert.equal(out.status, 0, out.stderr);
    const data = JSON.parse(out.stdout).data;
    assert.equal(data.branch, `${type}/plan-pricing-rate-table-form`);
    assert.equal(data.action, 'create');
    assert.equal(git(cwd, 'show-ref'), refs);
    assert.equal(git(cwd, 'branch', '--show-current'), 'develop');
    out = run(cwd, ...args);
    assert.equal(out.status, 0, out.stdout);
    assert.equal(git(cwd, 'branch', '--show-current'), data.branch);
    assert.equal(git(cwd, 'rev-parse', 'HEAD'), head);
    assert.equal(git(cwd, 'status', '--porcelain'), '');
    assert.equal(git(cwd, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(git(cwd, 'remote'), '');
    assert.equal(readFileSync(path.join(cwd, 'source.txt'), 'utf8'), 'baseline\n');
    assert.equal(JSON.parse(run(cwd, ...args).stdout).data.action, 'continue');
  } finally { cleanup(cwd); }
});

test('main fallback, explicit base, local develop precedence and custom repository config', () => {
  const cwd = repo('main');
  try {
    assert.equal(JSON.parse(run(cwd, '--dry-run').stdout).data.base, 'main');
    git(cwd, 'branch', 'develop');
    assert.equal(JSON.parse(run(cwd, '--dry-run').stdout).data.base, 'develop');
    assert.equal(JSON.parse(run(cwd, '--base', 'main', '--dry-run').stdout).data.base, 'main');
    git(cwd, 'branch', 'integration');
    git(cwd, 'config', 'showdar.gitBase', 'integration');
    git(cwd, 'config', 'showdar.gitBranchPrefix', 'task');
    const out = JSON.parse(run(cwd, '--dry-run').stdout).data;
    assert.equal(out.base, 'integration');
    assert.equal(out.branch, 'task/plan-pricing-rate-table-form');
    git(cwd, 'config', 'showdar.gitDirectWork', 'true');
    assert.equal(JSON.parse(run(cwd).stdout).data.action, 'direct');
    assert.equal(git(cwd, 'branch', '--show-current'), 'main');
  } finally { cleanup(cwd); }
});

test('existing same-tip target reused; divergent collision stops without overwriting', () => {
  const cwd = repo();
  try {
    const branch = 'feature/plan-pricing-rate-table-form';
    git(cwd, 'branch', branch);
    assert.equal(JSON.parse(run(cwd, '--dry-run').stdout).data.action, 'switch');
    assert.equal(run(cwd).status, 0);
    writeFileSync(path.join(cwd, 'source.txt'), 'other task\n');
    git(cwd, 'add', 'source.txt'); git(cwd, 'commit', '-m', 'unrelated');
    const branchHead = git(cwd, 'rev-parse', 'HEAD');
    git(cwd, 'switch', 'develop');
    const out = run(cwd);
    assert.notEqual(out.status, 0);
    assert.match(out.stdout, /collision/i);
    assert.equal(git(cwd, 'rev-parse', branch), branchHead);
    assert.equal(git(cwd, 'branch', '--show-current'), 'develop');
  } finally { cleanup(cwd); }
});

test('detached HEAD, dirty tree, active task, invalid type/name/base fail safely', () => {
  const cwd = repo();
  try {
    for (const args of [['--type', 'evil'], ['--name', '!!!'], ['--base', '--evil']]) assert.notEqual(run(cwd, ...args).status, 0);
    const refs = git(cwd, 'show-ref');
    writeFileSync(path.join(cwd, 'unrelated.txt'), 'user');
    assert.notEqual(run(cwd, '--dry-run').status, 0);
    assert.notEqual(run(cwd).status, 0);
    assert.equal(git(cwd, 'show-ref'), refs);
    assert.equal(readFileSync(path.join(cwd, 'unrelated.txt'), 'utf8'), 'user');
    rmSync(path.join(cwd, 'unrelated.txt'));
    git(cwd, 'switch', '--detach');
    assert.notEqual(run(cwd).status, 0);
    git(cwd, 'switch', '-c', 'feature/other-task');
    assert.notEqual(run(cwd).status, 0);
  } finally { cleanup(cwd); }
});

test('ticket slug and metacharacters are inert, bounded valid refs', () => {
  const cwd = repo();
  try {
    const out = run(cwd, '--name', 'IDP-123 Add pricing form; $(touch SENTINEL) `echo boom`', '--dry-run');
    assert.equal(out.status, 0, out.stdout);
    const branch = JSON.parse(out.stdout).data.branch;
    assert.match(branch, /^feature\/idp-123-/);
    git(cwd, 'check-ref-format', '--branch', branch);
    assert.throws(() => readFileSync(path.join(cwd, 'SENTINEL')));
    assert.ok(JSON.parse(run(cwd, '--name', 'a'.repeat(400), '--dry-run').stdout).data.branch.length <= 100);
    assert.match(JSON.parse(run(cwd, '--type', 'fix', '--name', 'Fix login redirect loop', '--dry-run').stdout).data.branch, /^fix\/login-redirect-loop$/);
  } finally { cleanup(cwd); }
});


test('dry-run does not refresh the Git index when tracked stat metadata changes', () => {
  const cwd = repo();
  try {
    const file = path.join(cwd, 'source.txt');
    utimesSync(file, new Date(0), new Date(0));
    const index = path.join(cwd, '.git/index');
    const before = readFileSync(index);
    const out = run(cwd, '--dry-run');
    assert.equal(out.status, 0, out.stdout);
    assert.deepEqual(readFileSync(index), before);
  } finally { cleanup(cwd); }
});
