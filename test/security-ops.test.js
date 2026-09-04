import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES, SKILLS, resolveProfile } from '../src/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'showdar.js');

async function text(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('security and ops are first-class skills with role-aware profile membership', () => {
  assert.deepEqual(SKILLS.slice(-2).map(({ id }) => id), ['showdar-security', 'showdar-ops']);
  assert.equal(PROFILES.developer.length, 12);
  assert.equal(PROFILES.backend.length, 14);
  assert.equal(PROFILES.qa.length, 9);
  assert.equal(PROFILES.product.length, 6);
  assert.equal(PROFILES.full.length, 15);
  assert.ok(PROFILES.developer.includes('showdar-security'));
  assert.ok(PROFILES.backend.includes('showdar-security'));
  assert.ok(PROFILES.backend.includes('showdar-ops'));
  assert.ok(!PROFILES.developer.includes('showdar-ops'));
  assert.deepEqual(resolveProfile('mobile'), resolveProfile('developer'));
  assert.deepEqual(resolveProfile('web'), resolveProfile('developer'));
  assert.deepEqual(resolveProfile('full'), SKILLS.map(({ id }) => id));
});

test('security and ops skills state their evidence and mutation boundaries', async () => {
  const security = await text('skills/showdar-security/SKILL.md');
  const ops = await text('skills/showdar-ops/SKILL.md');
  for (const phrase of [
    'threat modeling', 'trust boundaries', 'confirmed issue', 'suspected risk',
    'exploitability', 'severity', 'redact', 'do not invent vulnerabilities',
    'P0', 'P1', 'P2', 'P3', 'Attack surface', 'Residual risk',
  ]) assert.match(security.toLowerCase(), new RegExp(phrase.toLowerCase()));
  for (const phrase of [
    'read-only operational analysis', 'explicit user intent', 'do not automatically',
    'production', 'showdar-ship', 'showdar-git', 'CI/CD', 'rollback',
    'does not claim deployment',
  ]) assert.match(ops.toLowerCase(), new RegExp(phrase.toLowerCase()));
});

test('routing gives security and ops their specific ownership boundaries', async () => {
  const map = await text('router/skill-map.yaml');
  const triggers = await text('router/triggers.yaml');
  const conflicts = await text('router/conflicts.yaml');
  assert.match(map, /security:/);
  assert.match(map, /skill: showdar-security/);
  assert.match(map, /ops:/);
  assert.match(map, /skill: showdar-ops/);
  assert.match(triggers, /showdar-security/);
  assert.match(triggers, /showdar-ops/);
  for (const phrase of [
    'security intent wins', 'showdar-security', 'showdar-review',
    'operational implementation', 'showdar-ops', 'showdar-ship',
    'showdar-build', 'showdar-git',
  ]) assert.match(conflicts.toLowerCase(), new RegExp(phrase.toLowerCase()));
});

test('OpenCode commands and read-only helpers are packaged assets', async () => {
  for (const [command, skill] of [['security', 'showdar-security'], ['ops', 'showdar-ops']]) {
    const commandText = await text(`commands/opencode/showdar/${command}.md`);
    assert.match(commandText, /\$ARGUMENTS/);
    assert.match(commandText, new RegExp(skill));
  }
  for (const file of [
    'skills/showdar-security/data/index.json',
    'skills/showdar-security/references/threat-modeling.md',
    'skills/showdar-security/scripts/inspect-security-surface.mjs',
    'skills/showdar-security/examples/api-authorization-review.md',
    'skills/showdar-ops/data/index.json',
    'skills/showdar-ops/references/deployment.md',
    'skills/showdar-ops/scripts/inspect-ops-state.mjs',
    'skills/showdar-ops/examples/staging-plan.md',
  ]) await access(path.join(root, file));
});

test('security helper redacts secret values and ops helper stays read-only', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'showdar-security-ops-'));
  const secret = 'DO_NOT_PRINT_THIS_SECRET_123';
  try {
    await mkdir(path.join(fixture, '.github', 'workflows'), { recursive: true });
    await writeFile(path.join(fixture, '.env'), `API_KEY=${secret}\n`);
    await writeFile(path.join(fixture, 'package.json'), '{"scripts":{"build":"npm run build","deploy":"echo deploy"}}\n');
    await writeFile(path.join(fixture, '.github', 'workflows', 'build.yml'), 'name: build\n');
    await writeFile(path.join(fixture, 'Dockerfile'), 'FROM node:22\n');
    const securityScript = path.join(root, 'skills/showdar-security/scripts/inspect-security-surface.mjs');
    const opsScript = path.join(root, 'skills/showdar-ops/scripts/inspect-ops-state.mjs');
    const securityOutput = execFileSync(process.execPath, [securityScript, fixture], { encoding: 'utf8' });
    const opsOutput = execFileSync(process.execPath, [opsScript, fixture], { encoding: 'utf8' });
    assert.doesNotMatch(securityOutput, new RegExp(secret));
    assert.doesNotMatch(opsOutput, new RegExp(secret));
    assert.match(securityOutput, /securitySensitiveFiles|envFiles/);
    assert.match(opsOutput, /ciFiles|containerFiles|packageScripts/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('CLI exposes both new commands through validation assets', () => {
  const help = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.match(help, /Profiles:/);
  const list = execFileSync(process.execPath, [cli, 'list'], { encoding: 'utf8' });
  assert.match(list, /showdar-security/);
  assert.match(list, /showdar-ops/);
});
