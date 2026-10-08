import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, addSkill, initGlobal, inspectProject } from '../src/project.js';
import { resolveProfile } from '../src/catalog.js';
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
for (const [ai, surface, commands] of [
  ['universal', 'AGENTS.md'], ['codex', 'AGENTS.md'], ['opencode', 'AGENTS.md', '.opencode'], ['claude', 'CLAUDE.md', '.claude'], ['cursor', '.cursor/rules/showdar.mdc'],
]) test(`runtime + branch preflight on ${ai}, init then add full installed set`, async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'runtime-adapter-'));
  const projectRoot = path.join(base, 'project'); const home = path.join(base, 'home');
  await mkdir(projectRoot); await mkdir(home);
  try {
    await initProject({ projectRoot, homeRoot: home, packageRoot, ai, profile: 'minimal', skillIds: resolveProfile('minimal') });
    await addSkill({ cwd: projectRoot, home, packageRoot, skill: 'insurance-workflows' });
    const instruction = path.join(projectRoot, surface);
    // Simulate guidance installed before the runtime bridge, then re-add an existing skill.
    await writeFile(instruction, (await readFile(instruction, 'utf8')).replaceAll('showdar route --stdin --json', 'legacy routing'));
    await addSkill({ cwd: projectRoot, home, packageRoot, skill: 'insurance-workflows' });
    const text = await readFile(instruction, 'utf8');
    assert.match(text, /showdar route --stdin --json/);
    assert.match(text, /showdar-build/);
    assert.match(text, /showdar-insurance-workflows/);
    assert.match(text, /before the first task-owned source edit/i);
    assert.match(text, /develop.*main/i);
    assert.match(text, /showdar git-start --type/);
    assert.match(text, /showdar guard --mutation local-write --json/);
    if (ai === 'cursor') assert.match(text, /alwaysApply: true/);
    assert.match(text, /does not authorize mutation/i);
    assert.match(text, /CLI.*unavailable.*native/i);
    assert.match(text, /explicit.*named.*skill/i);
    if (commands) {
      for (const name of ['build', 'insurance-workflows', 'skill']) {
        const command = await readFile(path.join(projectRoot, commands, 'commands/showdar', `${name}.md`), 'utf8');
        assert.match(command, /showdar route --stdin --json/);
        assert.match(command, /showdar git-start --type/);
        assert.match(command, /showdar guard --mutation local-write --json/);
      }
      assert.match(await readFile(path.join(projectRoot, commands, 'commands/showdar/skill.md'), 'utf8'), /showdar-build.*showdar-insurance-workflows/);
    }
    assert.equal((await inspectProject(projectRoot, home)).healthy, true);
    for (const dir of ['src', 'engine', 'router']) await assert.rejects(access(path.join(projectRoot, dir)), { code: 'ENOENT' });
    const skill = await readFile(path.join(packageRoot, 'skills/showdar-git/SKILL.md'), 'utf8');
    assert.match(skill, /Task branch isolation/);
    assert.match(skill, /showdar guard --mutation local-write --json/);
    assert.match(skill, /before the first task-owned source edit/i);
    assert.match(skill, /one branch per coherent task/i);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('global install writes no project instructions', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'runtime-global-'));
  try {
    await initGlobal({ homeRoot: home, packageRoot, ai: 'claude', profile: 'insurance', skillIds: resolveProfile('insurance') });
    for (const file of ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/showdar.mdc']) await assert.rejects(access(path.join(home, file)), { code: 'ENOENT' });
  } finally { await rm(home, { recursive: true, force: true }); }
});
