import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
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

test('CLI project setup is removed; agents own project context', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const result = run(cwd, 'setup', '--dry-run', '--json');
    assert.notEqual(result.status, 0, 'removed CLI command must not silently succeed');
    await assert.rejects(access(path.join(cwd, 'docs/agents/project.md')));
    const help = run(cwd, '--help');
    assert.doesNotMatch(help.stdout, /showdar setup \[/);
  } finally { await cleanup(); }
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
    assert.match(setupCommand, /Audit architecture and module boundaries/);
    assert.match(setupCommand, /proposed file-by-file diff/);
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
    assert.match(command, /Do not call showdar setup/);
    assert.match(command, /Git state/);
  } finally { await cleanup(); }
});
