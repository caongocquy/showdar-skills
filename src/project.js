import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { globalCommandRootFor, globalSkillRootFor, NATIVE_TARGETS, opencodeCommandRoot, resolveTargets, skillRootFor } from './adapters.js';

const PROJECT_MANIFEST = '.showdar.json';
const START = '<!-- showdar-skills:start -->';
const END = '<!-- showdar-skills:end -->';

export function globalManifestPath(homeRoot = homedir()) {
  return path.join(homeRoot, '.showdar', 'global.json');
}

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

async function readManifest(manifestPath) {
  if (!(await exists(manifestPath))) return null;
  try { return JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { throw new Error(`Invalid Showdar manifest: ${error.message}`); }
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
    ['review changes, pull request, correctness, maintainability, architecture, performance', 'showdar-review'],
    ['upgrade dependency, framework, platform, migration', 'showdar-upgrade'],
    ['release readiness, handoff, package verification, rollback assessment', 'showdar-ship'],
    ['recover interrupted session or partial implementation', 'showdar-recover'],
    ['commit, stage, merge, rebase, conflict, or push local Git work', 'showdar-git'],
    ['analyze product requirements, business rules, ambiguity, or acceptance criteria', 'showdar-requirements'],
    ['plan QA scenarios, regression scope, risk coverage, or bug evidence', 'showdar-quality'],
    ['threat model, security posture, authz, secrets, attack surface, or data exposure', 'showdar-security'],
    ['CI/CD, containers, environment config, deployment, observability, or rollback operations', 'showdar-ops'],
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

function safeOwnedPath(baseRoot, relative, allowedRoots = []) {
  if (typeof relative !== 'string' || !relative) return null;
  const roots = [baseRoot, ...allowedRoots].map((root) => path.resolve(root));
  const target = path.resolve(relative.startsWith(path.sep) ? relative : path.join(roots[0], relative));
  if (!roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`))) return null;
  return target;
}

function manifestPathFor(baseRoot, destination) {
  const relative = path.relative(baseRoot, destination);
  return relative.replaceAll(path.sep, '/');
}

async function copyOwned({ baseRoot, source, destination, priorOwned, newFiles }) {
  const relative = manifestPathFor(baseRoot, destination);
  if ((await exists(destination)) && !priorOwned.has(relative)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed skill or command: ${destination}`);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  newFiles.push({ path: relative, hash: await hashTree(destination) });
}

async function initInstallation({ baseRoot, manifestPath, agentsRoot, packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0', scope, skillRootForTarget, commandRoot, managedRoots = [] }) {
  await mkdir(baseRoot, { recursive: true });
  const targets = resolveTargets(ai);
  const prior = await readManifest(manifestPath);
  const priorOwned = ownedPathSet(prior);
  const desiredPaths = new Set();

  const skillRoots = new Map();
  for (const target of targets) {
    const root = skillRootForTarget(target);
    skillRoots.set(path.resolve(root), root);
  }
  for (const root of skillRoots.values()) {
    for (const skillId of skillIds) desiredPaths.add(manifestPathFor(baseRoot, path.join(root, skillId)));
  }
  if (targets.includes('opencode')) {
    for (const name of commandNames) desiredPaths.add(manifestPathFor(baseRoot, path.join(commandRoot(), `${name}.md`)));
  }

  for (const entry of prior?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (target && !desiredPaths.has(entry.path)) await rm(target, { recursive: true, force: true });
  }

  const files = [];
  for (const root of skillRoots.values()) {
    for (const skillId of skillIds) {
      const source = path.join(packageRoot, 'skills', skillId);
      if (!(await exists(path.join(source, 'SKILL.md')))) throw new Error(`Skill asset not found: ${skillId}`);
      await copyOwned({ baseRoot, source, destination: path.join(root, skillId), priorOwned, newFiles: files });
    }
  }

  if (targets.includes('opencode')) {
    const root = commandRoot();
    for (const name of commandNames) {
      const source = path.join(packageRoot, 'commands', 'opencode', 'showdar', `${name}.md`);
      if (!(await exists(source))) throw new Error(`OpenCode command asset not found: ${name}`);
      await copyOwned({ baseRoot, source, destination: path.join(root, `${name}.md`), priorOwned, newFiles: files });
    }
  }

  const manifest = {
    version: 2,
    scope,
    packageVersion,
    profile,
    ai,
    targets,
    skills: [...skillIds],
    commands: targets.includes('opencode') ? [...commandNames] : [],
    files,
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeJsonAtomic(manifestPath, manifest);
  if (agentsRoot) await writeAgentsBlock(agentsRoot, skillIds);
  return inspectInstallation({ baseRoot, manifestPath, agentsRoot, scope });
}

export async function initProject({ projectRoot, packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0' }) {
  return initInstallation({
    baseRoot: projectRoot,
    manifestPath: path.join(projectRoot, PROJECT_MANIFEST),
    agentsRoot: projectRoot,
    packageRoot,
    profile,
    ai,
    skillIds,
    commandNames,
    packageVersion,
    scope: 'project',
    skillRootForTarget: (target) => skillRootFor(target, projectRoot),
    commandRoot: () => opencodeCommandRoot(projectRoot),
  });
}

export async function initGlobal({ homeRoot = homedir(), packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0' }) {
  const managedRoots = [...new Set(NATIVE_TARGETS.map((target) => globalSkillRootFor(target, { homeRoot }))), globalCommandRootFor({ homeRoot })];
  return initInstallation({
    baseRoot: homeRoot,
    manifestPath: globalManifestPath(homeRoot),
    agentsRoot: null,
    packageRoot,
    profile,
    ai,
    skillIds,
    commandNames,
    packageVersion,
    scope: 'global',
    skillRootForTarget: (target) => globalSkillRootFor(target, { homeRoot }),
    commandRoot: () => globalCommandRootFor({ homeRoot }),
    managedRoots,
  });
}

async function inspectInstallation({ baseRoot, manifestPath, agentsRoot, scope, managedRoots = [] }) {
  let manifest;
  try { manifest = await readManifest(manifestPath); }
  catch (error) { return { installed: true, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, commands: 0, issues: [error.message] }; }
  if (!manifest) return { installed: false, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, commands: 0, issues: ['Showdar is not installed.'] };

  const issues = [];
  for (const entry of manifest.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (!target) { issues.push(`Invalid managed path: ${entry.path}`); continue; }
    if (!(await exists(target))) { issues.push(`Missing managed path: ${entry.path}`); continue; }
    const actual = await hashTree(target);
    if (actual !== entry.hash) issues.push(`Managed path drift detected: ${entry.path}`);
  }

  if (agentsRoot) {
    const agentsFile = path.join(agentsRoot, 'AGENTS.md');
    if (!(await exists(agentsFile))) issues.push('Missing AGENTS.md routing block');
    else {
      const text = await readFile(agentsFile, 'utf8');
      if (!text.includes(START) || !text.includes(END)) issues.push('Missing Showdar AGENTS.md managed block');
    }
  }

  return {
    installed: true,
    healthy: issues.length === 0,
    scope: manifest.scope ?? scope,
    profile: manifest.profile ?? null,
    ai: manifest.ai ?? null,
    targets: manifest.targets ?? [],
    skills: (manifest.skills ?? []).length,
    commands: (manifest.commands ?? []).length,
    issues,
  };
}

async function removeInstallation({ baseRoot, manifestPath, agentsRoot, managedRoots = [] }) {
  let manifest;
  try { manifest = await readManifest(manifestPath); }
  catch { manifest = null; }
  for (const entry of manifest?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (target) await rm(target, { recursive: true, force: true });
  }
  await rm(manifestPath, { force: true });
  if (agentsRoot) await removeAgentsBlock(agentsRoot);
}

export async function inspectProject(projectRoot) {
  return inspectInstallation({ baseRoot: projectRoot, manifestPath: path.join(projectRoot, PROJECT_MANIFEST), agentsRoot: projectRoot, scope: 'project' });
}

export async function inspectGlobal({ homeRoot = homedir() } = {}) {
  const managedRoots = [...new Set(NATIVE_TARGETS.map((target) => globalSkillRootFor(target, { homeRoot }))), globalCommandRootFor({ homeRoot })];
  return inspectInstallation({ baseRoot: homeRoot, manifestPath: globalManifestPath(homeRoot), agentsRoot: null, scope: 'global', managedRoots });
}

export async function removeProject(projectRoot) {
  await removeInstallation({ baseRoot: projectRoot, manifestPath: path.join(projectRoot, PROJECT_MANIFEST), agentsRoot: projectRoot });
}

export async function removeGlobal({ homeRoot = homedir() } = {}) {
  const managedRoots = [...new Set(NATIVE_TARGETS.map((target) => globalSkillRootFor(target, { homeRoot }))), globalCommandRootFor({ homeRoot })];
  await removeInstallation({ baseRoot: homeRoot, manifestPath: globalManifestPath(homeRoot), agentsRoot: null, managedRoots });
}
