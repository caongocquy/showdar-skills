import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bin = path.join(root, 'bin', 'showdar.js');

function run(args, cwd = root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('showdar list prints V0.2 profiles and flagship skills', async () => {
  const result = await run(['list']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Profiles:/);
  assert.match(result.stdout, /showdar-debug/);
  assert.doesNotMatch(result.stdout, /showdar-systematic-debugging/);
});

test('showdar init uses --ai and native destination', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-cli-'));
  const result = await run(['init', '--profile', 'minimal', '--ai', 'codex'], project);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /AI: codex/);
  const manifest = JSON.parse(await readFile(path.join(project, '.showdar.json'), 'utf8'));
  assert.equal(manifest.profile, 'minimal');
  assert.equal(manifest.ai, 'codex');
  await access(path.join(project, '.codex/skills/showdar-debug/SKILL.md'));
});

test('showdar rejects legacy --agent target syntax', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-cli-legacy-'));
  const result = await run(['init', '--agent', 'codex'], project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--agent is no longer supported/);
});

test('showdar doctor returns non-zero when not installed', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-doctor-'));
  const result = await run(['doctor'], project);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /not installed/i);
});
