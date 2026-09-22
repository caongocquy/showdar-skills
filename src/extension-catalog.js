import { SKILLS, WORKFLOW_SKILLS, PROFILES, PROFILE_ALIASES, getSkill as getBuiltinSkill, getWorkflow as getBuiltinWorkflow } from './catalog.js';
import { SELECTABLE_STAGES, SKIP_RULES, REQUIRED_STAGES } from './workflow-state.js';
import {
  validatePackManifest,
  validateCustomWorkflowDoc,
  validateProjectOverridesDoc,
  validatePackSkillId,
  validateCustomWorkflowId,
  validateBuiltinSkillId,
  containsForbiddenAuthorityKey,
} from './validate-pack.js';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sortedEntries(record) {
  return Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function builtinSnapshot() {
  const skills = [...SKILLS].sort((a, b) => (a.id < b.id ? -1 : 1)).map((s) => deepFreeze({ ...s }));
  const workflows = [...WORKFLOW_SKILLS].sort((a, b) => (a.id < b.id ? -1 : 1)).map((w) => deepFreeze({ ...w }));
  const profiles = Object.fromEntries(sortedEntries(PROFILES).map(([name, members]) => [name, Object.freeze([...members].sort())]));
  return {
    skills: Object.freeze(skills),
    workflows: Object.freeze(workflows),
    profiles: Object.freeze(profiles),
    overrides: Object.freeze({ skillDescriptions: Object.freeze({}), skillDomains: Object.freeze({}), guidance: Object.freeze({}) }),
    selectableStages: Object.freeze(Object.fromEntries(sortedEntries(SELECTABLE_STAGES).map(([id, stages]) => [id, Object.freeze([...stages])]))),
    skipRules: Object.freeze(Object.fromEntries(sortedEntries(SKIP_RULES).map(([id, rules]) => [id, deepFreeze(JSON.parse(JSON.stringify(rules)))]))),
    requiredStages: Object.freeze(Object.fromEntries(sortedEntries(REQUIRED_STAGES).map(([id, stages]) => [id, Object.freeze([...stages])]))),
  };
}

export const BUILTIN_SNAPSHOT = deepFreeze(builtinSnapshot());

const BUILTIN_SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const BUILTIN_WORKFLOW_IDS = new Set(WORKFLOW_SKILLS.map((w) => w.id));
const BUILTIN_PROFILE_NAMES = new Set(Object.keys(PROFILES));

export function createExtensionCatalog({ packs = [], projectOverrides = null } = {}) {
  const errors = [];
  if (!Array.isArray(packs)) return { ok: false, errors: ['packs must be an array'] };
  if (projectOverrides !== null && (typeof projectOverrides !== 'object' || Array.isArray(projectOverrides))) {
    return { ok: false, errors: ['projectOverrides must be an object or null'] };
  }
  const sortedPacks = [...packs].sort((a, b) => String(a?.manifest?.name ?? '').localeCompare(String(b?.manifest?.name ?? '')));
  const skillById = new Map();
  const workflowById = new Map();
  const packProfiles = {};
  const customWorkflows = new Map();
  const seenSkillIds = new Set([...BUILTIN_SKILL_IDS, ...BUILTIN_WORKFLOW_IDS]);

  for (const pack of sortedPacks) {
    if (!pack || typeof pack !== 'object') { errors.push('pack entry must be an object'); continue; }
    const manifest = pack.manifest;
    const manifestResult = validatePackManifest(manifest);
    if (!manifestResult.ok) { errors.push(...manifestResult.errors.map((e) => `pack ${manifest?.name ?? '?'}: ${e}`)); continue; }
    const ownedIds = new Set([...(manifest.skills ?? []).map((s) => s.id), ...((manifest.workflows ?? []).map((w) => w.id))]);
    for (const skill of manifest.skills) {
      if (seenSkillIds.has(skill.id)) { errors.push(`duplicate skill id: ${skill.id}`); continue; }
      seenSkillIds.add(skill.id);
      skillById.set(skill.id, deepFreeze({
        id: skill.id,
        kind: 'pack',
        pack: manifest.name,
        description: skill.description ?? '',
        domains: Object.freeze([...(skill.domains ?? [])].sort()),
      }));
    }
    for (const workflow of manifest.workflows ?? []) {
      if (seenSkillIds.has(workflow.id)) { errors.push(`duplicate workflow id: ${workflow.id}`); continue; }
      const doc = { ...(pack.workflows?.[workflow.id] ?? {}), id: workflow.id };
      const docErrors = validateCustomWorkflowDoc(doc, `pack ${manifest.name} workflow ${workflow.id}`);
      if (docErrors.length) { errors.push(...docErrors); continue; }
      const authorityHit = containsForbiddenAuthorityKey(doc);
      if (authorityHit) { errors.push(`pack ${manifest.name} workflow ${workflow.id} contains forbidden authority key at ${authorityHit}`); continue; }
      seenSkillIds.add(workflow.id);
      customWorkflows.set(workflow.id, { pack: manifest.name, doc: deepFreeze(JSON.parse(JSON.stringify(doc))) });
      workflowById.set(workflow.id, deepFreeze({
        id: workflow.id,
        kind: 'custom-workflow',
        pack: manifest.name,
        description: doc.description ?? '',
        stages: Object.freeze([...doc.stages].sort()),
      }));
    }
    for (const [name, members] of Object.entries(manifest.profiles ?? {})) {
      if (BUILTIN_PROFILE_NAMES.has(name) || packProfiles[name]) { errors.push(`duplicate profile name: ${name}`); continue; }
      for (const member of members) {
        if (!ownedIds.has(member)) errors.push(`pack ${manifest.name} profile ${name} references non-pack-owned id: ${member}`);
      }
      packProfiles[name] = Object.freeze([...members].sort());
    }
  }

  let overridesResult = { ok: true, errors: [] };
  let overrides = { skillDescriptions: {}, skillDomains: {}, guidance: {} };
  if (projectOverrides) {
    overridesResult = validateProjectOverridesDoc(projectOverrides, { knownIds: BUILTIN_SKILL_IDS });
    if (!overridesResult.ok) errors.push(...overridesResult.errors.map((e) => `overrides: ${e}`));
    else {
      overrides = {
        skillDescriptions: { ...(projectOverrides.skillDescriptions ?? {}) },
        skillDomains: { ...(projectOverrides.skillDomains ?? {}) },
        guidance: { ...(projectOverrides.guidance ?? {}) },
      };
      for (const id of Object.keys(projectOverrides.workflowPolicy ?? {})) {
        if (!customWorkflows.has(id)) errors.push(`overrides workflowPolicy references unknown custom workflow: ${id}`);
      }
      for (const [name, members] of Object.entries(projectOverrides.profiles ?? {})) {
        if (BUILTIN_PROFILE_NAMES.has(name)) { errors.push(`overrides MUST NOT mutate built-in profile: ${name}`); continue; }
        for (const member of members) {
          if (!BUILTIN_SKILL_IDS.has(member) && !BUILTIN_WORKFLOW_IDS.has(member) && !seenSkillIds.has(member)) {
            errors.push(`overrides profile ${name} references unknown id: ${member}`);
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)].sort() };

  const skills = [...SKILLS.map((s) => ({ ...s })), ...[...skillById.values()].map((s) => ({ ...s }))].sort((a, b) => (a.id < b.id ? -1 : 1));
  const workflows = [...WORKFLOW_SKILLS.map((w) => ({ ...w })), ...[...workflowById.values()].map((w) => ({ ...w }))].sort((a, b) => (a.id < b.id ? -1 : 1));
  const selectableStages = { ...SELECTABLE_STAGES };
  const skipRules = JSON.parse(JSON.stringify(SKIP_RULES));
  const requiredStages = { ...REQUIRED_STAGES };
  for (const [id, { doc }] of [...customWorkflows.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const refinement = projectOverrides?.workflowPolicy?.[id];
    const stages = refinement?.stages ?? doc.stages;
    const required = refinement?.requiredStages ?? doc.requiredStages ?? [];
    const compat = doc.workflowStateCompat;
    const skip = compat ? compat.skipRules : Object.fromEntries(
      (doc.allowedSkips ?? []).map((s) => [s.stage, { reason: s.reason, policy: s.policy, evidence: s.evidence }]),
    );
    const refinedSkip = { ...skip, ...(refinement?.skipRules ?? {}) };
    selectableStages[id] = [...stages];
    requiredStages[id] = [...required];
    skipRules[id] = refinedSkip;
  }
  const profiles = {
    ...Object.fromEntries(sortedEntries(PROFILES).map(([name, members]) => [name, [...members].sort()])),
    ...Object.fromEntries(sortedEntries(packProfiles).map(([name, members]) => [name, [...members]])),
    ...Object.fromEntries(sortedEntries(projectOverrides?.profiles ?? {}).map(([name, members]) => [name, [...members].sort()])),
  };

  const snapshot = {
    skills: Object.freeze(skills.map((s) => deepFreeze(s))),
    workflows: Object.freeze(workflows.map((w) => deepFreeze(w))),
    profiles: deepFreeze(profiles),
    overrides: deepFreeze(JSON.parse(JSON.stringify(overrides))),
    selectableStages: deepFreeze(JSON.parse(JSON.stringify(selectableStages))),
    skipRules: deepFreeze(JSON.parse(JSON.stringify(skipRules))),
    requiredStages: deepFreeze(JSON.parse(JSON.stringify(requiredStages))),
  };
  return { ok: true, errors: [], value: deepFreeze(snapshot) };
}

export function getCatalogSkill(catalog, id) {
  const snapshot = catalog ?? BUILTIN_SNAPSHOT;
  const skill = snapshot.skills.find((s) => s.id === id) ?? null;
  if (!skill) return getBuiltinSkill(id);
  const description = snapshot.overrides?.skillDescriptions?.[id] ?? skill.description;
  const domain = snapshot.overrides?.skillDomains?.[id];
  const descChanged = description !== skill.description;
  const domainChanged = domain !== undefined && domain !== skill.domain;
  if (!descChanged && !domainChanged) return skill;
  return { ...skill, ...(descChanged ? { description } : {}), ...(domainChanged ? { domain } : {}) };
}

export function getCatalogWorkflow(catalog, id) {
  const snapshot = catalog ?? BUILTIN_SNAPSHOT;
  return snapshot.workflows.find((w) => w.id === id) ?? getBuiltinWorkflow(id);
}

export function resolveCatalogProfile(catalog, profile) {
  const snapshot = catalog ?? BUILTIN_SNAPSHOT;
  const canonical = PROFILE_ALIASES[profile] ?? profile;
  if (snapshot.profiles[canonical]) return [...snapshot.profiles[canonical]];
  if (Object.hasOwn(PROFILE_ALIASES, profile) && snapshot.profiles[PROFILE_ALIASES[profile]]) return [...snapshot.profiles[PROFILE_ALIASES[profile]]];
  throw new Error(`Unknown profile "${profile}".`);
}

export const extensionCatalogAPI = {
  createExtensionCatalog,
  getCatalogSkill,
  getCatalogWorkflow,
  resolveCatalogProfile,
  BUILTIN_SNAPSHOT,
};
