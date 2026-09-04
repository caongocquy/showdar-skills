import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bin = path.join(root, 'bin', 'showdar.js');

function run(args, cwd = root, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...extraEnv } });
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
  assert.match(result.stdout, /showdar-git/);
  assert.match(result.stdout, /showdar-requirements/);
  assert.match(result.stdout, /showdar-quality/);
  assert.match(result.stdout, /showdar-security/);
  assert.match(result.stdout, /showdar-ops/);
  assert.doesNotMatch(result.stdout, /showdar-systematic-debugging/);
});

test('showdar prints the package version for --version and -V', async () => {
  const expected = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  for (const flag of ['--version', '-V']) {
    const result = await run([flag]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});

test('showdar init uses --ai and native destination', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-cli-'));
  const result = await run(['init', '--profile', 'minimal', '--ai', 'codex'], project);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /AI: codex/);
  const manifest = JSON.parse(await readFile(path.join(project, '.showdar.json'), 'utf8'));
  assert.equal(manifest.profile, 'minimal');
  assert.equal(manifest.ai, 'codex');
  assert.equal(manifest.scope, 'project');
  await access(path.join(project, '.agents/skills/showdar-debug/SKILL.md'));
  await assert.rejects(access(path.join(project, '.codex/skills/showdar-debug/SKILL.md')));
});

test('showdar accepts legacy profile aliases and writes canonical profile metadata', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-cli-profile-alias-'));
  const result = await run(['init', '--profile', 'mobile', '--ai', 'codex'], project);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /profile "mobile" is deprecated; use "developer"/i);
  const manifest = JSON.parse(await readFile(path.join(project, '.showdar.json'), 'utf8'));
  assert.equal(manifest.profile, 'developer');
  await access(path.join(project, '.agents/skills/showdar-ship/SKILL.md'));
});

test('project init reports global skills outside the requested profile', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'showdar-cli-global-home-'));
  const project = await mkdtemp(path.join(tmpdir(), 'showdar-cli-global-project-'));
  const env = { HOME: home };
  const globalInit = await run(['init', '--scope', 'global', '--profile', 'full', '--ai', 'codex'], project, env);
  assert.equal(globalInit.code, 0, globalInit.stderr);
  const projectInit = await run(['init', '--profile', 'developer', '--ai', 'codex'], project, env);
  assert.equal(projectInit.code, 0, projectInit.stderr);
  assert.match(projectInit.stdout, /Global Showdar installation exposes skills outside project profile "developer"/);
});

test('status, doctor, and remove read manifests with legacy profile names', async () => {
  for (const profile of ['mobile', 'web']) {
    const project = await mkdtemp(path.join(tmpdir(), `showdar-cli-legacy-${profile}-`));
    const init = await run(['init', '--profile', 'full', '--ai', 'codex'], project);
    assert.equal(init.code, 0, init.stderr);
    const manifestPath = path.join(project, '.showdar.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.profile = profile;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    const status = await run(['status'], project);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, new RegExp(`Profile: ${profile}`));
    const doctor = await run(['doctor'], project);
    assert.equal(doctor.code, 0, doctor.stderr);
    const remove = await run(['remove'], project);
    assert.equal(remove.code, 0, remove.stderr);
    await assert.rejects(access(manifestPath));
  }
});

test('showdar command help exposes scope, target, and profile behavior', async () => {
  const helpCases = [
    [['init', '--help'], /--scope <project\|global>/],
    [['status', '--help'], /status \[--scope <project\|global>\]/],
    [['doctor', '--help'], /doctor \[--scope <project\|global>\]/],
    [['remove', '--help'], /remove \[--scope <project\|global>\]/],
  ];
  for (const [args, expected] of helpCases) {
    const result = await run(args);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, expected);
  }
  const initHelp = await run(['init', '--help']);
  assert.match(initHelp.stdout, /Deprecated aliases: mobile -> developer, web -> developer/);
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
