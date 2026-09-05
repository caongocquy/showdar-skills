import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { globalCommandRootFor, globalSkillRootFor, NATIVE_TARGETS, opencodeCommandRoot, resolveTargets, skillRootFor } from './adapters.js';
import { assertSafeManagedPath, lstatWithoutSymlink, safeOwnedPath } from './path-safety.js';

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
    const info = await lstatWithoutSymlink(current);
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

async function readManifest(manifestPath, baseRoot) {
  await assertSafeManagedPath(baseRoot, manifestPath);
  if (!(await exists(manifestPath))) return null;
  try { return JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { throw new Error(`Invalid Showdar manifest: ${error.message}`); }
}

async function writeJsonAtomic(target, value) {
  await writeTextAtomic(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(target, value) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, value, { flag: 'wx' });
  await rename(tmp, target);
}

function managedBlock(skillIds) {
  const routes = [
    ['map repository architecture, dependencies, or impact', 'showdar-understand'],
    ['plan implementation of agreed behavior and scope', 'showdar-plan'],
    ['design product UI, UX, responsive layout, accessibility, or visual polish', 'showdar-design'],
    ['implement or refactor an agreed application change', 'showdar-build'],
    ['debug an observed bug, crash, regression, build, or performance failure', 'showdar-debug'],
    ['choose or implement automated tests and coverage', 'showdar-test'],
    ['review code or diffs for general correctness, architecture, performance, maintainability, or tests', 'showdar-review'],
    ['upgrade dependencies, frameworks, runtimes, or platforms', 'showdar-upgrade'],
    ['check release, artifact, or handoff readiness', 'showdar-ship'],
    ['recover interrupted or partial engineering work', 'showdar-recover'],
    ['perform local Git inspection, staging, commit, merge, rebase, or conflict work', 'showdar-git'],
    ['define product behavior, business rules, ambiguity, or acceptance criteria', 'showdar-requirements'],
    ['plan QA scenarios, risk coverage, regression, compatibility, or bug evidence', 'showdar-quality'],
    ['assess threats, attack surface, trust boundaries, auth, secrets, exposure, or exploitability', 'showdar-security'],
    ['inspect or change CI/CD, containers, environments, deployment, observability, rollback, or runtime operations', 'showdar-ops'],
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
  await assertSafeManagedPath(projectRoot, target);
  const current = (await exists(target)) ? await readFile(target, 'utf8') : '';
  const clean = stripManagedBlock(current).trimEnd();
  const block = managedBlock(skillIds);
  await writeTextAtomic(target, clean ? `${clean}\n\n${block}\n` : `${block}\n`);
}

async function removeAgentsBlock(projectRoot) {
  const target = path.join(projectRoot, 'AGENTS.md');
  await assertSafeManagedPath(projectRoot, target);
  if (!(await exists(target))) return;
  const current = await readFile(target, 'utf8');
  const clean = stripManagedBlock(current).trim();
  if (clean) await writeTextAtomic(target, `${clean}\n`);
  else await rm(target, { force: true });
}

function ownedPathSet(manifest) {
  return new Set((manifest?.files ?? []).map((entry) => entry.path));
}

function uniqueRoots(targets, resolveRoot) {
  const roots = new Map();
  for (const target of targets) {
    const root = resolveRoot(target);
    if (!roots.has(path.resolve(root))) roots.set(path.resolve(root), { root, target });
  }
  return [...roots.values()];
}

function manifestPathFor(baseRoot, destination) {
  const relative = path.relative(baseRoot, destination);
  return relative.replaceAll(path.sep, '/');
}

async function copyOwned({ baseRoot, source, destination, priorOwned, newFiles, managedRoots = [] }) {
  await assertSafeManagedPath(baseRoot, destination, managedRoots);
  const relative = manifestPathFor(baseRoot, destination);
  if ((await exists(destination)) && !priorOwned.has(relative)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed skill or command: ${destination}`);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  newFiles.push({ path: relative, hash: await hashTree(destination) });
}

async function initInstallation({ baseRoot, manifestPath, agentsRoot, packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0', scope, skillRootForTarget, commandRoot, managedRoots = [], homeRoot = homedir(), globalSkillRootForTarget = null }) {
  await mkdir(baseRoot, { recursive: true });
  await assertSafeManagedPath(baseRoot, baseRoot);
  await assertSafeManagedPath(baseRoot, manifestPath);
  if (agentsRoot) await assertSafeManagedPath(agentsRoot, path.join(agentsRoot, 'AGENTS.md'));
  const targets = resolveTargets(ai);
  const prior = await readManifest(manifestPath, baseRoot);
  const priorOwned = ownedPathSet(prior);
  const desiredPaths = new Set();

  const skillRoots = uniqueRoots(targets, skillRootForTarget);
  const globalManifest = scope === 'project' && globalSkillRootForTarget
    ? await readManifest(globalManifestPath(homeRoot), homeRoot)
    : null;
  const globalOwned = ownedPathSet(globalManifest);
  const globalSatisfaction = [];
  const installedSkillIds = new Set();
  const globallySatisfiedSkillIds = new Set();
  let skippedDuplicates = 0;
  const skillDestinations = [];

  for (const skillId of skillIds) {
    if (!(await exists(path.join(packageRoot, 'skills', skillId, 'SKILL.md')))) throw new Error(`Skill asset not found: ${skillId}`);
  }

  for (const { root, target } of skillRoots) {
    for (const skillId of skillIds) {
      const destination = path.join(root, skillId);
      await assertSafeManagedPath(baseRoot, destination, managedRoots);
      const relative = manifestPathFor(baseRoot, destination);
      const destinationExists = await exists(destination);
      const globalPath = globalSkillRootForTarget ? path.join(globalSkillRootForTarget(target), skillId) : null;
      if (globalPath) await assertSafeManagedPath(homeRoot, globalPath);
      const globalRelative = globalPath ? manifestPathFor(homeRoot, globalPath) : null;
      const globalAvailable = Boolean(globalPath && globalOwned.has(globalRelative) && await exists(globalPath));
      if (scope === 'project' && globalAvailable && !destinationExists) {
        skippedDuplicates += 1;
        globallySatisfiedSkillIds.add(skillId);
        globalSatisfaction.push({ skill: skillId, target, path: globalRelative });
      } else {
        desiredPaths.add(relative);
        skillDestinations.push({ destination, skillId });
      }
    }
  }
  if (targets.includes('opencode')) {
    const root = commandRoot();
    for (const name of commandNames) {
      const destination = path.join(root, `${name}.md`);
      await assertSafeManagedPath(baseRoot, destination, managedRoots);
      desiredPaths.add(manifestPathFor(baseRoot, destination));
    }
  }

  const staleTargets = [];
  for (const entry of prior?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (target && !desiredPaths.has(entry.path)) {
      await assertSafeManagedPath(baseRoot, target, managedRoots);
      staleTargets.push(target);
    }
  }
  for (const target of staleTargets) await rm(target, { recursive: true, force: true });

  const files = [];
  for (const { destination, skillId } of skillDestinations) {
    const source = path.join(packageRoot, 'skills', skillId);
    await copyOwned({ baseRoot, source, destination, priorOwned, newFiles: files, managedRoots });
    installedSkillIds.add(skillId);
  }

  if (targets.includes('opencode')) {
    const root = commandRoot();
    for (const name of commandNames) {
      const source = path.join(packageRoot, 'commands', 'opencode', 'showdar', `${name}.md`);
      if (!(await exists(source))) throw new Error(`OpenCode command asset not found: ${name}`);
      await copyOwned({ baseRoot, source, destination: path.join(root, `${name}.md`), priorOwned, newFiles: files, managedRoots });
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
    satisfiedByGlobal: globalSatisfaction,
    commands: targets.includes('opencode') ? [...commandNames] : [],
    files,
  };
  await assertSafeManagedPath(baseRoot, manifestPath);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeJsonAtomic(manifestPath, manifest);
  if (agentsRoot) await writeAgentsBlock(agentsRoot, skillIds);
  const result = await inspectInstallation({
    baseRoot, manifestPath, agentsRoot, scope, homeRoot,
    globalSkillRootForTarget,
  });
  return {
    ...result,
    requestedSkills: skillIds.length,
    installedSkills: installedSkillIds.size,
    satisfiedByGlobal: globallySatisfiedSkillIds.size,
    skippedDuplicates,
  };
}

export async function initProject({ projectRoot, homeRoot = homedir(), packageRoot, profile, ai, skillIds, commandNames = [], packageVersion = '0.2.0' }) {
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
    homeRoot,
    skillRootForTarget: (target) => skillRootFor(target, projectRoot),
    globalSkillRootForTarget: (target) => globalSkillRootFor(target, { homeRoot }),
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

async function inspectInstallation({ baseRoot, manifestPath, agentsRoot, scope, managedRoots = [], homeRoot = homedir(), globalSkillRootForTarget = null }) {
  let manifest;
  try { manifest = await readManifest(manifestPath, baseRoot); }
  catch (error) { return { installed: true, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, requestedSkills: 0, installedSkills: 0, satisfiedByGlobal: 0, commands: 0, issues: [error.message], warnings: [] }; }
  if (!manifest) return { installed: false, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, requestedSkills: 0, installedSkills: 0, satisfiedByGlobal: 0, commands: 0, issues: ['Showdar is not installed.'], warnings: [] };

  const issues = [];
  const warnings = [];
  const projectOwned = ownedPathSet(manifest);
  const targets = manifest.targets?.length ? manifest.targets : manifest.ai ? resolveTargets(manifest.ai) : [];
  const skillIds = manifest.skills ?? [];
  const globalManifest = scope === 'project' && globalSkillRootForTarget
    ? await readManifest(globalManifestPath(homeRoot), homeRoot)
    : null;
  const globalOwned = ownedPathSet(globalManifest);
  const globalSatisfiedPaths = new Set();
  const installedSkillIds = new Set();
  const globallySatisfiedSkillIds = new Set();
  const recordedGlobalSkills = new Set((manifest.satisfiedByGlobal ?? []).map((entry) => entry?.skill).filter(Boolean));

  if (scope === 'project' && globalSkillRootForTarget) {
    const projectRoots = uniqueRoots(targets, (target) => skillRootFor(target, baseRoot));
    const globalRoots = uniqueRoots(targets, globalSkillRootForTarget);
    const globalSkills = new Set();
    for (const { root } of globalRoots) {
      const prefix = `${manifestPathFor(homeRoot, root)}/`;
      for (const entry of globalManifest?.files ?? []) {
        if (!entry.path.startsWith(prefix)) continue;
        const skillId = entry.path.slice(prefix.length).split('/')[0];
        if (!skillId.startsWith('showdar-')) continue;
        const globalTarget = safeOwnedPath(homeRoot, entry.path);
        if (globalTarget && globalTarget.startsWith(`${root}${path.sep}`) && globalOwned.has(entry.path)) {
          await assertSafeManagedPath(homeRoot, globalTarget);
          if (await exists(globalTarget)) globalSkills.add(skillId);
        }
      }
    }
    const extra = [...globalSkills].filter((skillId) => !skillIds.includes(skillId)).sort();
    if (extra.length) warnings.push(`Global Showdar installation exposes skills outside project profile "${manifest.profile ?? 'unknown'}": ${extra.join(', ')}. Project deduplication prevents duplicate copies but cannot hide globally installed skills. For strict project profile isolation: showdar remove --scope global`);

    for (const { root, target } of projectRoots) {
      for (const skillId of skillIds) {
        const projectPath = path.join(root, skillId);
        const projectRelative = manifestPathFor(baseRoot, projectPath);
        const projectExists = await exists(projectPath);
        const projectIsOwned = projectOwned.has(projectRelative);
        const globalPath = path.join(globalSkillRootForTarget(target), skillId);
        const globalRelative = manifestPathFor(homeRoot, globalPath);
        await assertSafeManagedPath(baseRoot, projectPath);
        await assertSafeManagedPath(homeRoot, globalPath);
        const globalExists = await exists(globalPath);
        const globalIsOwned = globalOwned.has(globalRelative);

        if (projectExists && projectIsOwned) installedSkillIds.add(skillId);
        if (projectExists && projectIsOwned && globalExists && globalIsOwned) {
          warnings.push(`Duplicate Showdar skill discovery:\n  ${skillId}\n    project: ${projectPath}\n    global: ${globalPath}\n  To prefer project isolation: showdar remove --scope global`);
        } else if (!projectExists && globalExists && globalIsOwned) {
          globalSatisfiedPaths.add(projectRelative);
          globallySatisfiedSkillIds.add(skillId);
        } else if (!projectExists && !globalExists) {
          issues.push(recordedGlobalSkills.has(skillId)
            ? `Globally satisfied skill is missing: ${skillId} (${globalPath})`
            : `Missing requested skill: ${projectPath}`);
        } else if (projectExists && !projectIsOwned) {
          issues.push(`Project skill path is not Showdar-owned: ${projectPath}`);
        } else if (globalExists && !globalIsOwned) {
          warnings.push(`Global skill path is not Showdar-owned: ${globalPath}`);
        }
      }
    }
  }

  for (const entry of manifest.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (!target) { issues.push(`Invalid managed path: ${entry.path}`); continue; }
    await assertSafeManagedPath(baseRoot, target, managedRoots);
    if (!(await exists(target))) {
      if (!globalSatisfiedPaths.has(entry.path)) issues.push(`Missing managed path: ${entry.path}`);
      continue;
    }
    const actual = await hashTree(target);
    if (actual !== entry.hash) issues.push(`Managed path drift detected: ${entry.path}`);
  }

  if (agentsRoot) {
    const agentsFile = path.join(agentsRoot, 'AGENTS.md');
    await assertSafeManagedPath(agentsRoot, agentsFile);
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
    skills: skillIds.length,
    requestedSkills: skillIds.length,
    installedSkills: scope === 'project' && globalSkillRootForTarget ? installedSkillIds.size : skillIds.length,
    satisfiedByGlobal: scope === 'project' && globalSkillRootForTarget ? globallySatisfiedSkillIds.size : 0,
    commands: (manifest.commands ?? []).length,
    issues,
    warnings,
  };
}

async function removeInstallation({ baseRoot, manifestPath, agentsRoot, managedRoots = [] }) {
  await assertSafeManagedPath(baseRoot, manifestPath);
  let manifest;
  try { manifest = await readManifest(manifestPath, baseRoot); }
  catch { manifest = null; }
  for (const entry of manifest?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (target) {
      await assertSafeManagedPath(baseRoot, target, managedRoots);
      await rm(target, { recursive: true, force: true });
    }
  }
  await assertSafeManagedPath(baseRoot, manifestPath);
  await rm(manifestPath, { force: true });
  if (agentsRoot) await removeAgentsBlock(agentsRoot);
}

export async function inspectProject(projectRoot, { homeRoot = homedir() } = {}) {
  return inspectInstallation({
    baseRoot: projectRoot,
    manifestPath: path.join(projectRoot, PROJECT_MANIFEST),
    agentsRoot: projectRoot,
    scope: 'project',
    homeRoot,
    globalSkillRootForTarget: (target) => globalSkillRootFor(target, { homeRoot }),
  });
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
