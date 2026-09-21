import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  ADAPTERS,
  NATIVE_TARGETS,
  resolveTargets,
  skillRootFor,
  globalSkillRootFor,
  commandRootFor,
  globalCommandRootForTarget,
  instructionSurfaceFor,
} from './adapters.js';
import { normalizeSkillName, ALL_SKILLS } from './catalog.js';
import { assertSafeManagedPath, lstatWithoutSymlink, safeOwnedPath } from './path-safety.js';
import { renderManagedBlock, renderShowdarCommand, renderShowdarAggregator } from './adapter-renderers.js';
import { validatePack } from './validate-pack.js';

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

function stripManagedBlock(content) {
  const start = content.indexOf(START);
  if (start === -1) return content;
  const end = content.indexOf(END, start);
  if (end === -1) throw new Error('Managed file contains an incomplete Showdar managed block. Repair it manually before continuing.');
  const before = content.slice(0, start).trimEnd();
  const after = content.slice(end + END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

async function writeManagedBlock(filePath, skillIds) {
  await assertSafeManagedPath(path.dirname(filePath), filePath);
  const current = (await exists(filePath)) ? await readFile(filePath, 'utf8') : '';
  const clean = stripManagedBlock(current).trimEnd();
  const block = renderManagedBlock(skillIds, 'block');
  await writeTextAtomic(filePath, clean ? `${clean}\n\n${block}\n` : `${block}\n`);
}

async function removeManagedBlock(filePath) {
  await assertSafeManagedPath(path.dirname(filePath), filePath);
  if (!(await exists(filePath))) return;
  const current = await readFile(filePath, 'utf8');
  const clean = stripManagedBlock(current).trim();
  if (clean) await writeTextAtomic(filePath, `${clean}\n`);
  else await rm(filePath, { force: true });
}

async function writeCursorRule(filePath, skillIds) {
  await assertSafeManagedPath(path.dirname(filePath), filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = renderManagedBlock(skillIds, 'file');
  await writeTextAtomic(filePath, content);
}

async function removeCursorRule(filePath) {
  await assertSafeManagedPath(path.dirname(filePath), filePath);
  if (!(await exists(filePath))) return;
  const current = await readFile(filePath, 'utf8');
  if (current.includes('Showdar skill and workflow routing')) {
    await rm(filePath, { force: true });
  }
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

async function generateCommandFiles({ baseRoot, skillIds, target, commandRoot, priorOwned, newFiles, managedRoots = [] }) {
  const files = [];
  for (const skillId of skillIds) {
    const shortName = skillId.replace(/^showdar-/, '');
    const destination = path.join(commandRoot, `${shortName}.md`);
    const relative = manifestPathFor(baseRoot, destination);
    if ((await exists(destination)) && !priorOwned.has(relative)) {
      throw new Error(`Refusing to overwrite existing non-Showdar-managed command: ${destination}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    const content = renderShowdarCommand(skillId);
    await writeTextAtomic(destination, content);
    newFiles.push({ path: relative, hash: await hashTree(destination) });
    files.push({ destination, skillId, shortName });
  }
  const aggregatorDest = path.join(commandRoot, 'skill.md');
  const aggregatorRel = manifestPathFor(baseRoot, aggregatorDest);
  if ((await exists(aggregatorDest)) && !priorOwned.has(aggregatorRel)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed command: ${aggregatorDest}`);
  }
  await mkdir(path.dirname(aggregatorDest), { recursive: true });
  const aggregatorContent = renderShowdarAggregator(skillIds);
  await writeTextAtomic(aggregatorDest, aggregatorContent);
  newFiles.push({ path: aggregatorRel, hash: await hashTree(aggregatorDest) });
  files.push({ destination: aggregatorDest, skillId: 'aggregator', shortName: 'skill' });
  return files;
}

async function initInstallation({
  baseRoot, manifestPath, packageRoot, profile, ai, skillIds, packageVersion = '0.2.0',
  scope, homeRoot = homedir(),
}) {
  await mkdir(baseRoot, { recursive: true });
  await assertSafeManagedPath(baseRoot, baseRoot);
  await assertSafeManagedPath(baseRoot, manifestPath);

  const targets = resolveTargets(ai);
  const prior = await readManifest(manifestPath, baseRoot);
  const priorOwned = ownedPathSet(prior);
  const desiredPaths = new Set();

  const skillRoots = uniqueRoots(targets, (t) => scope === 'project' ? skillRootFor(t, baseRoot) : globalSkillRootFor(t, { homeRoot }));
  const globalManifest = scope === 'project' ? await readManifest(globalManifestPath(homeRoot), homeRoot) : null;
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
      await assertSafeManagedPath(baseRoot, destination);
      const relative = manifestPathFor(baseRoot, destination);
      const destinationExists = await exists(destination);
      const globalPath = path.join(globalSkillRootFor(target, { homeRoot }), skillId);
      await assertSafeManagedPath(homeRoot, globalPath);
      const globalRelative = manifestPathFor(homeRoot, globalPath);
      const globalAvailable = Boolean(globalOwned.has(globalRelative) && await exists(globalPath));
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

  const managedRoots = scope === 'global'
    ? [...new Set([
        ...NATIVE_TARGETS.map((t) => globalSkillRootFor(t, { homeRoot })),
        ...NATIVE_TARGETS.filter((t) => globalCommandRootForTarget(t, { homeRoot })).map((t) => globalCommandRootForTarget(t, { homeRoot })),
      ])]
    : [];
  const commandHarnesses = [];
  for (const target of targets) {
    const adapter = ADAPTERS[target];
    if (adapter?.commands?.destination) {
      const root = scope === 'project' ? commandRootFor(target, baseRoot) : globalCommandRootForTarget(target, { homeRoot });
      if (root) {
        for (const skillId of skillIds) {
          const shortName = skillId.replace(/^showdar-/, '');
          desiredPaths.add(manifestPathFor(baseRoot, path.join(root, `${shortName}.md`)));
        }
        desiredPaths.add(manifestPathFor(baseRoot, path.join(root, 'skill.md')));
        commandHarnesses.push({ target, root });
      }
    }
  }

  const staleTargets = [];
  for (const entry of prior?.files ?? []) {
    const targetPath = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (targetPath && !desiredPaths.has(entry.path)) {
      await assertSafeManagedPath(baseRoot, targetPath, managedRoots);
      staleTargets.push(targetPath);
    }
  }
  for (const stale of staleTargets) await rm(stale, { recursive: true, force: true });

  const files = [];
  for (const { destination, skillId } of skillDestinations) {
    const source = path.join(packageRoot, 'skills', skillId);
    await copyOwned({ baseRoot, source, destination, priorOwned, newFiles: files, managedRoots });
    installedSkillIds.add(skillId);
  }

  const commandsGenerated = [];
  for (const { target, root } of commandHarnesses) {
    const generated = await generateCommandFiles({
      baseRoot,
      skillIds,
      target,
      commandRoot: root,
      priorOwned,
      newFiles: files,
      managedRoots,
    });
    commandsGenerated.push(...generated.map((g) => ({ ...g, target })));
  }

  // --ai all is a compatibility aggregate: write ONLY the canonical AGENTS.md
  // managed block. Explicit --ai claude / --ai cursor remain native-optimal.
  const instructionTarget = scope === 'project'
    ? (ai === 'all' ? 'universal' : targets[0])
    : null;
  const instructionFile = instructionTarget
    ? instructionSurfaceFor(instructionTarget, baseRoot)
    : null;

  const manifest = {
    version: 2,
    scope,
    packageVersion,
    profile,
    ai,
    targets,
    skills: [...skillIds],
    satisfiedByGlobal: globalSatisfaction,
    commands: commandsGenerated.map((c) => ({ target: c.target, name: c.shortName, path: manifestPathFor(baseRoot, c.destination) })),
    files,
    instructions: instructionFile ? { file: instructionFile.file, kind: instructionFile.kind } : null,
    commandHarness: commandHarnesses.map((c) => c.target),
  };

  await assertSafeManagedPath(baseRoot, manifestPath);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeJsonAtomic(manifestPath, manifest);

  if (scope === 'project' && prior?.instructions?.file && instructionFile?.file !== prior.instructions.file) {
    const staleInstruction = path.join(baseRoot, prior.instructions.file);
    if (prior.instructions.kind === 'block') {
      await removeManagedBlock(staleInstruction);
    } else if (prior.instructions.kind === 'file') {
      await removeCursorRule(staleInstruction);
    }
  }

  if (scope === 'project' && instructionFile) {
    if (instructionFile.kind === 'block') {
      await writeManagedBlock(instructionFile.targetPath, skillIds);
    } else if (instructionFile.kind === 'file') {
      await writeCursorRule(instructionFile.targetPath, skillIds);
    }
  }

  const result = await inspectInstallation({
    baseRoot, manifestPath, scope, homeRoot, targets: manifest.targets,
    instructionFile,
    commandHarnesses,
  });
  return {
    ...result,
    requestedSkills: skillIds.length,
    installedSkills: installedSkillIds.size,
    satisfiedByGlobal: globallySatisfiedSkillIds.size,
    skippedDuplicates,
  };
}

export async function initProject({ projectRoot, homeRoot = homedir(), packageRoot, profile, ai, skillIds, packageVersion = '0.2.0' }) {
  return initInstallation({
    baseRoot: projectRoot,
    manifestPath: path.join(projectRoot, PROJECT_MANIFEST),
    packageRoot,
    profile,
    ai,
    skillIds,
    packageVersion,
    scope: 'project',
    homeRoot,
  });
}

export async function initGlobal({ homeRoot = homedir(), packageRoot, profile, ai, skillIds, packageVersion = '0.2.0' }) {
  return initInstallation({
    baseRoot: homeRoot,
    manifestPath: globalManifestPath(homeRoot),
    packageRoot,
    profile,
    ai,
    skillIds,
    packageVersion,
    scope: 'global',
    homeRoot,
  });
}

async function inspectInstallation({
  baseRoot, manifestPath, scope, homeRoot, targets, instructionFile, commandHarnesses,
}) {
  let manifest;
  try { manifest = await readManifest(manifestPath, baseRoot); }
  catch (error) { return { installed: true, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, requestedSkills: 0, installedSkills: 0, satisfiedByGlobal: 0, commands: 0, issues: [error.message], warnings: [] }; }
  if (!manifest) return { installed: false, healthy: false, scope, profile: null, ai: null, targets: [], skills: 0, requestedSkills: 0, installedSkills: 0, satisfiedByGlobal: 0, commands: 0, issues: ['Showdar is not installed.'], warnings: [] };

  const issues = [];
  const warnings = [];
  const projectOwned = ownedPathSet(manifest);
  const effectiveTargets = manifest.targets?.length ? manifest.targets : manifest.ai ? resolveTargets(manifest.ai) : [];
  const skillIds = manifest.skills ?? [];
  const globalManifest = scope === 'project' ? await readManifest(globalManifestPath(homeRoot), homeRoot) : null;
  const globalOwned = ownedPathSet(globalManifest);
  const globalSatisfiedPaths = new Set();
  const installedSkillIds = new Set();
  const globallySatisfiedSkillIds = new Set();
  const recordedGlobalSkills = new Set((manifest.satisfiedByGlobal ?? []).map((entry) => entry?.skill).filter(Boolean));

  if (scope === 'project') {
    const projectRoots = uniqueRoots(effectiveTargets, (target) => skillRootFor(target, baseRoot));
    const globalRoots = uniqueRoots(effectiveTargets, (target) => globalSkillRootFor(target, { homeRoot }));
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
        const globalPath = path.join(globalSkillRootFor(target, { homeRoot }), skillId);
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
    const target = safeOwnedPath(baseRoot, entry.path);
    if (!target) { issues.push(`Invalid managed path: ${entry.path}`); continue; }
    await assertSafeManagedPath(baseRoot, target);
    if (!(await exists(target))) {
      if (!globalSatisfiedPaths.has(entry.path)) issues.push(`Missing managed path: ${entry.path}`);
      continue;
    }
    const actual = await hashTree(target);
    if (actual !== entry.hash) issues.push(`Managed path drift detected: ${entry.path}`);
  }

  if (scope === 'project' && instructionFile) {
    const filePath = instructionFile.targetPath ?? path.join(baseRoot, instructionFile.file);
    if (instructionFile.kind === 'block') {
      if (!(await exists(filePath))) {
        issues.push(`Missing managed instruction block: ${instructionFile.file}`);
      } else {
        const text = await readFile(filePath, 'utf8');
        if (!text.includes(START) || !text.includes(END)) {
          issues.push(`Missing Showdar managed block in ${instructionFile.file}`);
        }
      }
    } else if (instructionFile.kind === 'file') {
      if (!(await exists(filePath))) {
        issues.push(`Missing managed instruction file: ${instructionFile.file}`);
      } else {
        const text = await readFile(filePath, 'utf8');
        if (!text.includes('Showdar skill and workflow routing')) {
          issues.push(`Missing Showdar instruction content in ${instructionFile.file}`);
        }
      }
    }
  }

  if (manifest.commandHarness?.length) {
    for (const harness of manifest.commandHarness) {
      const commandRoot = scope === 'project' ? commandRootFor(harness, baseRoot) : globalCommandRootForTarget(harness, { homeRoot });
      if (!commandRoot) continue;
      for (const cmd of manifest.commands ?? []) {
        if (cmd.target !== harness) continue;
        const dest = path.join(commandRoot, `${cmd.name}.md`);
        const rel = manifestPathFor(baseRoot, dest);
        const owned = projectOwned.has(rel);
        if (!(await exists(dest))) {
          if (!owned) continue;
          issues.push(`Missing generated command: ${dest}`);
        } else if (owned) {
          const actual = await hashTree(dest);
          const entry = manifest.files?.find((f) => f.path === rel);
          if (entry && actual !== entry.hash) {
            issues.push(`Generated command drift detected: ${dest}`);
          }
        }
      }
      const aggregatorDest = path.join(commandRoot, 'skill.md');
      const aggregatorRel = manifestPathFor(baseRoot, aggregatorDest);
      if (await exists(aggregatorDest)) {
        const actual = await hashTree(aggregatorDest);
        const entry = manifest.files?.find((f) => f.path === aggregatorRel);
        if (entry && actual !== entry.hash) {
          issues.push(`Generated aggregator drift detected: ${aggregatorDest}`);
        }
      }
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
    installedSkills: scope === 'project' ? installedSkillIds.size : skillIds.length,
    satisfiedByGlobal: scope === 'project' ? globallySatisfiedSkillIds.size : 0,
    commands: (manifest.commands ?? []).length,
    issues,
    warnings,
  };
}

async function removeInstallation({ baseRoot, manifestPath, scope, homeRoot = homedir() }) {
  await assertSafeManagedPath(baseRoot, manifestPath);
  let manifest;
  try { manifest = await readManifest(manifestPath, baseRoot); }
  catch { manifest = null; }
  const managedRoots = scope === 'global'
    ? [...new Set([
        ...NATIVE_TARGETS.map((t) => globalSkillRootFor(t, { homeRoot })),
        ...NATIVE_TARGETS.filter((t) => globalCommandRootForTarget(t, { homeRoot })).map((t) => globalCommandRootForTarget(t, { homeRoot })),
      ])]
    : [];

  for (const entry of manifest?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (target) {
      await assertSafeManagedPath(baseRoot, target, managedRoots);
      await rm(target, { recursive: true, force: true });
    }
  }

  if (scope === 'project' && manifest?.instructions) {
    const filePath = path.join(baseRoot, manifest.instructions.file);
    if (manifest.instructions.kind === 'block') {
      await removeManagedBlock(filePath);
    } else if (manifest.instructions.kind === 'file') {
      await removeCursorRule(filePath);
    }
  }

  await assertSafeManagedPath(baseRoot, manifestPath);
  await rm(manifestPath, { force: true });
}

export async function inspectProject(projectRoot, { homeRoot = homedir() } = {}) {
  const manifest = await readManifest(path.join(projectRoot, PROJECT_MANIFEST), projectRoot);
  const targets = manifest?.targets ?? (manifest?.ai ? resolveTargets(manifest.ai) : []);
  const instructionFile = manifest?.instructions ? { ...manifest.instructions, targetPath: path.join(projectRoot, manifest.instructions.file) } : null;
  const commandHarnesses = manifest?.commandHarness ?? [];
  return inspectInstallation({
    baseRoot: projectRoot,
    manifestPath: path.join(projectRoot, PROJECT_MANIFEST),
    scope: 'project',
    homeRoot,
    targets,
    instructionFile,
    commandHarnesses,
  });
}

export async function inspectGlobal({ homeRoot = homedir() } = {}) {
  const manifest = await readManifest(globalManifestPath(homeRoot), homeRoot);
  const targets = manifest?.targets ?? (manifest?.ai ? resolveTargets(manifest.ai) : []);
  const commandHarnesses = manifest?.commandHarness ?? [];
  return inspectInstallation({
    baseRoot: homeRoot,
    manifestPath: globalManifestPath(homeRoot),
    scope: 'global',
    homeRoot,
    targets,
    instructionFile: null,
    commandHarnesses,
  });
}

export async function addSkill({ cwd, skill, ai = null, scope = null, home = homedir(), packageRoot, packageVersion = '0.2.0' }) {
  const skillId = normalizeSkillName(skill);
  const baseRoot = scope === 'global' ? home : cwd;

  const existingManifest = scope === 'global'
    ? await readManifest(globalManifestPath(home), home)
    : await readManifest(path.join(cwd, PROJECT_MANIFEST), cwd);

  const effectiveAi = ai ?? existingManifest?.ai ?? 'universal';
  const effectiveScope = scope ?? existingManifest?.scope ?? 'project';
  if (!NATIVE_TARGETS.includes(effectiveAi)) throw new Error(`Unknown AI target "${effectiveAi}".`);
  if (effectiveScope !== 'project' && effectiveScope !== 'global') throw new Error(`Unknown scope "${effectiveScope}".`);

  if (existingManifest?.skills?.includes(skillId)) {
    return { skill: skillId, root: '', destination: '', added: false, scope: effectiveScope, ai: effectiveAi, profile: existingManifest.profile };
  }

  const root = effectiveScope === 'global'
    ? globalSkillRootFor(effectiveAi, { homeRoot: home })
    : skillRootFor(effectiveAi, cwd);
  const destination = path.join(root, skillId);
  const managedRoots = effectiveScope === 'global'
    ? [...new Set([
        ...NATIVE_TARGETS.map((t) => globalSkillRootFor(t, { homeRoot: home })),
        ...NATIVE_TARGETS.filter((t) => globalCommandRootForTarget(t, { homeRoot: home })).map((t) => globalCommandRootForTarget(t, { homeRoot: home })),
      ])]
    : [];
  const manifestPath = effectiveScope === 'global' ? globalManifestPath(home) : path.join(cwd, PROJECT_MANIFEST);

  const source = path.join(packageRoot, 'skills', skillId);
  if (!(await exists(path.join(source, 'SKILL.md')))) throw new Error(`Packaged skill source missing: ${skillId}`);

  await mkdir(baseRoot, { recursive: true });
  const priorOwned = ownedPathSet(existingManifest);
  const relative = manifestPathFor(baseRoot, destination);
  const existed = await exists(destination);
  const alreadyTracked = priorOwned.has(relative);

  const files = [];
  await copyOwned({ baseRoot, source, destination, priorOwned, newFiles: files, managedRoots });

  const targets = [effectiveAi];
  const commandHarnesses = [];
  for (const target of targets) {
    const adapter = ADAPTERS[target];
    if (adapter?.commands?.destination) {
      if (effectiveScope === 'project') {
        commandHarnesses.push({ target, root: commandRootFor(target, cwd) });
      } else {
        const globalRoot = globalCommandRootForTarget(target, { homeRoot: home });
        if (globalRoot) commandHarnesses.push({ target, root: globalRoot });
      }
    }
  }

  const newCommands = [];
  for (const { target, root } of commandHarnesses) {
    const shortName = skillId.replace(/^showdar-/, '');
    const dest = path.join(root, `${shortName}.md`);
    const rel = manifestPathFor(baseRoot, dest);
    if ((await exists(dest)) && !priorOwned.has(rel)) {
      throw new Error(`Refusing to overwrite existing non-Showdar-managed command: ${dest}`);
    }
    await mkdir(path.dirname(dest), { recursive: true });
    const content = renderShowdarCommand(skillId);
    await writeTextAtomic(dest, content);
    files.push({ path: rel, hash: await hashTree(dest) });
    newCommands.push({ target, name: shortName, path: rel });
  }

  if (commandHarnesses.length > 0) {
    for (const { target, root } of commandHarnesses) {
      const aggregatorDest = path.join(root, 'skill.md');
      const aggregatorRel = manifestPathFor(baseRoot, aggregatorDest);
      const addAllSkillIds = [...new Set([...(existingManifest?.skills ?? []), skillId])];
      const aggregatorContent = renderShowdarAggregator(addAllSkillIds);
      if ((await exists(aggregatorDest)) && !priorOwned.has(aggregatorRel)) {
        throw new Error(`Refusing to overwrite existing non-Showdar-managed command: ${aggregatorDest}`);
      }
      await mkdir(path.dirname(aggregatorDest), { recursive: true });
      await writeTextAtomic(aggregatorDest, aggregatorContent);
      files.push({ path: aggregatorRel, hash: await hashTree(aggregatorDest) });
      newCommands.push({ target, name: 'skill', path: aggregatorRel });
    }
  }

  const merged = new Map((existingManifest?.files ?? []).map((e) => [e.path, e]));
  for (const f of files) merged.set(f.path, f);

  const allSkillIds = [...new Set([...(existingManifest?.skills ?? []), skillId])];
  const instructionFile = existingManifest?.instructions ?? (effectiveScope === 'project' ? instructionSurfaceFor(effectiveAi, cwd) : null);
  const commandHarness = [...new Set([...(existingManifest?.commandHarness ?? []), ...commandHarnesses.map((c) => c.target)])];

  const manifest = {
    version: existingManifest?.version ?? 2,
    scope: effectiveScope,
    packageVersion,
    profile: existingManifest?.profile ?? null,
    ai: effectiveAi,
    targets,
    skills: allSkillIds,
    satisfiedByGlobal: existingManifest?.satisfiedByGlobal ?? [],
    commands: [...(existingManifest?.commands ?? []), ...newCommands],
    files: [...merged.values()],
    instructions: instructionFile ? { file: instructionFile.file, kind: instructionFile.kind } : null,
    commandHarness,
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeJsonAtomic(manifestPath, manifest);

  if (effectiveScope === 'project' && instructionFile) {
    if (instructionFile.kind === 'block') {
      await writeManagedBlock(path.join(cwd, instructionFile.file), allSkillIds);
    } else if (instructionFile.kind === 'file') {
      await writeCursorRule(path.join(cwd, instructionFile.file), allSkillIds);
    }
  }

  return { skill: skillId, root, destination, added: !alreadyTracked || !existed, scope: effectiveScope, ai: effectiveAi, profile: manifest.profile };
}

export async function removeProject(projectRoot) {
  await removeInstallation({ baseRoot: projectRoot, manifestPath: path.join(projectRoot, PROJECT_MANIFEST), scope: 'project' });
}

export async function removeGlobal({ homeRoot = homedir() } = {}) {
  await removeInstallation({ baseRoot: homeRoot, manifestPath: globalManifestPath(homeRoot), scope: 'global', homeRoot });
}

export const EXTENSION_DIR = '.showdar/extensions';
export const OVERRIDES_FILE = '.showdar/overrides.json';
const SHA_HEX_RE = /^[a-f0-9]{64}$/;
const REMOTE_SOURCE_RE = /^(https?:\/\/|git:\/\/|ssh:\/\/|git\+|github:|npm:)/i;
const SCP_LIKE_RE = /^[^/:@\s]+@[^:\s]+:/;

function rejectRemoteSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Extension source must be a non-empty local path.');
  const value = source.trim();
  if (REMOTE_SOURCE_RE.test(value) || SCP_LIKE_RE.test(value) || value.includes('://')) {
    throw new Error(`Remote extension sources are not supported in 0.8: ${source}`);
  }
  if (value.endsWith('.tgz') || value.endsWith('.tar.gz') || value.endsWith('.tar')) {
    throw new Error(`Tarball pack sources are not supported in this build (no safe extractor available): ${source}`);
  }
  return value;
}

export async function resolvePackSource({ cwd, source }) {
  const value = rejectRemoteSource(source);
  const resolved = path.resolve(cwd, value);
  const info = await lstatWithoutSymlink(resolved).catch(() => null);
  if (!info || !info.isDirectory()) throw new Error(`Pack source is not a local directory: ${source}`);
  return resolved;
}

async function readPackManifest(packRoot) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(packRoot, 'pack.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Invalid pack manifest: ${error.message}`);
  }
  return manifest;
}

async function buildPackFileList(packRoot, manifest) {
  const files = [{ source: path.join(packRoot, 'pack.json'), relative: 'pack.json' }];
  for (const skill of manifest.skills ?? []) {
    const skillDir = path.join(packRoot, skill.path);
    const entries = await readdir(skillDir, { recursive: true, withFileTypes: true }).catch(() => {
      throw new Error(`Pack skill path unreadable: ${skill.id} -> ${skill.path}`);
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath ?? skillDir, entry.name);
      files.push({ source: full, relative: path.relative(packRoot, full).replaceAll(path.sep, '/') });
    }
  }
  for (const workflow of manifest.workflows ?? []) {
    files.push({ source: path.join(packRoot, workflow.path), relative: workflow.path.replaceAll(path.sep, '/') });
  }
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.relative)) throw new Error(`Pack contains duplicate logical path: ${file.relative}`);
    seen.add(file.relative);
  }
  return [...seen].sort().map((relative) => files.find((f) => f.relative === relative));
}

export async function addPack({ cwd, source, home = homedir(), packageVersion = '0.7.0' }) {
  const packRoot = await resolvePackSource({ cwd, source });
  const manifest = await readPackManifest(packRoot);
  const validation = await validatePack(packRoot);
  if (!validation.ok) throw new Error(`Invalid pack: ${validation.errors.join('; ')}`);
  const manifestPath = path.join(cwd, PROJECT_MANIFEST);
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) throw new Error('Showdar is not installed in project scope. Run "showdar init" first.');
  const installed = new Map((existing.extensions?.packs ?? []).map((p) => [p.name, p]));
  if (installed.has(manifest.name)) throw new Error(`Pack already installed: ${manifest.name}. Remove it first (showdar remove-pack).`);
  const packHash = await hashTree(packRoot);
  const fileList = await buildPackFileList(packRoot, manifest);
  const priorOwned = ownedPathSet(existing);
  const newFiles = [];
  const destination = path.join(cwd, EXTENSION_DIR, 'packs', manifest.name);
  for (const file of fileList) {
    await assertSafeManagedPath(packRoot, file.source);
    const dest = path.join(destination, file.relative);
    await assertSafeManagedPath(cwd, dest);
    const relative = manifestPathFor(cwd, dest);
    if ((await exists(dest)) && !priorOwned.has(relative)) {
      throw new Error(`Refusing to overwrite existing non-Showdar-managed file: ${dest}`);
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file.source, dest, { recursive: false });
    newFiles.push({ path: relative, hash: await hashTree(dest), extension: true });
  }
  const merged = new Map((existing.files ?? []).map((e) => [e.path, e]));
  for (const file of newFiles) merged.set(file.path, file);
  const updated = {
    ...existing,
    files: [...merged.values()],
    extensions: {
      ...(existing.extensions ?? {}),
      packs: [...(existing.extensions?.packs ?? []), {
        name: manifest.name,
        version: manifest.version,
        source: path.relative(cwd, packRoot).replaceAll(path.sep, '/'),
        hash: packHash,
        installedAt: new Date().toISOString(),
      }],
      customWorkflows: [...(existing.extensions?.customWorkflows ?? []), ...((manifest.workflows ?? []).map((w) => ({
        id: w.id,
        source: `pack:${manifest.name}`,
        path: `${EXTENSION_DIR}/packs/${manifest.name}/${w.path}`.replaceAll(path.sep, '/'),
      })))],
    },
  };
  await writeJsonAtomic(manifestPath, updated);
  return { pack: manifest.name, version: manifest.version, hash: packHash, files: newFiles.length, destination };
}

export async function removePack({ cwd, name }) {
  if (typeof name !== 'string' || !name.trim() || name.includes('/') || name.includes('..')) {
    throw new Error(`Invalid pack name: ${JSON.stringify(name)}`);
  }
  const manifestPath = path.join(cwd, PROJECT_MANIFEST);
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) throw new Error('Showdar is not installed in project scope.');
  const packs = existing.extensions?.packs ?? [];
  if (!packs.some((p) => p.name === name)) throw new Error(`Pack not installed: ${name}`);
  const owned = ownedPathSet(existing);
  const prefix = `${EXTENSION_DIR}/packs/${name}/`;
  const remaining = [];
  for (const entry of existing.files ?? []) {
    if (!entry.path.startsWith(prefix)) { remaining.push(entry); continue; }
    const target = safeOwnedPath(cwd, entry.path);
    if (!target || !owned.has(entry.path)) throw new Error(`Refusing to remove non-Showdar-managed path: ${entry.path}`);
    await assertSafeManagedPath(cwd, target);
    await rm(target, { recursive: true, force: true });
  }
  const packDir = path.join(cwd, EXTENSION_DIR, 'packs', name);
  await rm(packDir, { recursive: true, force: true }).catch(() => {});
  const updated = {
    ...existing,
    files: remaining,
    extensions: {
      ...(existing.extensions ?? {}),
      packs: packs.filter((p) => p.name !== name),
      customWorkflows: (existing.extensions?.customWorkflows ?? []).filter((w) => w.source !== `pack:${name}` && !w.path.startsWith(prefix)),
    },
  };
  await writeJsonAtomic(manifestPath, updated);
  return { pack: name, removed: true };
}

export async function addWorkflow({ cwd, source }) {
  const value = rejectRemoteSource(source);
  const resolved = path.resolve(cwd, value);
  await lstatWithoutSymlink(resolved);
  let doc;
  try {
    doc = JSON.parse(await readFile(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid workflow file: ${error.message}`);
  }
  const { validateCustomWorkflowDoc, validateCustomWorkflowId, containsForbiddenAuthorityKey } = await import('./validate-pack.js');
  if (!validateCustomWorkflowId(doc.id)) throw new Error(`Workflow id must use custom namespace grammar (vendor-name, never showdar-*): ${JSON.stringify(doc.id)}`);
  const errors = validateCustomWorkflowDoc(doc, 'workflow');
  if (errors.length) throw new Error(`Invalid custom workflow: ${errors.join('; ')}`);
  const authorityHit = containsForbiddenAuthorityKey(doc);
  if (authorityHit) throw new Error(`Custom workflow contains forbidden authority key at ${authorityHit}`);
  const manifestPath = path.join(cwd, PROJECT_MANIFEST);
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) throw new Error('Showdar is not installed in project scope. Run "showdar init" first.');
  const known = new Set([...(existing.extensions?.customWorkflows ?? []).map((w) => w.id), ...((existing.extensions?.packs ?? []).flatMap(() => []))]);
  if (known.has(doc.id)) throw new Error(`Workflow already installed: ${doc.id}`);
  const priorOwned = ownedPathSet(existing);
  const destination = path.join(cwd, EXTENSION_DIR, 'workflows', `${doc.id}.json`);
  await assertSafeManagedPath(cwd, destination);
  const relative = manifestPathFor(cwd, destination);
  if ((await exists(destination)) && !priorOwned.has(relative)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed file: ${destination}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(resolved, destination);
  const newFile = { path: relative, hash: await hashTree(destination), extension: true };
  const merged = new Map((existing.files ?? []).map((e) => [e.path, e]));
  merged.set(newFile.path, newFile);
  const updated = {
    ...existing,
    files: [...merged.values()],
    extensions: {
      ...(existing.extensions ?? {}),
      customWorkflows: [...(existing.extensions?.customWorkflows ?? []), {
        id: doc.id,
        source: 'standalone',
        path: relative,
      }],
    },
  };
  await writeJsonAtomic(manifestPath, updated);
  return { workflow: doc.id, destination, path: relative };
}

export async function listExtensions({ cwd }) {
  const manifestPath = path.join(cwd, PROJECT_MANIFEST);
  const manifest = await readManifest(manifestPath, cwd);
  if (!manifest) throw new Error('Showdar is not installed in project scope.');
  const overridesPath = path.join(cwd, OVERRIDES_FILE);
  const overridesPresent = await exists(overridesPath);
  let overridesStatus = 'absent';
  if (overridesPresent) {
    try {
      const { validateProjectOverridesDoc } = await import('./validate-pack.js');
      const doc = JSON.parse(await readFile(overridesPath, 'utf8'));
      const result = validateProjectOverridesDoc(doc);
      overridesStatus = result.ok ? 'valid' : `invalid: ${result.errors.join('; ')}`;
    } catch (error) {
      overridesStatus = `invalid: ${error.message}`;
    }
  }
  return {
    packs: (manifest.extensions?.packs ?? []).map((p) => ({ name: p.name, version: p.version, hash: p.hash })),
    customWorkflows: (manifest.extensions?.customWorkflows ?? []).map((w) => ({ id: w.id, source: w.source, path: w.path })),
    overrides: { present: overridesPresent, status: overridesStatus },
  };
}

export async function readProjectOverrides({ cwd }) {
  const overridesPath = path.join(cwd, OVERRIDES_FILE);
  if (!(await exists(overridesPath))) return null;
  await assertSafeManagedPath(cwd, overridesPath);
  let doc;
  try {
    doc = JSON.parse(await readFile(overridesPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid project overrides file: ${error.message}`);
  }
  const { validateProjectOverridesDoc } = await import('./validate-pack.js');
  const result = validateProjectOverridesDoc(doc);
  if (!result.ok) throw new Error(`Invalid project overrides file: ${result.errors.join('; ')}`);
  return doc;
}

export { SHA_HEX_RE };