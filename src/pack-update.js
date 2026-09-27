import path from 'node:path';
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { 
  hashTree, 
  readManifest, 
  writeJsonAtomic, 
  ownedPathSet, 
  manifestPathFor, 
  EXTENSION_DIR,
  lstatWithoutSymlink,
  assertSafeManagedPath,
} from './project.js';
import { validatePack } from './validate-pack.js';
import { validatePackManifest } from './validate-pack.js';
import { createExtensionError, EXTENSION_ERROR_CATEGORIES } from './extension-errors.js';

const EXTENSION_PACKS_DIR = path.join(EXTENSION_DIR, 'packs');

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

async function copyOwned({ baseRoot, source, destination, priorOwned, newFiles, managedRoots = [] }) {
  const relative = manifestPathFor(baseRoot, destination);
  if ((await access(destination).then(() => true).catch(() => false)) && !priorOwned.has(relative)) {
    throw new Error(`Refusing to overwrite existing non-Showdar-managed file: ${destination}`);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  newFiles.push({ path: relative, hash: await hashTree(destination), extension: true });
}

function compareWorkflowDefinitions(oldManifest, newManifest) {
  const changes = [];
  
  const oldWorkflows = new Map((oldManifest.workflows ?? []).map(w => [w.id, w]));
  const newWorkflows = new Map((newManifest.workflows ?? []).map(w => [w.id, w]));
  
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

async function updatePack({ cwd, source, home = process.cwd() }) {
  const packRoot = await resolvePackSource({ cwd, source });
  const newManifest = await readPackManifest(packRoot);
  const validation = await validatePack(packRoot);
  if (!validation.ok) throw new Error(`Invalid pack: ${validation.errors.join('; ')}`);
  
  const manifestPath = path.join(cwd, '.showdar.json');
  const existing = await readManifest(manifestPath, cwd);
  if (!existing) throw new Error('Showdar is not installed in project scope. Run "showdar init" first.');
  
  const existingPack = existing.extensions?.packs?.find(p => p.name === newManifest.name);
  if (!existingPack) throw new Error(`Pack not installed: ${newManifest.name}. Use add-pack instead.`);
  
  const newPackHash = await hashTree(packRoot);
  
  if (newPackHash === existingPack.hash) {
    return { pack: newManifest.name, version: newManifest.version, status: 'already-up-to-date', hash: newPackHash };
  }
  
  const fileList = await buildPackFileList(packRoot, newManifest);
  const priorOwned = ownedPathSet(existing);
  
  const destination = path.join(cwd, '.showdar', 'extensions', 'packs', newManifest.name);
  const tempDir = path.join(cwd, '.showdar', 'extensions', 'packs', `.${newManifest.name}.tmp-${process.pid}-${Date.now()}`);
  
  const workflowChanges = [];
  const oldPackDir = path.join(cwd, '.showdar', 'extensions', 'packs', existingPack.name);
  let oldManifest = null;
  try {
    oldManifest = await readPackManifest(oldPackDir);
  } catch {}
  
  if (oldManifest) {
    const workflowChangesResult = compareWorkflowDefinitions(oldManifest, newManifest);
    if (workflowChangesResult.length > 0) {
      console.warn(`Warning: Custom workflow definitions changed. Existing checkpoints will be revalidated against the current definition when resumed.`);
      console.warn(`Changed workflows: ${workflowChangesResult.map(c => `${c.type}:${c.workflowId}`).join(', ')}`);
    }
  }
  
  const newFiles = [];
  
  for (const file of fileList) {
    await assertSafeManagedPath(packRoot, file.source);
    const dest = path.join(tempDir, file.relative);
    await assertSafeManagedPath(cwd, dest);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file.source, dest, { recursive: true });
  }
  
  for (const file of fileList) {
    const dest = path.join(cwd, '.showdar', 'extensions', 'packs', newManifest.name, file.relative);
    await assertSafeManagedPath(cwd, dest);
    const relative = path.relative(cwd, dest).replaceAll(path.sep, '/');
    
    if ((await exists(dest)) && !priorOwned.has(relative)) {
      throw new Error(`Refusing to overwrite existing non-Showdar-managed file: ${dest}`);
    }
    await rm(dest, { recursive: true, force: true });
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file.source, dest, { recursive: true });
    newFiles.push({ path: relative, hash: await hashTree(dest), extension: true });
  }
  
  const merged = new Map((existing.files ?? []).map((e) => [e.path, e]));
  for (const file of newFiles) merged.set(file.path, file);
  
  const packDir = path.join(cwd, '.showdar', 'extensions', 'packs', newManifest.name);
  await rm(packDir, { recursive: true, force: true }).catch(() => {});
  
  const updated = {
    ...existing,
    files: [...merged.values()],
    extensions: {
      ...(existing.extensions ?? {}),
      packs: (existing.extensions?.packs ?? []).map(p => p.name === newManifest.name 
        ? { ...p, version: newManifest.version, hash: newPackHash, installedAt: new Date().toISOString() }
        : p),
      customWorkflows: existing.extensions?.customWorkflows?.filter(w => w.source !== `pack:${newManifest.name}`) ?? [],
    },
  };
  
  if (newManifest.workflows) {
    updated.extensions.customWorkflows = [
      ...updated.extensions.customWorkflows,
      ...newManifest.workflows.map(w => ({
        id: w.id,
        source: `pack:${newManifest.name}`,
        path: `.showdar/extensions/packs/${newManifest.name}/${w.path}`.replaceAll(path.sep, '/'),
      }))
    ];
  }
  
  await writeJsonAtomic(manifestPath, updated);
  
  return { 
    pack: newManifest.name, 
    version: newManifest.version, 
    status: 'updated', 
    oldHash: existingPack.hash, 
    newHash: newPackHash,
    files: newFiles.length 
  };
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

function resolvePackSource({ cwd, source }) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Extension source must be a non-empty local path.');
  const value = source.trim();
  const resolved = path.resolve(cwd, value);
  return resolved;
}

export { updatePack };
export const packUpdateAPI = { updatePack };