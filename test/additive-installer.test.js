import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveProfile, getWorkflow } from '../src/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'showdar.js');
function run(cwd, ...args) {
  const p = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { code: p.status, stdout: p.stdout, stderr: p.stderr };
}
async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'showdar-additive-'));
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}
const manifest = cwd => readFile(path.join(cwd, '.showdar.json'), 'utf8').then(JSON.parse);
const skillPath = (cwd, ai, id) => path.join(cwd,
  ai === 'opencode' ? '.opencode/skills' : ai === 'cursor' ? '.cursor/skills' : '.agents/skills',
  'showdar-' + id, 'SKILL.md');

test('add profile insurance extends developer without replacing profile or existing skills', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const init = run(cwd, 'init', '--profile', 'developer', '--ai', 'opencode');
    assert.equal(init.code, 0, init.stderr);
    const before = await manifest(cwd);
    assert.equal(before.skills.length, resolveProfile('developer').length);
    const install = run(cwd, 'add', 'profile', 'insurance');
    assert.equal(install.code, 0, install.stderr);
    assert.match(install.stdout, /New skills: 3/);
    const after = await manifest(cwd);
    assert.equal(after.profile, 'developer');
    assert.equal(after.ai, 'opencode');
    assert.equal(after.skills.length, 15);
    for (const id of [...before.skills, ...resolveProfile('insurance')]) assert.ok(after.skills.includes(id), id);
    for (const id of ['insurance-domain', 'insurance-workflows', 'insurance-review']) {
      await access(skillPath(cwd, 'opencode', id));
      await access(path.join(cwd, '.opencode/commands/showdar', id + '.md'));
    }
    assert.match(await readFile(path.join(cwd, 'AGENTS.md'), 'utf8'), /showdar-insurance-review/);
    assert.equal(run(cwd, 'doctor').code, 0);
    const again = run(cwd, 'add', 'profile', 'insurance');
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /New skills: 0/);
    assert.deepEqual((await manifest(cwd)).skills, after.skills);
  } finally { await cleanup(); }
});

test('both showdar add git and add showdar-git are equivalent', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'add', 'git').code, 0);
    const a = await manifest(cwd);
    assert.equal(a.skills.length, 1);
    assert.equal(a.skills[0], 'showdar-git');
    assert.equal(run(cwd, 'add', 'showdar-git').code, 0);
    assert.deepEqual((await manifest(cwd)).skills, a.skills);
    assert.equal(run(cwd, 'doctor').code, 0);
  } finally { await cleanup(); }
});

test('add workflow feature installs missing primitive stages and preserves old skill set', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'codex').code, 0);
    const prior = (await manifest(cwd)).skills;
    const install = run(cwd, 'add', 'workflow', 'feature');
    assert.equal(install.code, 0, install.stderr);
    const m = await manifest(cwd);
    assert.equal(m.profile, 'minimal');
    for (const id of [...prior, 'showdar-feature', ...getWorkflow('showdar-feature').stages]) {
      assert.ok(m.skills.includes(id), id);
    }
    assert.equal(m.skills.length, new Set([...prior, 'showdar-feature', ...getWorkflow('showdar-feature').stages]).size);
    assert.equal(run(cwd, 'doctor').code, 0);
    assert.equal(run(cwd, 'add', 'feature').code, 0);
    assert.equal(run(cwd, 'add', 'showdar-feature').code, 0);
    assert.deepEqual((await manifest(cwd)).skills, m.skills);
  } finally { await cleanup(); }
});

test('add workflow local JSON preserves extension manifest when adding profile later', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'codex').code, 0);
    const wfPath = path.join(cwd, 'acme-mini.json');
    await writeFile(wfPath, JSON.stringify({
      id: 'acme-mini',
      description: 'Minimal additive custom workflow in insurance workspace',
      stages: ['showdar-build', 'showdar-test'],
      requiredStages: ['showdar-build'],
    }));
    const custom = run(cwd, 'add', 'workflow', './acme-mini.json');
    assert.equal(custom.code, 0, custom.stderr);
    const first = await manifest(cwd);
    assert.equal(first.extensions?.customWorkflows?.[0]?.id, 'acme-mini');
    const add = run(cwd, 'add', 'profile', 'insurance');
    assert.equal(add.code, 0, add.stderr);
    const after = await manifest(cwd);
    assert.equal(after.extensions?.customWorkflows?.[0]?.id, 'acme-mini');
    assert.equal(run(cwd, 'doctor').code, 0);
  } finally { await cleanup(); }
});

test('add profile works with --ai all and init remains replace', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'all').code, 0);
    const add = run(cwd, 'add', 'profile', 'insurance');
    assert.equal(add.code, 0, add.stderr);
    const m = await manifest(cwd);
    assert.equal(m.ai, 'all');
    for (const ai of ['opencode', 'cursor', 'codex']) {
      await access(skillPath(cwd, ai, 'insurance-domain'));
    }
    assert.equal(run(cwd, 'doctor').code, 0);
    const replace = run(cwd, 'init', '--profile', 'insurance', '--ai', 'all');
    assert.equal(replace.code, 0, replace.stderr);
    assert.deepEqual((await manifest(cwd)).skills, resolveProfile('insurance'));
    assert.equal(run(cwd, 'doctor').code, 0);
  } finally { await cleanup(); }
});

test('unknown profile or invalid workflow is rejected without changes', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'codex').code, 0);
    const before = await manifest(cwd);
    assert.equal(run(cwd, 'add', 'profile', 'not-a-profile').code, 1);
    assert.equal(run(cwd, 'add', 'workflow', 'not-a-workflow').code, 1);
    assert.equal(run(cwd, 'add', 'workflow', './file-not-found.json').code, 1);
    assert.deepEqual((await manifest(cwd)).skills, before.skills);
  } finally { await cleanup(); }
});

test('add profile rejects foreign destination before installing any profile member', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    assert.equal(run(cwd, 'init', '--profile', 'minimal', '--ai', 'codex').code, 0);
    const foreign = skillPath(cwd, 'codex', 'insurance-review');
    await mkdir(path.dirname(foreign), { recursive: true });
    await mkdir(path.dirname(foreign), { recursive: true });
    await mkdir(path.join(cwd, '.agents/skills/showdar-insurance-review'), {recursive:true});
    await writeFile(foreign, 'foreign content');
    const original = await manifest(cwd);
    const add = run(cwd, 'add', 'profile', 'insurance');
    assert.equal(add.code, 1);
    assert.deepEqual((await manifest(cwd)).skills, original.skills);
    assert.equal(await readFile(foreign, 'utf8'), 'foreign content');
  } finally { await cleanup(); }
});
