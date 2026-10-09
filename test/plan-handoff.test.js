import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { initProject } from '../src/project.js';
import { validateSkillDirectory } from '../src/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillText = async id => readFile(path.join(root, 'skills', id, 'SKILL.md'), 'utf8');

test('plan creates durable Markdown only when complexity and authorized writes warrant it', async () => {
  const plan = await skillText('showdar-plan');
  const reference = await readFile(path.join(root, 'skills/showdar-plan/references/plan-persistence.md'), 'utf8');
  for (const phrase of [
    /Adaptive Plan Persistence/i,
    /canonical plan\/ticket/i,
    /single.session/i,
    /docs\/plans\/<feature>\.md/i,
    /before creating or modifying a plan file/i,
    /Git preflight/i,
    /TASK-NNN/,
    /dependency/i,
    /verification ledger/i,
  ]) assert.match(plan + reference, phrase);
  assert.match(reference, /A checked box is not itself proof/);
  assert.match(reference, /workflow.state checkpoint/i);
  assert.match(reference, /increment plan revision/i);
});

test('build resumes earliest unmet dependency-ready task, not from unchecked flags alone', async () => {
  const build = await skillText('showdar-build');
  const exec = await readFile(path.join(root, 'skills/showdar-build/references/plan-execution.md'), 'utf8');
  for (const pattern of [
    /Execute and resume a task plan/i,
    /implemented-unverified/,
    /reconcile/i,
    /dependency.ready/i,
    /run.*verification/i,
    /mark.*\[x\]/i,
    /Git preflight/i,
    /blocked/i,
    /change.*scope|plan.*stale|drift/i,
  ]) assert.match(build + exec, pattern);
  assert.match(exec, /checked box.*not.*proof/i);
  assert.match(exec, /workflow.state checkpoint/i);
});

test('brainstorm, plan, build, feature, recover, test and review share task handoff', async () => {
  const names = ['showdar-brainstorm','showdar-plan','showdar-build','showdar-feature','showdar-recover','showdar-test','showdar-review'];
  for (const name of names) {
    const doc = await skillText(name);
    assert.match(doc, /approval|approved|spec/i, name);
    const result = await validateSkillDirectory(path.join(root, 'skills', name));
    assert.deepEqual(result.errors, [], name + ': ' + result.errors.join(', '));
  }
  assert.match(await skillText('showdar-feature'), /Resumable plan handoff/);
  assert.match(await skillText('showdar-recover'), /Resume from persisted plans/);
  assert.match(await skillText('showdar-test'), /Task-plan verification handoff/);
  assert.match(await skillText('showdar-review'), /Saved-plan review checks/);
});

test('installed native plan/build skills carry all lazy-loaded references without writing project docs', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'showdar-plan-handoff-'));
  const projectRoot = path.join(sandbox, 'project');
  const homeRoot = path.join(sandbox, 'home');
  try {
    await mkdir(projectRoot, { recursive: true });
    await mkdir(homeRoot, { recursive: true });
    await initProject({ projectRoot, homeRoot, packageRoot: root, profile: 'minimal',
      ai: 'cursor', skillIds: ['showdar-plan', 'showdar-build'], packageVersion: '0.17.0' });
    for (const p of [
      '.cursor/skills/showdar-plan/SKILL.md',
      '.cursor/skills/showdar-plan/references/plan-persistence.md',
      '.cursor/skills/showdar-plan/examples/persisted-plan.md',
      '.cursor/skills/showdar-build/SKILL.md',
      '.cursor/skills/showdar-build/references/plan-execution.md',
    ]) await access(path.join(projectRoot, p));
    await assert.rejects(access(path.join(projectRoot, 'docs/plans')));
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});
