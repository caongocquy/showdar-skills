import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SKILLS, WORKFLOW_SKILLS, PROFILES } from './catalog.js';
import { SKIP_POLICIES, SKIP_REASONS, FORBIDDEN_AUTHORITY_KEYS } from './workflow-state.js';
import { validateSkillDirectory } from './validate.js';

const VENDOR_RE = /^[a-z][a-z0-9]*$/;
const SUFFIX_RE = /^[a-z][a-z0-9-]*(?:-[a-z0-9]+)*$/;
const CUSTOM_WORKFLOW_RE = /^[a-z][a-z0-9]*-[a-z][a-z0-9-]*$/;
const PACK_SKILL_RE = /^[a-z][a-z0-9]*\/[a-z][a-z0-9-]*$/;
const BUILTIN_SKILL_RE = /^showdar-[a-z][a-z0-9-]*$/;
const DOMAIN_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const HASH_RE = /^[a-f0-9]{64}$/;

const PRIMITIVE_IDS = new Set(SKILLS.map((s) => s.id));
const BUILTIN_WORKFLOW_IDS = new Set(WORKFLOW_SKILLS.map((w) => w.id));
const BUILTIN_IDS = new Set([...PRIMITIVE_IDS, ...BUILTIN_WORKFLOW_IDS]);
const BUILTIN_PROFILE_NAMES = new Set(Object.keys(PROFILES));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasControlChars(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function rejectPathLike(id, field, errors) {
  if (id.includes('..') || hasControlChars(id)) errors.push(`${field} "${id}" contains forbidden path/control characters`);
}

export function validateBuiltinSkillId(id) {
  return typeof id === 'string' && BUILTIN_SKILL_RE.test(id);
}

export function validatePackSkillId(id) {
  if (typeof id !== 'string' || !PACK_SKILL_RE.test(id)) return false;
  const [vendor, suffix] = id.split('/');
  return VENDOR_RE.test(vendor) && SUFFIX_RE.test(suffix) && vendor !== 'showdar';
}

export function validateCustomWorkflowId(id) {
  if (typeof id !== 'string' || !CUSTOM_WORKFLOW_RE.test(id)) return false;
  if (id.startsWith('showdar-')) return false;
  const vendor = id.slice(0, id.indexOf('-'));
  return VENDOR_RE.test(vendor);
}

export function validateProjectReference(id) {
  return typeof id === 'string' && id.startsWith('project:') && validateBuiltinSkillId(id.slice('project:'.length));
}

export function validateDomain(domain) {
  return typeof domain === 'string' && domain.length >= 2 && domain.length <= 40 && DOMAIN_RE.test(domain);
}

export function validateDomains(domains, field = 'domains') {
  const errors = [];
  if (!Array.isArray(domains)) return [`${field} must be an array`];
  if (domains.length > 8) errors.push(`${field} must contain at most 8 domains`);
  for (const domain of domains) {
    if (!validateDomain(domain)) errors.push(`${field} contains invalid domain: ${JSON.stringify(domain)}`);
  }
  if (new Set(domains).size !== domains.length) errors.push(`${field} contains duplicates`);
  return errors;
}

export function validatePackSkillRef(entry, field = 'skills') {
  const errors = [];
  if (!isRecord(entry)) return [`${field} entry must be an object`];
  if (!validatePackSkillId(entry.id)) {
    errors.push(`${field} id must match vendor/skill grammar: ${JSON.stringify(entry.id)}`);
  } else {
    rejectPathLike(entry.id, `${field} id`, errors);
  }
  if (typeof entry.path !== 'string' || !entry.path) {
    errors.push(`${field} path must be a non-empty string`);
  } else if (path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..') || hasControlChars(entry.path)) {
    errors.push(`${field} path is unsafe: ${JSON.stringify(entry.path)}`);
  }
  if (entry.description !== undefined && typeof entry.description !== 'string') errors.push(`${field} description must be a string`);
  if (entry.domains !== undefined) errors.push(...validateDomains(entry.domains, `${field} domains`));
  return errors;
}

export function validateCustomWorkflowDoc(doc, field = 'workflow') {
  const errors = [];
  if (!isRecord(doc)) return [`${field} must be an object`];
  const known = new Set(['id', 'description', 'stages', 'allowedSkips', 'requiredStages', 'completionPolicy', 'workflowStateCompat']);
  for (const key of Object.keys(doc)) if (!known.has(key)) errors.push(`${field} contains unknown key: ${key}`);
  if (!validateCustomWorkflowId(doc.id)) errors.push(`${field} id must use custom namespace grammar (vendor-name, never showdar-*): ${JSON.stringify(doc.id)}`);
  if (typeof doc.description !== 'string' || doc.description.trim().length < 30) errors.push(`${field} description must be at least 30 characters`);
  if (!Array.isArray(doc.stages) || !doc.stages.length) {
    errors.push(`${field} stages must be a non-empty array`);
  } else {
    if (new Set(doc.stages).size !== doc.stages.length) errors.push(`${field} stages contains duplicates`);
    for (const stage of doc.stages) {
      if (!validateBuiltinSkillId(stage) || !PRIMITIVE_IDS.has(stage)) errors.push(`${field} stage must be a built-in primitive skill id: ${JSON.stringify(stage)}`);
    }
  }
  const stages = new Set(Array.isArray(doc.stages) ? doc.stages : []);
  if (doc.allowedSkips !== undefined) {
    if (!Array.isArray(doc.allowedSkips)) errors.push(`${field} allowedSkips must be an array`);
    else for (const skip of doc.allowedSkips) {
      if (!isRecord(skip)) { errors.push(`${field} allowedSkips entry must be an object`); continue; }
      for (const key of Object.keys(skip)) if (!['stage', 'reason', 'policy', 'evidence'].includes(key)) errors.push(`${field} allowedSkips entry contains unknown key: ${key}`);
      if (typeof skip.stage !== 'string' || !stages.has(skip.stage)) errors.push(`${field} allowedSkips stage must be a declared stage: ${JSON.stringify(skip.stage)}`);
      if (!SKIP_REASONS.includes(skip.reason)) errors.push(`${field} allowedSkips reason must be one of: ${SKIP_REASONS.join(', ')}`);
      if (!SKIP_POLICIES.includes(skip.policy)) errors.push(`${field} allowedSkips policy must be one of: ${SKIP_POLICIES.join(', ')}`);
      if (!Array.isArray(skip.evidence) || skip.evidence.some((e) => typeof e !== 'string')) errors.push(`${field} allowedSkips evidence must be an array of strings`);
    }
  }
  if (doc.requiredStages !== undefined) {
    if (!Array.isArray(doc.requiredStages)) errors.push(`${field} requiredStages must be an array`);
    else for (const stage of doc.requiredStages) {
      if (typeof stage !== 'string' || !stages.has(stage)) errors.push(`${field} requiredStages must be a subset of stages: ${JSON.stringify(stage)}`);
    }
  }
  if (doc.completionPolicy !== undefined) {
    const policy = doc.completionPolicy;
    if (!isRecord(policy)) errors.push(`${field} completionPolicy must be an object`);
    else {
      for (const key of ['allSelectedStagesAccounted', 'noBlockers', 'requiredVerificationSatisfied', 'noNegativeEvidence']) {
        if (policy[key] !== true) errors.push(`${field} completionPolicy.${key} must be true`);
      }
      for (const key of Object.keys(policy)) {
        if (!['allSelectedStagesAccounted', 'noBlockers', 'requiredVerificationSatisfied', 'noNegativeEvidence'].includes(key)) errors.push(`${field} completionPolicy contains unknown key: ${key}`);
      }
    }
  }
  if (doc.workflowStateCompat !== undefined) {
    const compat = doc.workflowStateCompat;
    if (!isRecord(compat)) errors.push(`${field} workflowStateCompat must be an object`);
    else {
      if (compat.schemaVersion !== 1) errors.push(`${field} workflowStateCompat.schemaVersion must be 1`);
      if (!Array.isArray(compat.selectableStages)) errors.push(`${field} workflowStateCompat.selectableStages must be an array`);
      else for (const stage of compat.selectableStages) {
        if (typeof stage !== 'string' || !stages.has(stage)) errors.push(`${field} workflowStateCompat.selectableStages must be a subset of stages: ${JSON.stringify(stage)}`);
      }
      if (!isRecord(compat.skipRules)) errors.push(`${field} workflowStateCompat.skipRules must be an object`);
      else for (const stage of Object.keys(compat.skipRules)) {
        if (!stages.has(stage)) errors.push(`${field} workflowStateCompat.skipRules key must be a declared stage: ${JSON.stringify(stage)}`);
      }
    }
  }
  return errors;
}

export function containsForbiddenAuthorityKey(value, currentPath = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = containsForbiddenAuthorityKey(value[i], `${currentPath}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const normalized = String(key).toLowerCase().replace(/[\s_-]+/g, '');
      if (FORBIDDEN_AUTHORITY_KEYS.some((f) => normalized.includes(f))) return `${currentPath}.${key}`;
      const hit = containsForbiddenAuthorityKey(value[key], `${currentPath}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

export function validatePackManifest(manifest) {
  const errors = [];
  if (!isRecord(manifest)) return { ok: false, errors: ['pack manifest must be an object'] };
  const known = new Set(['name', 'version', 'description', 'skills', 'workflows', 'profiles']);
  for (const key of Object.keys(manifest)) if (!known.has(key)) errors.push(`pack manifest contains unknown key: ${key}`);
  if (typeof manifest.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(manifest.name)) errors.push('pack name must match ^[a-z][a-z0-9-]*$');
  if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) errors.push('pack version must be semver x.y.z');
  if (manifest.description !== undefined && typeof manifest.description !== 'string') errors.push('pack description must be a string');
  if (manifest.hash !== undefined) errors.push('pack manifest MUST NOT contain a content hash; Showdar computes and records it at install');
  if (!Array.isArray(manifest.skills)) {
    errors.push('pack skills must be an array');
  } else {
    manifest.skills.forEach((entry, i) => {
      for (const error of validatePackSkillRef(entry, `skills[${i}]`)) errors.push(error);
    });
    const ids = manifest.skills.map((s) => s?.id);
    if (new Set(ids).size !== ids.length) errors.push('pack skills contains duplicate ids');
    for (const id of ids) {
      if (typeof id === 'string' && BUILTIN_IDS.has(id)) errors.push(`pack skill id collides with built-in: ${id}`);
    }
  }
  if (manifest.workflows !== undefined) {
    if (!Array.isArray(manifest.workflows)) errors.push('pack workflows must be an array');
    else {
      manifest.workflows.forEach((entry, i) => {
        if (!isRecord(entry)) { errors.push(`workflows[${i}] must be an object`); return; }
        if (!validateCustomWorkflowId(entry.id)) errors.push(`workflows[${i}] id must use custom namespace grammar: ${JSON.stringify(entry.id)}`);
        if (typeof entry.id === 'string' && BUILTIN_WORKFLOW_IDS.has(entry.id)) errors.push(`workflows[${i}] id collides with built-in workflow: ${entry.id}`);
        if (typeof entry.path !== 'string' || !entry.path) errors.push(`workflows[${i}] path must be a non-empty string`);
        else if (path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..')) errors.push(`workflows[${i}] path is unsafe`);
      });
      const ids = manifest.workflows.map((w) => w?.id);
      if (new Set(ids).size !== ids.length) errors.push('pack workflows contains duplicate ids');
    }
  }
  if (manifest.profiles !== undefined) {
    if (!isRecord(manifest.profiles)) errors.push('pack profiles must be an object');
    else for (const [name, members] of Object.entries(manifest.profiles)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) errors.push(`pack profile name invalid: ${name}`);
      if (BUILTIN_PROFILE_NAMES.has(name)) errors.push(`pack profile collides with built-in profile: ${name}`);
      if (!Array.isArray(members)) { errors.push(`pack profile ${name} must be an array`); continue; }
      const owned = new Set([...(manifest.skills ?? []).map((s) => s?.id), ...((manifest.workflows ?? []).map((w) => w?.id))]);
      for (const member of members) {
        if (typeof member !== 'string' || !owned.has(member)) errors.push(`pack profile ${name} references non-pack-owned id: ${JSON.stringify(member)}`);
      }
    }
  }
  const authorityHit = containsForbiddenAuthorityKey(manifest);
  if (authorityHit) errors.push(`pack manifest contains forbidden authority key at ${authorityHit}`);
  return { ok: errors.length === 0, errors };
}

export function validateProjectOverridesDoc(doc, { knownIds = new Set() } = {}) {
  const errors = [];
  if (!isRecord(doc)) return { ok: false, errors: ['project overrides must be an object'] };
  const known = new Set(['version', 'skillDescriptions', 'skillDomains', 'workflowPolicy', 'guidance', 'profiles']);
  for (const key of Object.keys(doc)) if (!known.has(key)) errors.push(`project overrides contains unknown key: ${key}`);
  if (doc.version !== undefined && doc.version !== 1) errors.push('project overrides version must be 1');
  if (doc.skillDescriptions !== undefined) {
    if (!isRecord(doc.skillDescriptions)) errors.push('skillDescriptions must be an object');
    else for (const [id, text] of Object.entries(doc.skillDescriptions)) {
      if (!validateBuiltinSkillId(id)) errors.push(`skillDescriptions key must be a built-in skill id: ${JSON.stringify(id)}`);
      if (typeof text !== 'string' || !text.trim()) errors.push(`skillDescriptions[${id}] must be a non-empty string`);
    }
  }
  if (doc.skillDomains !== undefined) {
    if (!isRecord(doc.skillDomains)) errors.push('skillDomains must be an object');
    else for (const [id, domain] of Object.entries(doc.skillDomains)) {
      if (!validateBuiltinSkillId(id)) errors.push(`skillDomains key must be a built-in skill id: ${JSON.stringify(id)}`);
      if (!validateDomain(domain)) errors.push(`skillDomains[${id}] must match domain grammar`);
    }
  }
  if (doc.workflowPolicy !== undefined) {
    if (!isRecord(doc.workflowPolicy)) errors.push('workflowPolicy must be an object');
    else for (const [id, policy] of Object.entries(doc.workflowPolicy)) {
      if (BUILTIN_WORKFLOW_IDS.has(id)) {
        errors.push(`workflowPolicy MUST NOT change built-in workflow semantics: ${id}`);
        continue;
      }
      if (!validateCustomWorkflowId(id)) {
        errors.push(`workflowPolicy key must be a custom workflow id: ${JSON.stringify(id)}`);
        continue;
      }
      if (!isRecord(policy)) { errors.push(`workflowPolicy[${id}] must be an object`); continue; }
      for (const key of Object.keys(policy)) if (!['stages', 'skipRules', 'requiredStages'].includes(key)) errors.push(`workflowPolicy[${id}] contains unknown key: ${key}`);
      if (policy.stages !== undefined) {
        if (!Array.isArray(policy.stages) || !policy.stages.length) errors.push(`workflowPolicy[${id}] stages must be a non-empty array`);
        else for (const stage of policy.stages) {
          if (!validateBuiltinSkillId(stage) || !PRIMITIVE_IDS.has(stage)) errors.push(`workflowPolicy[${id}] stage must be a built-in primitive id: ${JSON.stringify(stage)}`);
        }
      }
      if (policy.requiredStages !== undefined && Array.isArray(policy.stages)) {
        const stages = new Set(policy.stages);
        for (const stage of policy.requiredStages) {
          if (!stages.has(stage)) errors.push(`workflowPolicy[${id}] requiredStages must be a subset of stages: ${JSON.stringify(stage)}`);
        }
      }
      if (policy.skipRules !== undefined) {
        if (!isRecord(policy.skipRules)) errors.push(`workflowPolicy[${id}] skipRules must be an object`);
        else for (const [stage, rule] of Object.entries(policy.skipRules)) {
          if (!isRecord(rule)) { errors.push(`workflowPolicy[${id}].skipRules[${stage}] must be an object`); continue; }
          if (!SKIP_REASONS.includes(rule.reason)) errors.push(`workflowPolicy[${id}].skipRules[${stage}] reason must be canonical`);
          if (!SKIP_POLICIES.includes(rule.policy)) errors.push(`workflowPolicy[${id}].skipRules[${stage}] policy must be canonical`);
        }
      }
    }
  }
  if (doc.guidance !== undefined) {
    if (!isRecord(doc.guidance)) errors.push('guidance must be an object');
    else for (const [id, text] of Object.entries(doc.guidance)) {
      if (!validateBuiltinSkillId(id) && !validatePackSkillId(id) && !validateCustomWorkflowId(id)) errors.push(`guidance key must be a known skill/workflow id: ${JSON.stringify(id)}`);
      if (typeof text !== 'string' || !text.trim()) errors.push(`guidance[${id}] must be a non-empty string`);
    }
  }
  if (doc.profiles !== undefined) {
    if (!isRecord(doc.profiles)) errors.push('profiles must be an object');
    else for (const [name, members] of Object.entries(doc.profiles)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) errors.push(`project profile name invalid: ${name}`);
      if (BUILTIN_PROFILE_NAMES.has(name)) errors.push(`project profiles MUST NOT mutate built-in profile: ${name}`);
      if (!Array.isArray(members) || !members.length) { errors.push(`project profile ${name} must be a non-empty array`); continue; }
      for (const member of members) {
        if (typeof member !== 'string' || (!validateBuiltinSkillId(member) && !validatePackSkillId(member) && !validateCustomWorkflowId(member))) {
          errors.push(`project profile ${name} references unknown id: ${JSON.stringify(member)}`);
        } else if (knownIds.size && validateBuiltinSkillId(member) && !knownIds.has(member)) {
          errors.push(`project profile ${name} references unknown built-in id: ${member}`);
        }
      }
    }
  }
  const authorityHit = containsForbiddenAuthorityKey(doc);
  if (authorityHit) errors.push(`project overrides contain forbidden authority key at ${authorityHit}`);
  return { ok: errors.length === 0, errors };
}

export function validateManifestHash(hash) {
  return typeof hash === 'string' && HASH_RE.test(hash);
}

export async function validatePack(packRoot) {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(packRoot, 'pack.json'), 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`pack.json unreadable: ${error.message}`] };
  }
  const result = validatePackManifest(manifest);
  errors.push(...result.errors);
  if (!result.ok) return { ok: false, errors };
  for (const skill of manifest.skills) {
    const skillDir = path.join(packRoot, skill.path);
    const skillResult = await validateSkillDirectory(skillDir).catch((error) => ({ ok: false, errors: [error.message], warnings: [] }));
    for (const error of skillResult.errors ?? []) errors.push(`skill ${skill.id}: ${error}`);
  }
  for (const workflow of manifest.workflows ?? []) {
    let doc;
    try {
      doc = JSON.parse(await readFile(path.join(packRoot, workflow.path), 'utf8'));
    } catch (error) {
      errors.push(`workflow ${workflow.id}: unreadable (${error.message})`);
      continue;
    }
    if (doc.id !== undefined && doc.id !== workflow.id) errors.push(`workflow ${workflow.id}: file id mismatch (${JSON.stringify(doc.id)})`);
    for (const error of validateCustomWorkflowDoc({ ...doc, id: workflow.id }, `workflow ${workflow.id}`)) errors.push(error);
    const authorityHit = containsForbiddenAuthorityKey(doc);
    if (authorityHit) errors.push(`workflow ${workflow.id} contains forbidden authority key at ${authorityHit}`);
  }
  return { ok: errors.length === 0, errors };
}

export const extensionValidationAPI = {
  validateBuiltinSkillId,
  validatePackSkillId,
  validateCustomWorkflowId,
  validateProjectReference,
  validateDomain,
  validateDomains,
  validatePackSkillRef,
  validateCustomWorkflowDoc,
  validatePackManifest,
  validateProjectOverridesDoc,
  validateManifestHash,
  containsForbiddenAuthorityKey,
  validatePack,
};
