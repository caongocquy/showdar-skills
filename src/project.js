import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { opencodeCommandRoot, resolveTargets, skillRootFor } from './adapters.js';

const MANIFEST = '.showdar.json';
const START = '<!-- showdar-skills:start -->';
const END = '<!-- showdar-skills:end -->';

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function hashTree(target) {
  const h = createHash('sha256');
  async function walk(current, relative = '') {
    const info = await stat(current);
    if (info.isDirectory()) {
      const entries = await readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) await walk(path.join(current, entry.name), path.join(relative, entry.name));
      return;
    }
    h.update(relative.replaceAll(path.sep, '/'));
    h.update('\0');
    h.update(await readFile(current));
    h.update('\0');
  }
  await walk(target);
  return h.digest('hex');
}

async function readManifest(projectRoot) {
  const target = path.join(projectRoot, MANIFEST);
  if (!(await exists(target))) return null;
  try { return JSON.parse(await readFile(target, 'utf8')); }
  catch (error) { throw new Error(`Invalid ${MANIFEST}: ${error.message}`); }
}

async function writeJsonAtomic(target, value) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, target);
}

function managedBlock(skillIds) {
  const routes = [
    ['understand repository, architecture, dependencies, impact', 'showdar-understand'],
    ['plan feature, requirement, scope, implementation', 'showdar-plan'],
    ['design UI, UX, responsive layout, visual polish, accessibility', 'showdar-design'],
    ['implement or refactor production code', 'showdar-build'],
    ['debug bug, crash, regression, build or performance failure', 'showdar-debug'],
    ['test strategy, regression, integration, E2E', 'showdar-test'],
    ['review changes, pull request, security, architecture, performance', 'showdar-review'],
    ['upgrade dependency, framework, platform, migration', 'showdar-upgrade'],
    ['release, deploy, publish, App Store, Play Store, rollback', 'showdar-ship'],
    ['recover interrupted session or partial implementation', 'showdar-recover'],
  ].filter(([, id]) => skillIds.includes(id));
  const lines = routes.map(([intent, skill]) => `- ${intent} -> \`${skill}\``).join('\n');
  return `${START}\n## Showdar Skills routing\n\nUse the smallest Showdar skill that fully matches the current task. Do not load unrelated Showdar skills.\n\n${lines}\n\nFor debugging, gather evidence before modifying code. For shipping or destructive operations, require explicit user approval and fresh verification. Never print or commit secrets.\n${END}`;
}

function stripManagedBlock(content) {
  const start = content.indexOf(START);
  if (start === -1) return content;
  const end = content.indexOf(END, start);
  if (end === -1) throw new Error('AGENTS.md contains an incomplete Showdar managed block. Repair it manually before continuing.');
  const before = content.slice(0, start).trimEnd();
  const after = content.slice(end + END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

async function writeAgentsBlock(projectRoot, skillIds) {
  const target = path.join(projectRoot, 'AGENTS.md');
  const current = (await exists(target)) ? await readFile(target, 'utf8') : '';
  const clean = stripManagedBlock(current).trimEnd();
  const block = managedBlock(skillIds);
  await writeFile(target, clean ? `${clean}\n\n${block}\n` : `${block}\n`);
}

async function removeAgentsBlock(projectRoot) {
  const target = path.join(projectRoot, 'AGENTS.md');
  if (!(await exists(target))) return;
  const current = await readFile(target, 'utf8');
  const clean = stripManagedBlock(current).trim();
  if (clean) await writeFile(target, `${clean}\n`);
  else await rm(target, { force: true });
}

function ownedPathSet(manifest) {
  return new Set((manifest?.files ?? []).map((entry) => entry.path));
}

async function copyOwned({ projectRoot, source, destination, priorOwned, newFiles }) {
  const relative = path.relative(projectRoot, destination).replaceAll(path.sep, '/');
  if ((await exists(destination)) && !priorOwned.has(relative)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed skill or command: ${destination}`);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  newFiles.push({ path: relative, hash: await hashTree(destination) });
}

export async function initProject({ projectRoot, packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0' }) {
  await mkdir(projectRoot, { recursive: true });
  const targets = resolveTargets(ai);
  const prior = await readManifest(projectRoot);
  const priorOwned = ownedPathSet(prior);
  const desiredPaths = new Set();

  for (const target of targets) {
    const root = skillRootFor(target, projectRoot);
    for (const skillId of skillIds) desiredPaths.add(path.relative(projectRoot, path.join(root, skillId)).replaceAll(path.sep, '/'));
  }
  if (targets.includes('opencode')) {
    for (const name of commandNames) desiredPaths.add(path.relative(projectRoot, path.join(opencodeCommandRoot(projectRoot), `${name}.md`)).replaceAll(path.sep, '/'));
  }

  for (const entry of prior?.files ?? []) {
    if (!desiredPaths.has(entry.path)) await rm(path.join(projectRoot, entry.path), { recursive: true, force: true });
  }

  const files = [];
  for (const target of targets) {
    const root = skillRootFor(target, projectRoot);
    for (const skillId of skillIds) {
      const source = path.join(packageRoot, 'skills', skillId);
      if (!(await exists(path.join(source, 'SKILL.md')))) throw new Error(`Skill asset not found: ${skillId}`);
      await copyOwned({ projectRoot, source, destination: path.join(root, skillId), priorOwned, newFiles: files });
    }
  }

  if (targets.includes('opencode')) {
    const root = opencodeCommandRoot(projectRoot);
    for (const name of commandNames) {
      const source = path.join(packageRoot, 'commands', 'opencode', 'showdar', `${name}.md`);
      if (!(await exists(source))) throw new Error(`OpenCode command asset not found: ${name}`);
      await copyOwned({ projectRoot, source, destination: path.join(root, `${name}.md`), priorOwned, newFiles: files });
    }
  }

  const manifest = {
    version: 2,
    packageVersion,
    profile,
    ai,
    targets,
    skills: [...skillIds],
    commands: targets.includes('opencode') ? [...commandNames] : [],
    files,
  };
  await writeJsonAtomic(path.join(projectRoot, MANIFEST), manifest);
  await writeAgentsBlock(projectRoot, skillIds);
  return inspectProject(projectRoot);
}

export async function inspectProject(projectRoot) {
  let manifest;
  try { manifest = await readManifest(projectRoot); }
  catch (error) { return { installed: true, healthy: false, profile: null, ai: null, targets: [], skills: 0, commands: 0, issues: [error.message] }; }
  if (!manifest) return { installed: false, healthy: false, profile: null, ai: null, targets: [], skills: 0, commands: 0, issues: ['Showdar is not installed.'] };

  const issues = [];
  for (const entry of manifest.files ?? []) {
    const target = path.join(projectRoot, entry.path);
    if (!(await exists(target))) { issues.push(`Missing managed path: ${entry.path}`); continue; }
    const actual = await hashTree(target);
    if (actual !== entry.hash) issues.push(`Managed path drift detected: ${entry.path}`);
  }

  const agentsFile = path.join(projectRoot, 'AGENTS.md');
  if (!(await exists(agentsFile))) issues.push('Missing AGENTS.md routing block');
  else {
    const text = await readFile(agentsFile, 'utf8');
    if (!text.includes(START) || !text.includes(END)) issues.push('Missing Showdar AGENTS.md managed block');
  }

  return {
    installed: true,
    healthy: issues.length === 0,
    profile: manifest.profile ?? null,
    ai: manifest.ai ?? null,
    targets: manifest.targets ?? [],
    skills: (manifest.skills ?? []).length,
    commands: (manifest.commands ?? []).length,
    issues,
  };
}

export async function removeProject(projectRoot) {
  let manifest;
  try { manifest = await readManifest(projectRoot); }
  catch { manifest = null; }
  for (const entry of manifest?.files ?? []) await rm(path.join(projectRoot, entry.path), { recursive: true, force: true });
  await rm(path.join(projectRoot, MANIFEST), { force: true });
  await removeAgentsBlock(projectRoot);
}
