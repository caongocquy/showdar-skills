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
export { assertSafeManagedPath, lstatWithoutSymlink, safeOwnedPath } from './path-safety.js';
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

export async function writeJsonAtomic(target, value) {
  await writeTextAtomic(target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextAtomic(target, value) {
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

export function ownedPathSet(manifest) {
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

export function manifestPathFor(baseRoot, destination) {
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
    await assertSafeManagedPath(baseRoot, destination, managedRoots);
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
  await assertSafeManagedPath(baseRoot, aggregatorDest, managedRoots);
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

// Legacy custom commands collided with native /showdar-setup skill invocation.
// The retired skill is not a runnable alias. Delete only pristine managed copies.
function isLegacyBrainstormPath(relative) {
  return typeof relative === 'string' &&
    (/(^|\/)skills\/showdar-refine$/.test(relative) ||
      /(^|\/)commands\/showdar\/refine\.md$/.test(relative));
}

async function inspectLegacyBrainstormFiles({ baseRoot, manifest, scope, homeRoot = homedir(), managedRoots = [] }) {
  const entries = (manifest?.files ?? []).filter(entry => isLegacyBrainstormPath(entry.path));
  const results = [];
  for (const entry of entries) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (!target || !isManagedDeletionTarget(baseRoot, target, scope, homeRoot, manifest)) {
      throw new Error('Unsafe retired Showdar skill path: ' + entry.path);
    }
    await assertSafeManagedPath(baseRoot, target, managedRoots);
    if (await exists(target) && await hashTree(target) !== entry.hash) {
      throw new Error('Modified retired Showdar skill; preserve user changes before migrating: ' + entry.path);
    }
    results.push({ path: entry.path, target });
  }
  return results;
}

function migrateBrainstormSelection(ids) {
  return [...new Set(ids.map(id => id === 'showdar-refine' ? 'showdar-brainstorm' : id))];
}

function isLegacySetupCommandPath(relative) {
  return typeof relative === 'string' && /(^|\/)commands\/showdar-setup\.md$/.test(relative);
}

function effectiveScopeForManifest(scope, manifest) {
  return scope ?? manifest?.scope ?? 'project';
}

async function inspectLegacySetupCommands({ baseRoot, manifest, scope, homeRoot = homedir(), managedRoots = [] }) {
  const entries = (manifest?.files ?? []).filter(entry => isLegacySetupCommandPath(entry.path));
  const results = [];
  for (const entry of entries) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (!target || !isManagedDeletionTarget(baseRoot, target, scope, homeRoot, manifest)) {
      throw new Error('Unsafe legacy Showdar setup command path: ' + entry.path);
    }
    await assertSafeManagedPath(baseRoot, target, managedRoots);
    if (await exists(target) && await hashTree(target) !== entry.hash) {
      throw new Error('Modified legacy Showdar setup command; resolve the conflict before migrating: ' + entry.path);
    }
    results.push({ path: entry.path, target });
  }
  return results;
}

async function removeLegacySetupCommands(entries) {
  for (const entry of entries) await rm(entry.target, { force: true });
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
        ...NATIVE_TARGETS.filter((t) => globalCommandRootForTarget(t, { homeRoot })).map((t) => path.dirname(globalCommandRootForTarget(t, { homeRoot }))),
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

  // Validate instruction surfaces before removing any previously managed files.
  if (scope === 'project') {
    const nextTarget = ai === 'all' ? 'universal' : targets[0];
    const nextInstruction = instructionSurfaceFor(nextTarget, baseRoot);
    if (nextInstruction) {
      await assertSafeManagedPath(baseRoot, nextInstruction.targetPath);
      if (nextInstruction.kind === 'block' && await exists(nextInstruction.targetPath)) {
        stripManagedBlock(await readFile(nextInstruction.targetPath, 'utf8'));
      }
      if (nextInstruction.kind === 'file' && await exists(nextInstruction.targetPath) &&
          prior?.instructions?.file !== nextInstruction.file) {
        throw new Error('Refusing to overwrite existing non-Showdar-managed instruction: ' + nextInstruction.targetPath);
      }
    }
    if (prior?.instructions?.file) {
      const previous = path.resolve(baseRoot, prior.instructions.file);
      const valid = prior.instructions.kind === 'block'
        ? ['AGENTS.md', 'CLAUDE.md'].map(file => path.resolve(baseRoot, file))
        : [path.resolve(baseRoot, '.cursor/rules/showdar.mdc')];
      if (!valid.includes(previous)) throw new Error('Unsafe prior instruction path: ' + prior.instructions.file);
      await assertSafeManagedPath(baseRoot, previous);
      if (prior.instructions.kind === 'block' && await exists(previous)) {
        stripManagedBlock(await readFile(previous, 'utf8'));
      }
    }
  }

  const staleTargets = [];
  for (const entry of prior?.files ?? []) {
    const targetPath = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (targetPath && !desiredPaths.has(entry.path)) {
      if (path.resolve(targetPath) === path.resolve(baseRoot) || !isManagedDeletionTarget(baseRoot, targetPath, scope, homeRoot, prior)) throw new Error('Unsafe stale managed path: ' + entry.path);
      await assertSafeManagedPath(baseRoot, targetPath, managedRoots);
      if (isLegacySetupCommandPath(entry.path) && await exists(targetPath) && await hashTree(targetPath) !== entry.hash) {
        throw new Error('Modified legacy Showdar setup command; resolve the conflict before migrating: ' + entry.path);
      }
      if (isLegacyBrainstormPath(entry.path) && await exists(targetPath) && await hashTree(targetPath) !== entry.hash) {
        throw new Error('Modified retired Showdar skill; preserve user changes before migrating: ' + entry.path);
      }
      staleTargets.push(targetPath);
    }
  }
  // Preflight all destinations before deleting the previous installation.
  for (const { destination } of skillDestinations) {
    await assertSafeManagedPath(baseRoot, destination, managedRoots);
    const rel = manifestPathFor(baseRoot, destination);
    if ((await exists(destination)) && !priorOwned.has(rel)) throw new Error('Refusing to overwrite existing non-Showdar-managed skill or command: ' + destination);
  }
  for (const { root } of commandHarnesses) {
    for (const filename of [...skillIds.map(id => id.replace(/^showdar-/, '') + '.md'), 'skill.md']) {
      const dest = path.join(root, filename);
      await assertSafeManagedPath(baseRoot, dest, managedRoots);
      if ((await exists(dest)) && !priorOwned.has(manifestPathFor(baseRoot, dest))) throw new Error('Foreign command destination: ' + dest);
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
        const dest = cmd.name === 'showdar-setup' ? path.join(path.dirname(commandRoot), 'showdar-setup.md') : path.join(commandRoot, `${cmd.name}.md`);
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

function isManagedDeletionTarget(baseRoot, target, scope, homeRoot, manifest) {
  const absolute = path.resolve(target);
  const installedSkills = new Set(manifest?.skills ?? []);
  const targets = scope === 'global' ? NATIVE_TARGETS : (manifest?.targets ?? resolveTargets(manifest?.ai ?? 'universal'));
  for (const agent of targets) {
    const skillRoot = scope === 'global'
      ? globalSkillRootFor(agent, { homeRoot })
      : skillRootFor(agent, baseRoot);
    const skillName = path.relative(skillRoot, absolute);
    if (!skillName.includes(path.sep) && installedSkills.has(skillName) && skillName.startsWith('showdar-')) return true;

    const commandsRoot = scope === 'global'
      ? globalCommandRootForTarget(agent, { homeRoot })
      : commandRootFor(agent, baseRoot);
    if (commandsRoot) {
      const commandName = path.relative(commandsRoot, absolute);
      const supported = new Set(['skill.md', ...[...installedSkills].map(id => id.replace(/^showdar-/, '') + '.md')]);
      if (!commandName.includes(path.sep) && supported.has(commandName)) return true;
      if (absolute === path.resolve(path.dirname(commandsRoot), 'showdar-setup.md')) return true;
    }
    if (agent === 'cursor' && absolute === path.resolve(
      scope === 'global' ? homeRoot : baseRoot, '.cursor', 'commands', 'showdar-setup.md')) return true;
    if (agent === 'cursor' && absolute === path.resolve(
      scope === 'global' ? homeRoot : baseRoot, '.cursor', 'rules', 'showdar.mdc')) return true;
  }
  const packRoot = path.resolve(baseRoot, EXTENSION_DIR, 'packs');
  for (const pack of manifest?.extensions?.packs ?? []) {
    if (typeof pack.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(pack.name)) continue;
    const ownedPackRoot = path.resolve(packRoot, pack.name);
    if (absolute.startsWith(ownedPackRoot + path.sep)) return true;
  }
  for (const workflow of manifest?.extensions?.customWorkflows ?? []) {
    if (workflow.source !== 'standalone' || typeof workflow.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(workflow.id)) continue;
    if (absolute === path.resolve(baseRoot, EXTENSION_DIR, 'workflows', workflow.id + '.json')) return true;
  }
  return false;
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
        ...NATIVE_TARGETS.filter((t) => globalCommandRootForTarget(t, { homeRoot })).map((t) => path.dirname(globalCommandRootForTarget(t, { homeRoot }))),
      ])]
    : [];

  const removalTargets = [];
  for (const entry of manifest?.files ?? []) {
    const target = safeOwnedPath(baseRoot, entry.path, managedRoots);
    if (!target || path.resolve(target) === path.resolve(baseRoot) || !isManagedDeletionTarget(baseRoot, target, scope, homeRoot, manifest)) {
      throw new Error('Unsafe Showdar manifest deletion path: ' + entry.path);
    }
    await assertSafeManagedPath(baseRoot, target, managedRoots);
    removalTargets.push(target);
  }
  for (const target of removalTargets) await rm(target, { recursive: true, force: true });

  if (scope === 'project' && manifest?.instructions) {
    const filePath = path.resolve(baseRoot, manifest.instructions.file);
    const expected = manifest.instructions.kind === 'block'
      ? new Set([path.join(baseRoot, 'AGENTS.md'), path.join(baseRoot, 'CLAUDE.md')])
      : new Set([path.join(baseRoot, '.cursor', 'rules', 'showdar.mdc')]);
    if (!expected.has(filePath)) throw new Error('Unsafe Showdar instruction path: ' + manifest.instructions.file);
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

  const migrationRoot = effectiveScopeForManifest(scope, existingManifest) === 'global' ? home : cwd;
  const migrationScope = effectiveScopeForManifest(scope, existingManifest);
  const legacyCommands = await inspectLegacySetupCommands({
    baseRoot: migrationRoot, manifest: existingManifest, scope: migrationScope, homeRoot: home,
    managedRoots: migrationScope === 'global'
      ? NATIVE_TARGETS.flatMap(target => {
          const root = globalCommandRootForTarget(target, { homeRoot: home });
          return root ? [root, path.dirname(root)] : [];
        })
      : [],
  });
  const migrationManagedRoots = migrationScope === 'global'
    ? [...new Set([
        ...NATIVE_TARGETS.map(t => globalSkillRootFor(t, { homeRoot: home })),
        ...NATIVE_TARGETS.filter(t => globalCommandRootForTarget(t, { homeRoot: home })).map(t => globalCommandRootForTarget(t, { homeRoot: home })),
      ])]
    : [];
  // On explicit add brainstorm, migrate preexisting CLI-owned v0.16 skill/commands;
  // other adds leave the old managed selection until an explicit profile upgrade.
  const migratingBrainstorm = skillId === 'showdar-brainstorm' && existingManifest?.skills?.includes('showdar-refine');
  const retiredFiles = migratingBrainstorm
    ? await inspectLegacyBrainstormFiles({ baseRoot: migrationRoot, manifest: existingManifest, scope: migrationScope, homeRoot: home, managedRoots: migrationManagedRoots })
    : [];
  const retiredPaths = new Set(retiredFiles.map(entry => entry.path));
  const removedPaths = new Set([...legacyPaths, ...retiredPaths]);
  const migratedSkills = migratingBrainstorm
    ? migrateBrainstormSelection(existingManifest.skills)
    : existingManifest?.skills ?? [];
  const effectiveAi = ai ?? existingManifest?.ai ?? 'universal';
  const effectiveScope = scope ?? existingManifest?.scope ?? 'project';
  if (effectiveAi !== 'all' && !NATIVE_TARGETS.includes(effectiveAi)) throw new Error(`Unknown AI target "${effectiveAi}".`);
  if (effectiveScope !== 'project' && effectiveScope !== 'global') throw new Error(`Unknown scope "${effectiveScope}".`);

  if (existingManifest?.skills?.includes(skillId) &&
      resolveTargets(effectiveAi).every(target => (existingManifest.targets ?? []).includes(target))) {
    const refreshedFiles = [];
    const priorOwned = ownedPathSet(existingManifest);
    const source = path.join(packageRoot, 'skills', skillId);
    if (!(await exists(path.join(source, 'SKILL.md')))) throw new Error(`Packaged skill source missing: ${skillId}`);

    // Refresh all still-managed native copies, not only generated instructions.
    // Preflight every destination before changing any of them.
    const roots = [...new Set((existingManifest.targets ?? [effectiveAi]).map(target =>
      effectiveScope === 'global'
        ? globalSkillRootFor(target, { homeRoot: home })
        : skillRootFor(target, cwd)))];
    const destinations = [];
    for (const root of roots) {
      const destination = path.join(root, skillId);
      const relative = manifestPathFor(baseRoot, destination);
      const recorded = (existingManifest.files ?? []).find(file => file.path === relative);
      if (!recorded) continue; // A skill satisfied by global does not own a project copy.
      await assertSafeManagedPath(baseRoot, destination);
      if (!(await exists(destination))) throw new Error(`Managed skill missing; refusing partial refresh: ${relative}`);
      if (await hashTree(destination) !== recorded.hash) {
        throw new Error(`Modified Showdar-owned skill; refusing to overwrite user changes: ${relative}`);
      }
      destinations.push(destination);
    }

    for (const destination of destinations) {
      await copyOwned({ baseRoot, source, destination, priorOwned, newFiles: refreshedFiles });
    }
    for (const target of existingManifest.commandHarness ?? []) {
      const commandRoot = effectiveScope === 'global' ? globalCommandRootForTarget(target, { homeRoot: home }) : commandRootFor(target, cwd);
      if (commandRoot) await generateCommandFiles({ baseRoot, skillIds: migratedSkills, target, commandRoot, priorOwned, newFiles: refreshedFiles });
    }
    if (effectiveScope === 'project' && existingManifest.instructions) {
      const instruction = existingManifest.instructions;
      const file = path.join(cwd, instruction.file);
      if (instruction.kind === 'block') await writeManagedBlock(file, migratedSkills);
      else if (instruction.kind === 'file') await writeCursorRule(file, migratedSkills);
    }
    await removeLegacySetupCommands([...legacyCommands, ...retiredFiles]);
    const files = new Map((existingManifest.files ?? []).filter(f => !removedPaths.has(f.path)).map(f => [f.path, f]));
    for (const f of refreshedFiles) files.set(f.path, f);
    await writeJsonAtomic(effectiveScope === 'global' ? globalManifestPath(home) : path.join(cwd, PROJECT_MANIFEST),
      { ...existingManifest, packageVersion, skills: migratedSkills, commands: (existingManifest.commands ?? []).filter(c => !removedPaths.has(c.path)), files: [...files.values()] });
    return { skill: skillId, root: '', destination: '', added: false, scope: effectiveScope, ai: effectiveAi, profile: existingManifest.profile };
  }

  const targets = resolveTargets(effectiveAi);
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
  const files = [];
  const destinations = [...new Set(targets.map(target => effectiveScope === 'global'
    ? globalSkillRootFor(target, { homeRoot: home })
    : skillRootFor(target, cwd)))].map(root => path.join(root, skillId));
  const alreadyInstalled = destinations.every(destination =>
    priorOwned.has(manifestPathFor(baseRoot, destination)));

  // Inspect every target before copying anything. Never overwrite foreign skills.
  for (const destination of destinations) {
    await assertSafeManagedPath(baseRoot, destination, managedRoots);
    const relative = manifestPathFor(baseRoot, destination);
    if ((await exists(destination)) && !priorOwned.has(relative)) {
      throw new Error(`Refusing to overwrite existing non-Showdar-managed skill or command: ${destination}`);
    }
  }
  for (const destination of destinations) {
    await copyOwned({ baseRoot, source, destination, priorOwned, newFiles: files, managedRoots });
  }

  const commandHarnesses = [];
  for (const target of targets) {
    const adapter = ADAPTERS[target];
    if (adapter?.commands?.destination) {
      const root = effectiveScope === 'project'
        ? commandRootFor(target, cwd)
        : globalCommandRootForTarget(target, { homeRoot: home });
      if (root) commandHarnesses.push({ target, root });
    }
  }

  const allSkillIds = [...new Set([...migratedSkills, skillId])];
  const newCommands = [];
  const harnessTargets = [...new Set([...(existingManifest?.commandHarness ?? []), ...commandHarnesses.map(c => c.target)])];
  for (const target of harnessTargets) {
    const root = effectiveScope === 'global' ? globalCommandRootForTarget(target, { homeRoot: home }) : commandRootFor(target, cwd);
    if (!root) continue;
    const generated = await generateCommandFiles({ baseRoot, skillIds: allSkillIds, target, commandRoot: root, priorOwned, newFiles: files, managedRoots });
    newCommands.push(...generated.map(c => ({ target, name: c.shortName, path: manifestPathFor(baseRoot, c.destination) })));
  }

  await removeLegacySetupCommands([...legacyCommands, ...retiredFiles]);
  const merged = new Map((existingManifest?.files ?? []).filter(e => !removedPaths.has(e.path)).map((e) => [e.path, e]));
  for (const f of files) merged.set(f.path, f);

  const instructionFile = existingManifest?.instructions ?? (effectiveScope === 'project' ? instructionSurfaceFor(effectiveAi === 'all' ? 'universal' : effectiveAi, cwd) : null);
  const commandHarness = [...new Set([...(existingManifest?.commandHarness ?? []), ...commandHarnesses.map((c) => c.target)])];

  const manifest = {
    ...(existingManifest ?? {}),
    version: existingManifest?.version ?? 2,
    scope: effectiveScope,
    packageVersion,
    profile: existingManifest?.profile ?? null,
    ai: effectiveAi,
    targets: [...new Set([...(existingManifest?.targets ?? []), ...targets])],
    skills: allSkillIds,
    satisfiedByGlobal: existingManifest?.satisfiedByGlobal ?? [],
    commands: [...new Map([...(existingManifest?.commands ?? []).filter(c => !removedPaths.has(c.path)), ...newCommands].map(c => [c.path, c])).values()],
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

  return { skill: skillId, root: path.dirname(destinations[0]), destination: destinations[0], added: !alreadyInstalled, scope: effectiveScope, ai: effectiveAi, profile: manifest.profile };
}


/**
 * Additive profile/workflow member install. Existing project profile and any
 * extra extension metadata are preserved. Requested members are deduplicated.
 * Each member uses the standard single-skill installer and remains rerunnable.
 */
export async function addSkills({ cwd, skills, ai = null, scope = null, home = homedir(), packageRoot, packageVersion = '0.2.0' }) {
  if (!Array.isArray(skills) || !skills.length) throw new Error('At least one skill is required.');
  const skillIds = [...new Set(skills.map(normalizeSkillName))];
  const baseRoot = scope === 'global' ? home : cwd;
  const manifestPath = scope === 'global' ? globalManifestPath(home) : path.join(cwd, PROJECT_MANIFEST);
  const existing = await readManifest(manifestPath, baseRoot);
  const effectiveAi = ai ?? existing?.ai ?? 'universal';
  const targets = resolveTargets(effectiveAi);
  const owned = ownedPathSet(existing);
  const managedRoots = scope === 'global'
    ? [...new Set(NATIVE_TARGETS.map(target => globalSkillRootFor(target, { homeRoot: home })))]
    : [];
  // Preflight packaged inputs and all requested target paths before writing.
  for (const skillId of skillIds) {
    const source = path.join(packageRoot, 'skills', skillId, 'SKILL.md');
    if (!(await exists(source))) throw new Error(`Packaged skill source missing: ${skillId}`);
    for (const target of targets) {
      const skillRoot = scope === 'global'
        ? globalSkillRootFor(target, { homeRoot: home })
        : skillRootFor(target, cwd);
      const destination = path.join(skillRoot, skillId);
      await assertSafeManagedPath(baseRoot, destination, managedRoots);
      const relative = manifestPathFor(baseRoot, destination);
      if ((await exists(destination)) && !owned.has(relative)) {
        throw new Error(`Refusing to overwrite existing non-Showdar-managed skill or command: ${destination}`);
      }
    }
  }
  const installed = [];
  for (const skill of skillIds) {
    installed.push(await addSkill({ cwd, skill, ai, scope, home, packageRoot, packageVersion }));
  }
  return {
    skills: skillIds,
    added: installed.filter(entry => entry.added).length,
    alreadyInstalled: installed.filter(entry => !entry.added).length,
    profile: installed.at(-1)?.profile ?? existing?.profile ?? null,
    ai: installed.at(-1)?.ai ?? effectiveAi,
    scope: installed.at(-1)?.scope ?? scope ?? existing?.scope ?? 'project',
  };
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
        installedHash: await hashTree(destination),
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

export async function validatePackSource({ cwd, source }) {
  const { validatePack } = await import('./validate-pack.js');
  const packRoot = path.resolve(cwd, source);
  return validatePack(packRoot);
}

export async function createPack({ cwd, path: packPath, vendor, description, withWorkflow, withProfile }) {
  const { createPackScaffold } = await import('./pack-scaffold.js');
  const absolutePath = path.resolve(cwd, packPath);
  const name = path.basename(absolutePath);
  return createPackScaffold({ destination: path.dirname(absolutePath), name, vendor, description, withWorkflow, withProfile });
}

export async function inspectPack({ cwd, source }) {
  const { inspectPackSource } = await import('./pack-inspect.js');
  const packRoot = path.resolve(cwd, source);
  return inspectPackSource(packRoot);
}

export async function doctor({ cwd }) {
  const { inspectPackInstalled, inspectCustomWorkflows, inspectOverrides, listExtensionsWithDetails } = await import('./pack-inspect.js');
  const manifestPath = path.join(cwd, '.showdar.json');
  const manifest = await readManifest(manifestPath, cwd);
  if (!manifest) throw new Error('Showdar is not installed in project scope.');
  
  const packs = [];
  for (const pack of manifest.extensions?.packs ?? []) {
    const installed = await import('./pack-inspect.js').then(m => m.inspectPackInstalled(cwd, pack.name, pack));
    packs.push({ 
      name: pack.name, 
      version: pack.version, 
      hash: pack.hash, 
      drift: installed.drift, 
      driftDetails: installed.driftDetails,
      validation: installed.validation,
    });
  }
  
  const customWorkflows = await import('./pack-inspect.js').then(m => m.inspectCustomWorkflows(cwd, manifest));
  
  const overrides = await readProjectOverrides({ cwd });
  const overridesStatus = overrides ? 'valid' : 'absent';
  
  const issues = [];
  const warnings = [];
  
  for (const pack of packs) {
    if (pack.drift !== 'no-drift') {
      issues.push(`Pack ${pack.name}: ${pack.drift} - ${pack.driftDetails}`);
    }
    if (!pack.validation?.ok) {
      for (const error of pack.validation.errors ?? []) {
        issues.push(`Pack ${pack.name} validation: ${error}`);
      }
    }
  }
  
  for (const wf of customWorkflows) {
    if (!wf.valid) {
      issues.push(`Workflow ${wf.id}: ${wf.errors?.join(', ')}`);
    }
  }
  
  const healthy = issues.length === 0;
  
  return {
    healthy,
    packs,
    customWorkflows,
    overrides: { present: overridesStatus !== 'absent', status: overridesStatus },
    issues,
    warnings,
  };
}

export async function updatePack({ cwd, source, dryRun = false }) {
  const { updatePack } = await import('./pack-update.js');
  return updatePack({ cwd, source, dryRun });
}

export async function listExtensionsDetailed({ cwd }) {
  const { listExtensionsWithDetails } = await import('./pack-inspect.js');
  return listExtensionsWithDetails(cwd);
}

export { SHA_HEX_RE, hashTree, readManifest };