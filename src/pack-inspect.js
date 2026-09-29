import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, readdir, lstat, access } from 'node:fs/promises';
import { 
  validatePackManifest, 
  validateCustomWorkflowDoc, 
  validatePack, 
  containsForbiddenAuthorityKey,
  validateCustomWorkflowId,
  validateProjectOverridesDoc,
} from './validate-pack.js';
import { EXTENSION_DIR, OVERRIDES_FILE, readManifest, readProjectOverrides, hashTree } from './project.js';
import { EXTENSION_ERROR_CATEGORIES, createExtensionError } from './extension-errors.js';

const DRIFT_CATEGORIES = {
  NO_DRIFT: 'no-drift',
  SOURCE_DRIFT: 'source-drift',
  SOURCE_UNAVAILABLE: 'source-unavailable',
  INSTALLED_FILE_DRIFT: 'installed-file-drift',
  OWNERSHIP_CONFLICT: 'ownership-conflict',
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readPackManifest(packRoot) {
  try {
    return JSON.parse(await readFile(path.join(packRoot, 'pack.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function readWorkflowDoc(packRoot, workflowPath) {
  try {
    return JSON.parse(await readFile(path.join(packRoot, workflowPath), 'utf8'));
  } catch {
    return null;
  }
}

async function computePackHash(packRoot, manifest) {
  const h = createHash('sha256');
  async function walk(current, relative = '') {
    const info = await lstat(current);
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
  await walk(packRoot);
  return h.digest('hex');
}

async function inspectPackSource(packRoot) {
  const errors = [];
  const warnings = [];
  
  const manifest = await readPackManifest(packRoot);
  if (!manifest) {
    return { ok: false, errors: ['pack.json not found or unreadable'] };
  }
  
  const manifestValidation = validatePackManifest(manifest);
  if (!manifestValidation.ok) errors.push(...manifestValidation.errors);
  
  const skills = [];
  for (const skill of manifest.skills ?? []) {
    const skillDir = path.join(packRoot, skill.path);
    try {
      await access(skillDir);
      const skillFile = path.join(skillDir, 'SKILL.md');
      let skillContent = '';
      try {
        skillContent = await readFile(skillFile, 'utf8');
      } catch {}
      skills.push({ id: skill.id, path: skill.path, description: skill.description, domains: skill.domains ?? [], hasSkillFile: true });
    } catch {
      skills.push({ id: skill.id, path: skill.path, description: skill.description, domains: skill.domains ?? [], hasSkillFile: false });
    }
  }
  
  const workflows = [];
  for (const workflow of manifest.workflows ?? []) {
    const doc = await readWorkflowDoc(packRoot, workflow.path);
    if (doc) {
      const validation = validateCustomWorkflowDoc(doc, `workflow ${workflow.id}`);
      if (validation.length > 0) {
        workflows.push({ id: workflow.id, path: workflow.path, valid: false, errors: validation });
      } else {
        workflows.push({ 
          id: workflow.id, 
          path: workflow.path, 
          valid: true, 
          description: doc.description,
          stages: doc.stages,
          requiredStages: doc.requiredStages ?? [],
          allowedSkips: doc.allowedSkips ?? [],
          completionPolicy: doc.completionPolicy,
        });
      }
    } else {
      workflows.push({ id: workflow.id, path: workflow.path, valid: false, errors: ['workflow file not found or unreadable'] });
    }
  }
  
  const profiles = {};
  for (const [name, members] of Object.entries(manifest.profiles ?? {})) {
    const validMembers = [];
    const invalidMembers = [];
    for (const member of members) {
      profiles[name] = { members, valid: true };
    }
  }
  
  const computedHash = await computePackHash(packRoot, manifest);
  
  return {
    ok: errors.length === 0,
    source: 'local-directory',
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    skills,
    workflows,
    profiles,
    domains: Array.from(new Set(manifest.skills?.flatMap(s => s.domains ?? []) ?? [])),
    fullTreeHash: computedHash,
    warnings,
    errors,
    manifest,
  };
}

async function inspectPackInstalled(cwd, packName, manifest) {
  const packDir = path.join(cwd, '.showdar', 'extensions', 'packs', packName);
  
  try {
    await access(path.join(cwd, '.showdar', 'extensions', 'packs', packName));
  } catch {
    return { installed: false, drift: 'source-unavailable', details: 'Pack directory missing' };
  }
  
  const sourceValidation = await validatePack(path.join(cwd, '.showdar', 'extensions', 'packs', packName)).catch(() => ({ ok: false, errors: ['validation failed'] }));
  const sourceHash = await hashTree(path.join(cwd, '.showdar', 'extensions', 'packs', packName)).catch(() => null);
  
  const recordedHash = manifest.hash;
  let drift = 'no-drift';
  let details = '';
  
  if (sourceHash === null) {
    drift = 'source-unavailable';
    details = 'Cannot compute source hash';
  } else if (sourceHash !== recordedHash) {
    drift = 'source-drift';
    details = 'Full-tree hash differs from recorded manifest hash';
  }
  
  return {
    installed: true,
    recordedHash,
    computedHash: sourceHash,
    drift,
    driftDetails: details,
    validation: sourceValidation,
  };
}

async function inspectCustomWorkflows(cwd, manifest) {
  const workflows = manifest.extensions?.customWorkflows ?? [];
  const results = [];
  
  for (const wf of workflows) {
    try {
      const docPath = path.join(cwd, wf.path);
      const doc = JSON.parse(await readFile(docPath, 'utf8'));
      const { validateCustomWorkflowDoc } = await import('./validate-pack.js');
      const errors = validateCustomWorkflowDoc(doc, `workflow ${doc.id}`);
      results.push({ id: wf.id, path: wf.path, source: wf.source, valid: errors.length === 0, errors });
    } catch (error) {
      results.push({ id: wf.id, path: wf.path, source: wf.source, valid: false, errors: [error.message] });
    }
  }
  return results;
}

async function inspectOverrides(cwd) {
  const overridesPath = path.join(cwd, '.showdar', 'overrides.json');
  try {
    await access(overridesPath);
    const { validateProjectOverridesDoc } = await import('./validate-pack.js');
    const doc = JSON.parse(await readFile(overridesPath, 'utf8'));
    const result = validateProjectOverridesDoc(doc);
    return { present: true, valid: result.ok, errors: result.errors };
  } catch {
    return { present: false, valid: true, errors: [] };
  }
}

function computePrecedence(installedManifest, projectOverrides) {
  const fields = {};
  
  const builtinSkills = new Set(['showdar-understand', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover', 'showdar-git', 'showdar-requirements', 'showdar-quality', 'showdar-security', 'showdar-ops']);
  
  for (const skill of ['showdar-understand', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover', 'showdar-git', 'showdar-requirements', 'showdar-quality', 'showdar-security', 'showdar-ops']) {
    fields[skill] = { field: skill, effective: skill, source: 'built-in', protected: true };
  }
  
  for (const pack of installedManifest.extensions?.packs ?? []) {
    const packName = pack.name;
    const packSkills = pack.skills ?? [];
    for (const skill of packSkills) {
      const existing = fields[skill.id];
      if (!existing || !existing.protected) {
        fields[skill.id] = { field: skill.id, effective: skill.description, source: `pack:${packName}`, protected: false };
      }
    }
  }
  
  if (projectOverrides?.skillDescriptions) {
    for (const [id, desc] of Object.entries(projectOverrides.skillDescriptions)) {
      const existing = fields[id];
      if (existing && !existing.protected) {
        fields[id] = { field: id, effective: desc, source: 'project-override', protected: false };
      }
    }
  }
  
  return Object.values(fields);
}

async function assessWorkflowCompatibility(checkpoint, extensionCatalog) {
  const { deserializeWorkflowState, validateWorkflowState } = await import('./workflow-state.js');
  
  let state;
  try {
    state = deserializeWorkflowState(checkpoint, { extensionCatalog });
  } catch (error) {
    return { compatible: false, replanRequired: true, reason: `malformed checkpoint: ${error.message}`, workflowIncompatible: false };
  }
  
  const validation = validateWorkflowState(state, { extensionCatalog });
  if (!validation.ok) {
    return { compatible: false, replanRequired: true, reason: `workflow-incompatible: ${validation.errors.join('; ')}`, workflowIncompatible: true };
  }
  
  return { compatible: true, replanRequired: false, reason: null };
}

async function listExtensionsWithDetails(cwd) {
  const manifest = await readManifest(path.join(cwd, '.showdar.json'), cwd);
  if (!manifest) return null;

  const overrides = await import('./project.js').then(m => m.readProjectOverrides({ cwd })).catch(() => null);
  const overridesStatus = overrides ? 'valid' : 'absent';

  const packs = [];
  for (const pack of manifest.extensions?.packs ?? []) {
    const installed = await inspectPackInstalled(cwd, pack.name, pack);
    const status = installed.drift === 'no-drift' ? 'healthy'
      : installed.drift === 'source-unavailable' ? 'source-unavailable'
      : installed.drift === 'installed-file-drift' ? 'installed-drift'
      : installed.drift === 'source-drift' ? 'source-drift'
      : installed.drift;
    packs.push({ name: pack.name, version: pack.version, hash: pack.hash, status, drift: installed.drift, driftDetails: installed.driftDetails });
  }

  const customWorkflows = [];
  for (const wf of manifest.extensions?.customWorkflows ?? []) {
    customWorkflows.push({ id: wf.id, source: wf.source, path: wf.path });
  }

  const projectProfiles = [];
  if (overrides?.profiles) {
    for (const name of Object.keys(overrides.profiles)) {
      projectProfiles.push({ name, source: 'project-override', members: overrides.profiles[name] });
    }
  }
  for (const pack of manifest.extensions?.packs ?? []) {
    const packDir = path.join(cwd, EXTENSION_DIR, 'packs', pack.name);
    try {
      const packManifest = JSON.parse(await readFile(path.join(packDir, 'pack.json'), 'utf8'));
      for (const [name, members] of Object.entries(packManifest.profiles ?? {})) {
        projectProfiles.push({ name, source: `pack:${pack.name}`, members });
      }
    } catch {}
  }

  return { packs, customWorkflows, profiles: projectProfiles, overrides: { present: overrides !== null, status: overridesStatus } };
}

async function buildCandidateEffectiveCatalog({ cwd, candidatePath }) {
  const { createExtensionCatalog } = await import('./extension-catalog.js');
  const manifestPath = path.join(cwd, '.showdar.json');
  const manifest = await readManifest(manifestPath, cwd).catch(() => null);

  const candidateManifest = await readPackManifest(candidatePath);
  const candidateWorkflows = {};
  for (const wf of candidateManifest.workflows ?? []) {
    try {
      candidateWorkflows[wf.id] = JSON.parse(await readFile(path.join(candidatePath, wf.path), 'utf8'));
    } catch {}
  }

  const packs = [];
  if (manifest) {
    for (const pack of manifest.extensions?.packs ?? []) {
      if (pack.name === candidateManifest.name) continue;
      const packDir = path.join(cwd, EXTENSION_DIR, 'packs', pack.name);
      try {
        const pm = JSON.parse(await readFile(path.join(packDir, 'pack.json'), 'utf8'));
        const workflows = {};
        for (const wf of pm.workflows ?? []) {
          try {
            workflows[wf.id] = JSON.parse(await readFile(path.join(packDir, wf.path), 'utf8'));
          } catch {}
        }
        packs.push({ manifest: pm, workflows });
      } catch {}
    }
  }

  packs.push({ manifest: candidateManifest, workflows: candidateWorkflows });

  let projectOverrides = null;
  try {
    const { readProjectOverrides } = await import('./project.js');
    projectOverrides = await readProjectOverrides({ cwd });
  } catch {}

  const result = createExtensionCatalog({ packs, projectOverrides });
  if (!result.ok) throw new Error(`Candidate catalog invalid: ${result.errors.join('; ')}`);
  return result.value;
}

async function assessCheckpointAgainstCandidate({ cwd, candidatePath, checkpoint }) {
  const { assessCompatibilityReasons } = await import('./pack-compat.js');
  const catalog = await buildCandidateEffectiveCatalog({ cwd, candidatePath });
  return assessCompatibilityReasons(checkpoint, catalog);
}

export {
  inspectPackSource,
  inspectPackInstalled,
  inspectCustomWorkflows,
  inspectOverrides,
  computePrecedence,
  assessWorkflowCompatibility,
  listExtensionsWithDetails,
  buildCandidateEffectiveCatalog,
  assessCheckpointAgainstCandidate,
  DRIFT_CATEGORIES,
};

export const packInspectAPI = {
  inspectPackSource,
  inspectPackInstalled,
  inspectCustomWorkflows,
  computePrecedence,
  assessWorkflowCompatibility,
  listExtensionsWithDetails,
  buildCandidateEffectiveCatalog,
  assessCheckpointAgainstCandidate,
};

export default { inspectPackSource, inspectPackInstalled };