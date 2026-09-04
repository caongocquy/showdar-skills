#!/usr/bin/env node
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = await mkdtemp(path.join(tmpdir(), 'showdar-package-smoke-'));
const packDir = path.join(sandbox, 'pack');
const prefix = path.join(sandbox, 'prefix');
const project = path.join(sandbox, 'project');
await mkdir(packDir, { recursive: true });
await mkdir(project, { recursive: true });

function run(command, args, { cwd = root } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

async function mustExist(target) { await access(target); }
async function mustNotExist(target) {
  try { await access(target); throw new Error(`Expected path to be absent: ${target}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', packDir]));
  const filename = packed[0]?.filename;
  if (!filename) throw new Error('npm pack did not return a tarball filename');
  const tarball = path.join(packDir, filename);

  run('npm', ['install', '--prefix', prefix, '--ignore-scripts', tarball]);
  const installed = path.join(prefix, 'node_modules', 'showdar-skills');
  const cli = path.join(installed, 'bin', 'showdar.js');
  await mustExist(cli);

  await writeFile(path.join(project, 'AGENTS.md'), '# User rules\n\nKeep this.\n');
  const userSkill = path.join(project, '.agents', 'skills', 'user-skill');
  await mkdir(userSkill, { recursive: true });
  await writeFile(path.join(userSkill, 'SKILL.md'), 'user-owned\n');

  const init = run(process.execPath, [cli, 'init', '--ai', 'all', '--profile', 'full'], { cwd: project });
  if (!/Skills: 10/.test(init)) throw new Error(`unexpected init output: ${init}`);

  const roots = ['.codex/skills', '.opencode/skills', '.claude/skills', '.agents/skills'];
  const skillIds = ['showdar-understand','showdar-plan','showdar-design','showdar-build','showdar-debug','showdar-test','showdar-review','showdar-upgrade','showdar-ship','showdar-recover'];
  for (const skillRoot of roots) {
    for (const id of skillIds) await mustExist(path.join(project, skillRoot, id, 'SKILL.md'));
  }
  const commands = await readdir(path.join(project, '.opencode', 'commands', 'showdar'));
  if (commands.filter((name) => name.endsWith('.md')).length !== 11) throw new Error(`expected 11 OpenCode commands, got ${commands.length}`);

  // Prove installed skills are self-contained: their helper imports must work outside the source package.
  const searchOut = run(process.execPath, [path.join(project, '.codex/skills/showdar-design/scripts/search.mjs'), '--query', 'wedding editorial elegant', '--domain', 'products', '--limit', '1'], { cwd: project });
  if (!/Wedding Invitation/.test(searchOut)) throw new Error('installed design search did not return expected knowledge');
  const debugOut = run(process.execPath, [path.join(project, '.agents/skills/showdar-debug/scripts/collect-context.mjs'), project], { cwd: project });
  if (!/"cwd"/.test(debugOut) || !/"stacks"/.test(debugOut)) throw new Error('installed debug context script returned incomplete JSON');
  const understandOut = run(process.execPath, [path.join(project, '.claude/skills/showdar-understand/scripts/inspect-repo.mjs'), project], { cwd: project });
  if (!/"root"/.test(understandOut) || !/"signals"/.test(understandOut)) throw new Error('installed understand script returned incomplete JSON');
  const shipOut = run(process.execPath, [path.join(project, '.opencode/skills/showdar-ship/scripts/release-check.mjs'), project], { cwd: project });
  if (!/"checks"/.test(shipOut) || !/"note"/.test(shipOut)) throw new Error('installed ship script returned incomplete JSON');

  const doctor = run(process.execPath, [cli, 'doctor'], { cwd: project });
  if (!/Health: OK/.test(doctor)) throw new Error(`doctor is not healthy: ${doctor}`);
  const status = run(process.execPath, [cli, 'status'], { cwd: project });
  if (!/AI: all/.test(status) || !/Skills: 10/.test(status)) throw new Error(`unexpected status: ${status}`);

  run(process.execPath, [cli, 'remove'], { cwd: project });
  await mustNotExist(path.join(project, '.showdar.json'));
  for (const skillRoot of roots) for (const id of skillIds) await mustNotExist(path.join(project, skillRoot, id));
  await mustExist(path.join(userSkill, 'SKILL.md'));
  const agents = await readFile(path.join(project, 'AGENTS.md'), 'utf8');
  if (agents.trim() !== '# User rules\n\nKeep this.') throw new Error(`AGENTS.md user content changed after remove:\n${agents}`);

  console.log(`Package smoke OK: ${filename}`);
  console.log('Lifecycle: pack -> isolated install -> init all/full -> installed skill scripts -> doctor -> status -> remove');
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
