import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, symlink } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile, getWorkflow } from '../src/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/showdar.js');
const run = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8' });
async function fixture(branch = 'feature/setup') {
  const cwd = await mkdtemp(path.join(tmpdir(), 'showdar-setup-'));
  git(cwd, 'init', '-q', '-b', branch);
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  await writeFile(path.join(cwd, 'README.md'), '# Fixture\n');
  git(cwd, 'add', 'README.md');
  git(cwd, 'commit', '-qm', 'base');
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}
const manifest = async cwd => JSON.parse(await readFile(path.join(cwd, '.showdar.json'), 'utf8'));

test('project setup detects GitLab and scripts, previews without writes, then creates four shared documents', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    git(cwd, 'remote', 'add', 'origin', 'git@gitlab.example.com:org/insurance.git');
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({
      name: 'insurance-app', scripts: { test: 'vitest run', lint: 'eslint .', build: 'vite build' },
      dependencies: { react: '*', vite: '*' }, devDependencies: { typescript: '*' },
    }));
    const preview = run(cwd, 'setup', '--dry-run', '--json');
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout).data;
    assert.equal(plan.tracker, 'gitlab');
    assert.equal(plan.files.length, 4);
    assert.ok(plan.files.every(entry => entry.action === 'create'));
    await assert.rejects(access(path.join(cwd, 'docs/agents/project.md')));
    const applied = run(cwd, 'setup', '--yes', '--json');
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).data.created.length, 4);
    const verification = await readFile(path.join(cwd, 'docs/agents/verification.md'), 'utf8');
    assert.match(verification, /vitest run/);
    const issue = await readFile(path.join(cwd, 'docs/agents/issue-tracker.md'), 'utf8');
    assert.match(issue, /gitlab/);
    const again = run(cwd, 'setup', '--yes', '--json');
    assert.equal(again.status, 0, again.stderr);
    assert.equal(JSON.parse(again.stdout).data.created.length, 0);
  } finally { await cleanup(); }
});

test('setup preserves user docs, refuses unsafe path and blocks integration branch writes', async () => {
  const { cwd, cleanup } = await fixture('develop');
  try {
    assert.equal(run(cwd, 'setup', '--yes').status, 1);
    assert.equal(run(cwd, 'setup', '--dry-run').status, 0);
    git(cwd, 'switch', '-c', 'feature/setup-docs');
    await mkdir(path.join(cwd, 'docs/agents'), { recursive: true });
    await writeFile(path.join(cwd, 'docs/agents/project.md'), 'USER-OWNED-CONTENT\n');
    assert.equal(run(cwd, 'setup', '--yes').status, 0);
    assert.equal(await readFile(path.join(cwd, 'docs/agents/project.md'), 'utf8'), 'USER-OWNED-CONTENT\n');
    const unsafe = run(cwd, 'setup', '--yes', '--docs-dir', '../escaped');
    assert.equal(unsafe.status, 1);
    await assert.rejects(access(path.resolve(cwd, '../escaped/project.md')));
  } finally { await cleanup(); }
});

test('setup refuses symlinked output and does not write to its target', async () => {
  const { cwd, cleanup } = await fixture();
  const external = await mkdtemp(path.join(tmpdir(), 'showdar-setup-outside-'));
  try {
    await mkdir(path.join(cwd, 'docs'), { recursive: true });
    await symlink(external, path.join(cwd, 'docs/agents'));
    const r = run(cwd, 'setup', '--yes');
    assert.equal(r.status, 1);
    await assert.rejects(access(path.join(external, 'project.md')));
  } finally { await cleanup(); await rm(external, { recursive: true, force: true }); }
});

test('wizard previews combined selections without mutating project and adds the chosen set', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const args = ['--profile', 'developer', '--skills', 'insurance-domain,git',
      '--workflow', 'feature', '--ai', 'opencode'];
    const preview = run(cwd, 'wizard', '--dry-run', '--json', ...args);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout).data;
    assert.equal(plan.action, 'union');
    assert.ok(plan.skills.includes('showdar-feature'));
    for (const stage of getWorkflow('showdar-feature').stages) assert.ok(plan.skills.includes(stage));
    await assert.rejects(access(path.join(cwd, '.showdar.json')));
    const applied = run(cwd, 'wizard', '--yes', ...args);
    assert.equal(applied.status, 0, applied.stderr);
    const m = await manifest(cwd);
    for (const name of plan.skills) assert.ok(m.skills.includes(name), name);
    assert.equal(m.ai, 'opencode');
    assert.equal(run(cwd, 'doctor').status, 0);
    const setupCommand = await readFile(path.join(cwd, '.opencode/commands/showdar/setup.md'), 'utf8');
    assert.match(setupCommand, /showdar setup --dry-run --json/);
    const addAgain = run(cwd, 'add', '--interactive', '--yes', ...args);
    assert.equal(addAgain.status, 0, addAgain.stderr);
    assert.deepEqual((await manifest(cwd)).skills, m.skills);
  } finally { await cleanup(); }
});

test('wizard replace honors profile and does not silently choose defaults in non-interactive mode', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const unattended = run(cwd, 'wizard');
    assert.equal(unattended.status, 1);
    const noChoice = run(cwd, 'wizard', '--yes');
    assert.equal(noChoice.status, 1);
    assert.equal(run(cwd, 'wizard', '--yes', '--profile', 'developer', '--ai', 'codex').status, 0);
    const replace = run(cwd, 'wizard', '--yes', '--mode', 'replace', '--profile', 'insurance', '--ai', 'codex');
    assert.equal(replace.status, 0, replace.stderr);
    const m = await manifest(cwd);
    assert.deepEqual(m.skills, resolveProfile('insurance'));
    assert.equal(m.profile, 'insurance');
    assert.equal(run(cwd, 'doctor').status, 0);
  } finally { await cleanup(); }
});

test('context discovery guidance is in generated OpenCode commands without changing route schema', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'opencode').status, 0);
    const instruction = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
    assert.match(instruction, /docs\/agents/);
    const command = await readFile(path.join(cwd, '.opencode/commands/showdar/setup.md'), 'utf8');
    assert.match(command, /showdar setup/);
    assert.match(command, /Git state/);
  } finally { await cleanup(); }
});
