import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ADAPTERS, resolveTargets } from '../src/adapters.js';
import {
  renderShowdarInstruction,
  renderShowdarCommand,
  renderShowdarAggregator,
  renderCursorRuleBody,
  renderManagedBlock,
} from '../src/adapter-renderers.js';
import { initGlobal, initProject, inspectProject, removeProject, addSkill } from '../src/project.js';
import { resolveProfile } from '../src/catalog.js';

async function fixture(skillIds) {
  const base = await mkdtemp(path.join(tmpdir(), 'showdar-adapters05-'));
  const packageRoot = path.join(base, 'package');
  const projectRoot = path.join(base, 'project');
  const homeRoot = path.join(base, 'home');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  for (const skillId of skillIds) {
    await mkdir(path.join(packageRoot, 'skills', skillId), { recursive: true });
    await writeFile(path.join(packageRoot, 'skills', skillId, 'SKILL.md'), `---\nname: ${skillId}\ndescription: Fixture skill ${skillId} used only for adapter testing.\n---\n`);
  }
  return { base, packageRoot, projectRoot, homeRoot };
}

async function cleanup(base) {
  await rm(base, { recursive: true, force: true });
}

test('adapter table has one instruction surface per target, commands only for opencode/claude', () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), ['claude', 'codex', 'cursor', 'opencode', 'universal']);
  assert.equal(ADAPTERS.universal.instruction.file, 'AGENTS.md');
  assert.equal(ADAPTERS.codex.instruction.file, 'AGENTS.md');
  assert.equal(ADAPTERS.opencode.instruction.file, 'AGENTS.md');
  assert.equal(ADAPTERS.claude.instruction.file, 'CLAUDE.md');
  assert.equal(ADAPTERS.cursor.instruction.file, path.join('.cursor', 'rules', 'showdar.mdc'));
  assert.equal(ADAPTERS.universal.commands, null);
  assert.equal(ADAPTERS.codex.commands, null);
  assert.equal(ADAPTERS.cursor.commands, null);
  assert.ok(ADAPTERS.opencode.commands.destination);
  assert.ok(ADAPTERS.claude.commands.destination);
  assert.deepEqual(resolveTargets('all'), ['codex', 'opencode', 'cursor', 'claude', 'universal']);
});

test('canonical renderers are deterministic and catalog-ordered', () => {
  const a = renderShowdarInstruction(['showdar-test', 'showdar-debug', 'showdar-build']);
  const b = renderShowdarInstruction(['showdar-build', 'showdar-debug', 'showdar-test']);
  assert.equal(a, b);
  const lines = a.trim().split('\n');
  assert.ok(lines[0].includes('showdar-build'));
  assert.ok(lines[1].includes('showdar-debug'));
  assert.ok(lines[2].includes('showdar-test'));
  assert.doesNotMatch(a, /\d{4}-\d{2}-\d{2}/);
  assert.equal(renderShowdarCommand('showdar-debug'), renderShowdarCommand('showdar-debug'));
  assert.match(renderShowdarCommand('showdar-debug'), /\$ARGUMENTS/);
  assert.match(renderShowdarCommand('showdar-debug'), /showdar-debug/);
  assert.equal(renderShowdarAggregator(['showdar-test', 'showdar-debug']), renderShowdarAggregator(['showdar-debug', 'showdar-test']));
});

test('AGENTS/CLAUDE/Cursor share identical semantic body after wrapper removal', () => {
  const ids = ['showdar-debug', 'showdar-test'];
  const agentsBlock = renderManagedBlock(ids, 'block');
  const claudeBlock = renderManagedBlock(ids, 'block');
  const cursorRule = renderCursorRuleBody(ids);
  const stripBlock = (text) => {
    const start = text.indexOf('<!-- showdar-skills:start -->');
    const end = text.indexOf('<!-- showdar-skills:end -->');
    const body = text.slice(start, end);
    return body.replace(/## Showdar Skills routing|Use the smallest Showdar skill|For debugging, gather evidence|Never print or commit secrets/g, '').trim();
  };
  const stripCursor = (text) => text.replace(/---[\s\S]*?---/, '').trim();
  const canonical = renderShowdarInstruction(ids).trim();
  assert.ok(stripBlock(agentsBlock).includes(canonical.split('\n')[0]));
  assert.ok(stripBlock(claudeBlock).includes(canonical.split('\n')[0]));
  assert.ok(stripCursor(cursorRule).includes(canonical.split('\n')[0]));
  assert.match(cursorRule, /alwaysApply: false/);
  assert.doesNotMatch(cursorRule, /alwaysApply: true/);
  assert.doesNotMatch(cursorRule, /globs/);
});

test('explicit project targets get exactly one instruction surface', async () => {
  const skillIds = ['showdar-debug'];
  const cases = [
    { ai: 'universal', instruction: 'AGENTS.md', commands: false },
    { ai: 'codex', instruction: 'AGENTS.md', commands: false },
    { ai: 'opencode', instruction: 'AGENTS.md', commands: true },
    { ai: 'claude', instruction: 'CLAUDE.md', commands: true },
    { ai: 'cursor', instruction: path.join('.cursor', 'rules', 'showdar.mdc'), commands: false },
  ];
  for (const { ai, instruction, commands } of cases) {
    const { base, packageRoot, projectRoot, homeRoot } = await fixture(skillIds);
    try {
      await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai, skillIds, packageVersion: '0.4.0' });
      await access(path.join(projectRoot, instruction));
      if (ai === 'cursor') {
        await assert.rejects(access(path.join(projectRoot, 'AGENTS.md')));
        await assert.rejects(access(path.join(projectRoot, 'CLAUDE.md')));
      } else if (ai === 'claude') {
        await assert.rejects(access(path.join(projectRoot, 'AGENTS.md')));
      } else {
        await assert.rejects(access(path.join(projectRoot, 'CLAUDE.md')));
        await assert.rejects(access(path.join(projectRoot, '.cursor', 'rules', 'showdar.mdc')));
      }
      if (commands) {
        const root = ai === 'opencode' ? '.opencode/commands/showdar' : '.claude/commands/showdar';
        await access(path.join(projectRoot, root, 'debug.md'));
        await access(path.join(projectRoot, root, 'skill.md'));
      } else {
        await assert.rejects(access(path.join(projectRoot, '.opencode/commands/showdar/debug.md')));
        await assert.rejects(access(path.join(projectRoot, '.claude/commands/showdar/debug.md')));
      }
      assert.equal((await inspectProject(projectRoot, { homeRoot })).healthy, true);
    } finally { await cleanup(base); }
  }
});

test('command counts follow installed set: minimal 8+1, add feature 9+1, full+workflows 19+1', async () => {
  const allIds = [...resolveProfile('full'), 'showdar-feature', 'showdar-bugfix', 'showdar-release', 'showdar-incident'];
  const { base, packageRoot, projectRoot, homeRoot } = await fixture(allIds);
  try {
    const minimal = resolveProfile('minimal');
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'opencode', skillIds: minimal, packageVersion: '0.4.0' });
    const readDir = async (dir) => (await import('node:fs/promises')).readdir(dir);
    let files = await readDir(path.join(projectRoot, '.opencode/commands/showdar'));
    assert.equal(files.filter((f) => f !== 'skill.md').length, 8);
    assert.ok(files.includes('skill.md'));

    await addSkill({ cwd: projectRoot, skill: 'feature', packageRoot, home: homeRoot, packageVersion: '0.4.0' });
    files = await readDir(path.join(projectRoot, '.opencode/commands/showdar'));
    assert.equal(files.filter((f) => f !== 'skill.md').length, 9);
    assert.ok(files.includes('feature.md'));

    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'full', ai: 'opencode', skillIds: allIds, packageVersion: '0.4.0' });
    files = await readDir(path.join(projectRoot, '.opencode/commands/showdar'));
    assert.equal(files.filter((f) => f !== 'skill.md').length, 19);
    assert.ok(files.includes('skill.md'));
    const aggregator = await readFile(path.join(projectRoot, '.opencode/commands/showdar/skill.md'), 'utf8');
    for (const id of allIds) assert.ok(aggregator.includes(id));
  } finally { await cleanup(base); }
});

test('--ai all writes only AGENTS.md block plus both command sets', async () => {
  const skillIds = ['showdar-debug'];
  const { base, packageRoot, projectRoot, homeRoot } = await fixture(skillIds);
  try {
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'all', skillIds, packageVersion: '0.4.0' });
    await access(path.join(projectRoot, 'AGENTS.md'));
    await access(path.join(projectRoot, '.opencode/commands/showdar/debug.md'));
    await access(path.join(projectRoot, '.claude/commands/showdar/debug.md'));
    await assert.rejects(access(path.join(projectRoot, 'CLAUDE.md')));
    await assert.rejects(access(path.join(projectRoot, '.cursor', 'rules', 'showdar.mdc')));
    assert.equal((await inspectProject(projectRoot, { homeRoot })).healthy, true);
  } finally { await cleanup(base); }
});

test('global installs support skills+commands but no instruction files', async () => {
  const skillIds = ['showdar-debug'];
  const { base, packageRoot, homeRoot } = await fixture(skillIds);
  const projectRoot = path.join(base, 'project');
  await mkdir(projectRoot, { recursive: true });
  try {
    await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'opencode', skillIds, packageVersion: '0.4.0' });
    await access(path.join(homeRoot, '.config', 'opencode', 'skills', 'showdar-debug', 'SKILL.md'));
    await access(path.join(homeRoot, '.config', 'opencode', 'commands', 'showdar', 'debug.md'));
    await assert.rejects(access(path.join(homeRoot, 'AGENTS.md')));
    await assert.rejects(access(path.join(homeRoot, 'CLAUDE.md')));

    await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'claude', skillIds, packageVersion: '0.4.0' });
    await access(path.join(homeRoot, '.claude', 'skills', 'showdar-debug', 'SKILL.md'));
    await access(path.join(homeRoot, '.claude', 'commands', 'showdar', 'debug.md'));
    await assert.rejects(access(path.join(homeRoot, 'CLAUDE.md')));

    await initGlobal({ homeRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds, packageVersion: '0.4.0' });
    await access(path.join(homeRoot, '.cursor', 'skills', 'showdar-debug', 'SKILL.md'));
    await assert.rejects(access(path.join(homeRoot, '.cursor', 'rules', 'showdar.mdc')));
  } finally { await cleanup(base); }
});

test('ownership: foreign content preserved, foreign same-path refused, idempotent', async () => {
  const skillIds = ['showdar-debug'];
  const { base, packageRoot, projectRoot, homeRoot } = await fixture(skillIds);
  try {
    await writeFile(path.join(projectRoot, 'AGENTS.md'), '# User rules\n');
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds, packageVersion: '0.4.0' });
    const agents = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agents, /User rules/);
    assert.match(agents, /showdar-debug/);
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds, packageVersion: '0.4.0' });
    const again = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.equal(again, agents);

    await writeFile(path.join(projectRoot, 'CLAUDE.md'), '# Claude user\n');
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'claude', skillIds, packageVersion: '0.4.0' });
    const claude = await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /Claude user/);
    assert.match(claude, /showdar-debug/);

    await removeProject(projectRoot);
    const agentsAfter = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.equal(agentsAfter.trim(), '# User rules');
  } finally { await cleanup(base); }
});

test('target switching cleans only stale Showdar-owned artifacts', async () => {
  const skillIds = ['showdar-debug'];
  const { base, packageRoot, projectRoot, homeRoot } = await fixture(skillIds);
  try {
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'cursor', skillIds, packageVersion: '0.4.0' });
    await access(path.join(projectRoot, '.cursor', 'rules', 'showdar.mdc'));
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'claude', skillIds, packageVersion: '0.4.0' });
    await assert.rejects(access(path.join(projectRoot, '.cursor', 'rules', 'showdar.mdc')));
    await access(path.join(projectRoot, 'CLAUDE.md'));
    await access(path.join(projectRoot, '.claude', 'commands', 'showdar', 'debug.md'));
    await initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'opencode', skillIds, packageVersion: '0.4.0' });
    await assert.rejects(access(path.join(projectRoot, 'CLAUDE.md')));
    await access(path.join(projectRoot, 'AGENTS.md'));
    await access(path.join(projectRoot, '.opencode', 'commands', 'showdar', 'debug.md'));
    assert.equal((await inspectProject(projectRoot, { homeRoot })).healthy, true);
  } finally { await cleanup(base); }
});

test('symlink and incomplete marker safety', async () => {
  const skillIds = ['showdar-debug'];
  const { base, packageRoot, projectRoot, homeRoot } = await fixture(skillIds);
  try {
    const external = path.join(base, 'external-agents.md');
    await writeFile(external, 'external\n');
    await symlink(external, path.join(projectRoot, 'AGENTS.md'));
    await assert.rejects(
      initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds, packageVersion: '0.4.0' }),
      /symlink/i,
    );
    await rm(path.join(projectRoot, 'AGENTS.md'), { force: true });
    await writeFile(path.join(projectRoot, 'AGENTS.md'), '<!-- showdar-skills:start -->\nbroken\n');
    await assert.rejects(
      initProject({ projectRoot, homeRoot, packageRoot, profile: 'minimal', ai: 'codex', skillIds, packageVersion: '0.4.0' }),
      /incomplete/,
    );
  } finally { await cleanup(base); }
});
