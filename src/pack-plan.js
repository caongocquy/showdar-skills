import path from 'node:path';
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  hashTree,
  readManifest,
  writeJsonAtomic,
  ownedPathSet,
  manifestPathFor,
  EXTENSION_DIR,
  OVERRIDES_FILE,
  lstatWithoutSymlink,
  assertSafeManagedPath,
} from './project.js';
import { validatePack } from './validate-pack.js';
import { createExtensionCatalog } from './extension-catalog.js';
import { readProjectOverrides } from './project.js';

const CLASSIFICATION_ORDER = Object.freeze([
  'installed-drift',
  'metadata',
  'ownership',
  'profile-definition',
  'reference',
  'skill-content',
  'source-only',
  'workflow-definition',
]);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    if (Array.isArray(value)) {
      for (const item of value) deepFreeze(item);
    } else {
      for (const child of Object.values(value)) deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
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

async function fileContentHash(target) {
  const bytes = await readFile(target);
  return createHash('sha256').update(bytes).digest('hex');
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
  const sorted = [...seen].sort().map((relative) => files.find((f) => f.relative === relative));
  for (const file of sorted) {
    file.hash = await fileContentHash(file.source);
  }
  return sorted;
}

function compareWorkflowDefinitions(oldManifest, newManifest) {
  const changes = [];
  const oldWorkflows = new Map((oldManifest.workflows ?? []).map((w) => [w.id, w]));
  const newWorkflows = new Map((newManifest.workflows ?? []).map((w) => [w.id, w]));
  for (const [id, oldWf] of oldWorkflows) {
    if (!newWorkflows.has(id)) {
      changes.push({ type: 'removed', workflowId: id });
      continue;
    }
    const newWf = newWorkflows.get(id);
    if (JSON.stringify(oldWf) !== JSON.stringify(newWf)) {
      changes.push({ type: 'modified', workflowId: id });
    }
  }
  for (const [id, newWf] of newWorkflows) {
    if (!oldWorkflows.has(id)) {
      changes.push({ type: 'added', workflowId: id });
    }
  }
  return changes;
}

async function computeManifestHash(manifest) {
  const relevant = {
    packs: (manifest.extensions?.packs ?? []).map((p) => ({
      name: p.name, version: p.version, source: p.source, hash: p.hash, installedHash: p.installedHash,
    })),
    customWorkflows: (manifest.extensions?.customWorkflows ?? []).map((w) => ({
      id: w.id, source: w.source, path: w.path,
    })),
  };
  const canonical = JSON.stringify(relevant, null, 2);
  return createHash('sha256').update(canonical).digest('hex');
}

async function computeOverridesHash(cwd) {
  const overridesPath = path.join(cwd, OVERRIDES_FILE);
  if (!(await exists(overridesPath))) return null;
  const bytes = await readFile(overridesPath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function computeInstalledHash(cwd, packName, manifest) {
  const packDir = path.join(cwd, EXTENSION_DIR, 'packs', packName);
  if (!(await exists(packDir))) return null;
  const owned = ownedPathSet(manifest);
  const prefix = `${EXTENSION_DIR}/packs/${packName}/`;
  const foreign = [];
  for (const entry of manifest.files ?? []) {
    if (!entry.path.startsWith(prefix)) continue;
    const target = path.join(cwd, entry.path);
    if (!(await exists(target))) return 'missing-managed-file';
  }
  const dirents = await readdir(packDir, { recursive: true, withFileTypes: true }).catch(() => null);
  if (dirents) {
    for (const entry of dirents) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath ?? packDir, entry.name);
      const logical = path.relative(packDir, full).replaceAll(path.sep, '/');
      const manifestRel = `${prefix}${logical}`;
      if (!owned.has(manifestRel)) foreign.push(logical);
    }
  }
  if (foreign.length > 0) return `foreign-files:${foreign.sort().join(',')}`;
  return hashTree(packDir);
}

function classifyChanges(oldManifest, newManifest, fileList, oldFileList, options) {
  const categories = new Set();

  if (options.installedDrift) categories.add('installed-drift');
  if (options.ownershipConflict) categories.add('ownership');

  const oldSkills = new Set((oldManifest?.skills ?? []).map((s) => s.id));
  const newSkills = new Set((newManifest.skills ?? []).map((s) => s.id));
  const oldSkillPaths = new Map((oldManifest?.skills ?? []).map((s) => [s.id, s.path]));
  const newSkillPaths = new Map((newManifest.skills ?? []).map((s) => [s.id, s.path]));

  let skillContentChanged = false;
  let skillMembershipChanged = false;
  for (const id of newSkills) {
    if (!oldSkills.has(id)) skillMembershipChanged = true;
  }
  for (const id of oldSkills) {
    if (!newSkills.has(id)) skillMembershipChanged = true;
  }
  for (const [id, oldPath] of oldSkillPaths) {
    if (newSkills.has(id) && newSkillPaths.get(id) !== oldPath) {
      skillContentChanged = true;
    }
  }
  const oldSkillFiles = new Map();
  for (const f of oldFileList ?? []) {
    if (f.relative.startsWith('skills/')) oldSkillFiles.set(f.relative, f.hash);
  }
  const newSkillFiles = new Map();
  for (const f of fileList) {
    if (f.relative.startsWith('skills/')) newSkillFiles.set(f.relative, f.hash);
  }
  for (const [rel, hash] of newSkillFiles) {
    if (oldSkillFiles.has(rel) && oldSkillFiles.get(rel) !== hash) skillContentChanged = true;
  }
  for (const rel of oldSkillFiles.keys()) {
    if (!newSkillFiles.has(rel)) skillContentChanged = true;
  }
  for (const rel of newSkillFiles.keys()) {
    if (!oldSkillFiles.has(rel)) skillContentChanged = true;
  }
  if (skillContentChanged) categories.add('skill-content');
  if (skillMembershipChanged && oldManifest && Object.keys(oldManifest).length > 0) {
    categories.add('skill-content');
  }

  const workflowChanges = compareWorkflowDefinitions(oldManifest ?? { workflows: [] }, newManifest);
  let workflowContentChanged = false;
  if (workflowChanges.length > 0) {
    workflowContentChanged = true;
  } else {
    const oldWfFiles = new Map();
    for (const f of oldFileList ?? []) {
      if (f.relative.startsWith('workflows/')) oldWfFiles.set(f.relative, f.hash);
    }
    const newWfFiles = new Map();
    for (const f of fileList) {
      if (f.relative.startsWith('workflows/')) newWfFiles.set(f.relative, f.hash);
    }
    for (const [rel, hash] of newWfFiles) {
      if (oldWfFiles.has(rel) && oldWfFiles.get(rel) !== hash) workflowContentChanged = true;
    }
    for (const rel of oldWfFiles.keys()) {
      if (!newWfFiles.has(rel)) workflowContentChanged = true;
    }
    for (const rel of newWfFiles.keys()) {
      if (!oldWfFiles.has(rel)) workflowContentChanged = true;
    }
  }
  if (workflowContentChanged) categories.add('workflow-definition');

  const oldProfiles = oldManifest?.profiles ?? {};
  const newProfiles = newManifest.profiles ?? {};
  const allProfileNames = new Set([...Object.keys(oldProfiles), ...Object.keys(newProfiles)]);
  let profileChanged = false;
  let referenceBroken = false;
  for (const name of allProfileNames) {
    const oldMembers = new Set(oldProfiles[name] ?? []);
    const newMembers = new Set(newProfiles[name] ?? []);
    if (JSON.stringify([...oldMembers].sort()) !== JSON.stringify([...newMembers].sort())) {
      profileChanged = true;
    }
    const ownedIds = new Set([...newSkills, ...newManifest.workflows?.map((w) => w.id) ?? []]);
    for (const member of newMembers) {
      if (!ownedIds.has(member)) referenceBroken = true;
    }
  }
  if (profileChanged) categories.add('profile-definition');
  if (referenceBroken) categories.add('reference');

  const oldMeta = { name: oldManifest?.name, version: oldManifest?.version, description: oldManifest?.description };
  const newMeta = { name: newManifest.name, version: newManifest.version, description: newManifest.description };
  if (JSON.stringify(oldMeta) !== JSON.stringify(newMeta)) categories.add('metadata');

  const hasSemantic = [...categories].some((c) =>
    c === 'skill-content' || c === 'workflow-definition' || c === 'profile-definition' || c === 'reference'
  );
  if (!hasSemantic && options.sourceChanged) {
    categories.add('source-only');
  }

  return CLASSIFICATION_ORDER.filter((c) => categories.has(c));
}

export async function planPackUpdate({ cwd, source }) {
  const packRoot = path.resolve(cwd, source);
  const info = await lstatWithoutSymlink(packRoot).catch(() => null);
  if (!info || !info.isDirectory()) {
    throw new Error(`Pack source is not a local directory: ${source}`);
  }

  const newManifest = await readPackManifest(packRoot);
  const validation = await validatePack(packRoot);
  if (!validation.ok) {
    return deepFreeze({
      ok: false,
      errors: validation.errors,
      candidate: { name: newManifest.name, version: newManifest.version },
    });
  }

  const manifestPath = path.join(cwd, '.showdar.json');
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) throw new Error('Showdar is not installed in project scope. Run "showdar init" first.');

  const existingPack = existing.extensions?.packs?.find((p) => p.name === newManifest.name);
  if (!existingPack) throw new Error(`Pack not installed: ${newManifest.name}. Use add-pack instead.`);

  const newPackHash = await hashTree(packRoot);
  const sameHash = newPackHash === existingPack.hash;

  const fileList = await buildPackFileList(packRoot, newManifest);
  const oldPackDir = path.join(cwd, EXTENSION_DIR, 'packs', existingPack.name);
  let oldManifest = null;
  let oldFileList = null;
  if (await exists(oldPackDir)) {
    try {
      oldManifest = await readPackManifest(oldPackDir);
      oldFileList = await buildPackFileList(oldPackDir, oldManifest);
    } catch {}
  }

  const priorOwned = ownedPathSet(existing);
  const conflicts = [];
  for (const file of fileList) {
    const dest = path.join(cwd, EXTENSION_DIR, 'packs', newManifest.name, file.relative);
    const relative = manifestPathFor(cwd, dest);
    if ((await exists(dest)) && !priorOwned.has(relative)) {
      conflicts.push({ path: file.relative, reason: 'foreign-file' });
    }
  }

  const installedHash = await computeInstalledHash(cwd, existingPack.name, existing);
  const recordedHash = existingPack.hash;
  const expectedInstalledHash = existingPack.installedHash ?? installedHash;
  const installedDrift = installedHash !== null && installedHash !== expectedInstalledHash ||
    (existing.files ?? []).some(entry => entry.path.startsWith(`${EXTENSION_DIR}/packs/${existingPack.name}/`) && !entry.hash);

  const sourceHash = newPackHash;
  const manifestHash = await computeManifestHash(existing);
  const overridesHash = await computeOverridesHash(cwd);

  const fingerprint = deepFreeze({ sourceHash, installedHash, manifestHash, overridesHash });

  const classifications = classifyChanges(oldManifest, newManifest, fileList, oldFileList, {
    installedDrift,
    ownershipConflict: conflicts.length > 0,
    sourceChanged: !sameHash,
  });

  const files = { add: 0, replace: 0, remove: 0 };
  const oldPaths = new Set((oldFileList ?? []).map((f) => f.relative));
  const newPaths = new Set(fileList.map((f) => f.relative));
  for (const f of fileList) {
    if (!oldPaths.has(f.relative)) files.add++;
    else {
      const oldF = (oldFileList ?? []).find((o) => o.relative === f.relative);
      if (oldF && oldF.hash !== f.hash) files.replace++;
    }
  }
  for (const f of oldFileList ?? []) {
    if (!newPaths.has(f.relative)) files.remove++;
  }

  const skills = { add: [], remove: [], contentChanged: [] };
  const oldSkills = new Set((oldManifest?.skills ?? []).map((s) => s.id));
  const newSkills = new Set((newManifest.skills ?? []).map((s) => s.id));
  for (const s of newManifest.skills ?? []) {
    if (!oldSkills.has(s.id)) skills.add.push(s.id);
  }
  for (const s of oldManifest?.skills ?? []) {
    if (!newSkills.has(s.id)) skills.remove.push(s.id);
  }

  const workflows = { add: [], remove: [], definitionChanged: [] };
  const wfChanges = compareWorkflowDefinitions(oldManifest ?? { workflows: [] }, newManifest);
  for (const c of wfChanges) {
    if (c.type === 'added') workflows.add.push(c.workflowId);
    else if (c.type === 'removed') workflows.remove.push(c.workflowId);
    else workflows.definitionChanged.push(c.workflowId);
  }

  const profiles = { add: [], remove: [], definitionChanged: [] };
  const oldProfiles = oldManifest?.profiles ?? {};
  const newProfiles = newManifest.profiles ?? {};
  for (const name of Object.keys(newProfiles)) {
    if (!oldProfiles[name]) profiles.add.push(name);
    else if (JSON.stringify(oldProfiles[name]) !== JSON.stringify(newProfiles[name])) profiles.definitionChanged.push(name);
  }
  for (const name of Object.keys(oldProfiles)) {
    if (!newProfiles[name]) profiles.remove.push(name);
  }

  const warnings = [];
  if (workflows.definitionChanged.length > 0) {
    warnings.push('Existing checkpoints referencing changed workflows will be revalidated on resume.');
  }

  const executable = conflicts.length === 0 && validation.ok && !installedDrift;

  return deepFreeze({
    ok: true,
    current: {
      name: existingPack.name,
      version: existingPack.version,
      hash: recordedHash,
      source: existingPack.source,
    },
    candidate: {
      name: newManifest.name,
      version: newManifest.version,
      hash: newPackHash,
      source,
    },
    identity: {
      sameName: existingPack.name === newManifest.name,
      sameVersion: existingPack.version === newManifest.version,
      sameHash,
    },
    files,
    skills,
    workflows,
    profiles,
    overrides: {
      preserved: true,
      conflicts: conflicts.map((c) => c.path),
    },
    references: { broken: [] },
    conflicts,
    warnings,
    classifications,
    installedDrift: installedDrift ? 'installed-drift' : 'none',
    executable,
    fingerprint,
    fileList,
    newManifest,
    existingManifest: existing,
    oldManifest,
  });
}

export async function verifyPlanPreconditions(plan, { cwd }) {
  if (!plan.ok) return { ok: false, reason: 'invalid-plan' };

  const fp = plan.fingerprint;
  const packRoot = path.resolve(cwd, plan.candidate.source);

  const sourceInfo = await lstatWithoutSymlink(packRoot).catch(() => null);
  if (!sourceInfo || !sourceInfo.isDirectory()) {
    return { ok: false, reason: 'source-unavailable' };
  }

  const currentSourceHash = await hashTree(packRoot);
  if (currentSourceHash !== fp.sourceHash) {
    return { ok: false, reason: 'source-changed' };
  }

  const manifestPath = path.join(cwd, '.showdar.json');
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) return { ok: false, reason: 'manifest-missing' };

  const currentManifestHash = await computeManifestHash(existing);
  if (currentManifestHash !== fp.manifestHash) {
    return { ok: false, reason: 'manifest-changed' };
  }

  const currentOverridesHash = await computeOverridesHash(cwd);
  if (currentOverridesHash !== fp.overridesHash) {
    return { ok: false, reason: 'overrides-changed' };
  }

  const currentInstalledHash = await computeInstalledHash(cwd, plan.current.name, existing);
  if (currentInstalledHash !== fp.installedHash) {
    return { ok: false, reason: 'installed-changed' };
  }

  return { ok: true };
}

export async function executePackUpdate(plan, { cwd }) {
  if (!plan.ok || !plan.executable) throw new Error('Pack update is blocked by validation, ownership conflicts, or installed drift. No files changed.');
  const verification = await verifyPlanPreconditions(plan, { cwd });
  if (!verification.ok) {
    throw new Error(`Plan is stale (${verification.reason} changed since preview). Re-run: showdar update-pack <path> --dry-run`);
  }

  if (plan.identity.sameHash) {
    return {
      pack: plan.candidate.name,
      version: plan.candidate.version,
      status: 'already-up-to-date',
      hash: plan.candidate.hash,
    };
  }

  const newManifest = plan.newManifest;
  const existing = plan.existingManifest;
  const fileList = plan.fileList;
  const priorOwned = ownedPathSet(existing);
  const manifestPath = path.join(cwd, '.showdar.json');

  const tempDir = path.join(cwd, EXTENSION_DIR, 'packs', `.${newManifest.name}.tmp-${process.pid}-${Date.now()}`);
  const destination = path.join(cwd, EXTENSION_DIR, 'packs', newManifest.name);

  const { mkdir, cp, rm, rename } = await import('node:fs/promises');
  const backupDir = path.join(cwd, EXTENSION_DIR, 'packs', `.${newManifest.name}.backup-${process.pid}-${Date.now()}`);
  let backedUp = false;
  let promoted = false;
  try {
    // Stage every candidate file without touching the installed tree.
    for (const file of fileList) {
      await assertSafeManagedPath(packRootSafe(cwd, plan.candidate.source), file.source);
      const dest = path.join(tempDir, file.relative);
      await assertSafeManagedPath(cwd, dest);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(file.source, dest, { recursive: false });
    }
    // All existing installed files must be owned and unchanged.
    const prefix = `${EXTENSION_DIR}/packs/${newManifest.name}/`;
    const oldEntries = (existing.files ?? []).filter(entry => entry.path.startsWith(prefix));
    for (const entry of oldEntries) {
      const dest = path.join(cwd, entry.path);
      await assertSafeManagedPath(cwd, dest);
      if (!(await exists(dest)) || await hashTree(dest) !== entry.hash) {
        throw new Error('Installed pack drift detected: ' + entry.path);
      }
    }
    for (const file of fileList) {
      const dest = path.join(destination, file.relative);
      await assertSafeManagedPath(cwd, dest);
      const relative = manifestPathFor(cwd, dest);
      if ((await exists(dest)) && !priorOwned.has(relative)) throw new Error('Foreign pack file: ' + relative);
    }

    const newFiles = [];
    for (const file of fileList) {
      const dest = path.join(tempDir, file.relative);
      newFiles.push({ path: manifestPathFor(cwd, path.join(destination, file.relative)),
        hash: await hashTree(dest), extension: true });
    }
    const merged = new Map((existing.files ?? []).filter(entry => !entry.path.startsWith(prefix)).map(e => [e.path, e]));
    for (const file of newFiles) merged.set(file.path, file);
    const awaitHashPlaceholder = await hashTree(tempDir);
    const updated = {
      ...existing,
      files: [...merged.values()],
      extensions: {
        ...(existing.extensions ?? {}),
        packs: (existing.extensions?.packs ?? []).map(p => p.name === newManifest.name
          ? { ...p, version: newManifest.version, hash: plan.candidate.hash, installedHash: awaitHashPlaceholder, installedAt: new Date().toISOString() }
          : p),
        customWorkflows: [
          ...(existing.extensions?.customWorkflows ?? []).filter(w => w.source !== `pack:${newManifest.name}`),
          ...(newManifest.workflows ?? []).map(w => ({
            id: w.id, source: `pack:${newManifest.name}`,
            path: `${EXTENSION_DIR}/packs/${newManifest.name}/${w.path}`.replaceAll(path.sep, '/'),
          })),
        ],
      },
    };

    if (await exists(destination)) {
      await rename(destination, backupDir);
      backedUp = true;
    }
    await rename(tempDir, destination);
    promoted = true;
    await writeJsonAtomic(manifestPath, updated);
    if (backedUp) await rm(backupDir, { recursive: true, force: true });
    return { pack: newManifest.name, version: newManifest.version, status: 'updated',
      oldHash: plan.current.hash, newHash: plan.candidate.hash, files: newFiles.length };
  } catch (error) {
    if (promoted) await rm(destination, { recursive: true, force: true }).catch(() => {});
    if (backedUp) await rename(backupDir, destination).catch(() => {});
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function packRootSafe(cwd, source) {
  return path.resolve(cwd, source);
}

export function projectPackUpdatePreview(plan) {
  if (!plan.ok) {
    return {
      schemaVersion: 1,
      command: 'update-pack',
      ok: false,
      data: null,
      warnings: [],
      errors: plan.errors.map((e) => ({ category: 'schema-invalid', code: 'SCHEMA_INVALID', message: e })),
    };
  }

  return {
    schemaVersion: 1,
    command: 'update-pack',
    ok: true,
    data: {
      pack: plan.candidate.name,
      currentVersion: plan.current.version,
      candidateVersion: plan.candidate.version,
      currentHash: plan.current.hash,
      candidateHash: plan.candidate.hash,
      hashChanged: !plan.identity.sameHash,
      changes: plan.classifications.map((category) => ({
        categories: [category],
        path: null,
        action: 'replace',
      })),
      files: plan.files,
      overrides: plan.overrides,
      installedDrift: plan.installedDrift,
      executable: plan.executable,
    },
    warnings: plan.warnings,
    errors: [],
  };
}

export function formatPlanPreviewHuman(plan) {
  if (!plan.ok) {
    return `Update preview FAILED: ${plan.errors.join('; ')}`;
  }

  const lines = [
    `Update preview for pack: ${plan.candidate.name}`,
    `Status: ${plan.identity.sameHash ? 'already-up-to-date' : 'would-update'}`,
    `Current: ${plan.current.version} (hash: ${plan.current.hash.slice(0, 12)}...)`,
    `Candidate: ${plan.candidate.version} (hash: ${plan.candidate.hash.slice(0, 12)}...)`,
    '',
    'Changes:',
  ];

  if (plan.classifications.length === 0) {
    lines.push('  (none)');
  } else {
    for (const c of plan.classifications) {
      lines.push(`  [${c}]`);
    }
  }

  lines.push('');
  lines.push(`Files: Add: ${plan.files.add}  Replace: ${plan.files.replace}  Remove: ${plan.files.remove}`);
  lines.push(`Overrides: ${plan.overrides.preserved ? 'preserved' : 'conflicts'} (${plan.overrides.conflicts.length} conflicts)`);
  lines.push(`Installed files: ${plan.installedDrift === 'none' ? 'no drift detected' : plan.installedDrift}`);
  lines.push('');
  lines.push(`Safe to execute: ${plan.executable ? 'yes' : 'no'}`);

  if (!plan.identity.sameHash) {
    lines.push('Run without --dry-run to apply.');
  }

  return lines.join('\n');
}

export { CLASSIFICATION_ORDER };
