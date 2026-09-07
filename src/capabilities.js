import { SKILLS } from './catalog.js';
import { EVIDENCE_KEYS, INTENT_PHASES, MUTATION_CLASSES, RISK_CAPABILITIES } from './intent.js';

const readOnly = ['read-only'];
const localWrite = ['local-write'];
const readAndLocalWrite = ['read-only', 'local-write'];

// This array is the canonical capability source; SKILL.md remains the human-facing source.
export const CAPABILITIES = Object.freeze([
  { skill: 'showdar-understand', phases: ['discovery', 'planning'], actions: ['understand', 'investigate', 'assess'], objects: ['repository', 'architecture', 'dependency', 'api', 'data', 'runtime'], risks: [], mutations: readOnly },
  { skill: 'showdar-requirements', phases: ['definition'], actions: ['define', 'assess', 'review'], objects: ['repository', 'backend', 'api', 'ui', 'data'], risks: [], mutations: readAndLocalWrite, evidence: { prefer: { behaviorDefined: false } } },
  { skill: 'showdar-plan', phases: ['planning'], actions: ['plan', 'define', 'review'], objects: ['repository', 'architecture', 'backend', 'api', 'ui', 'data'], risks: [], mutations: readAndLocalWrite },
  { skill: 'showdar-design', phases: ['design'], actions: ['design', 'review', 'modify'], objects: ['ui', 'frontend', 'mobile'], risks: [], mutations: readAndLocalWrite },
  { skill: 'showdar-build', phases: ['implementation'], actions: ['implement', 'modify'], objects: ['repository', 'ui', 'backend', 'api', 'data', 'runtime'], risks: ['regression', 'performance', 'data-integrity'], mutations: localWrite, evidence: { prefer: { behaviorDefined: true, rootCauseKnown: true } } },
  { skill: 'showdar-debug', phases: ['diagnosis'], actions: ['investigate', 'reproduce', 'isolate', 'fix'], objects: ['runtime', 'build', 'network', 'state', 'auth', 'api'], risks: ['regression', 'performance', 'data-integrity'], mutations: readAndLocalWrite, evidence: { prefer: { failureObserved: true, rootCauseKnown: false }, deEmphasize: { rootCauseKnown: true } } },
  { skill: 'showdar-test', phases: ['verification'], actions: ['test', 'review'], objects: ['repository', 'backend', 'api', 'ui', 'runtime', 'data'], risks: ['regression', 'compatibility', 'performance'], mutations: readAndLocalWrite },
  { skill: 'showdar-quality', phases: ['verification'], actions: ['assess', 'review', 'test'], objects: ['repository', 'backend', 'api', 'ui', 'runtime'], risks: ['regression', 'compatibility'], mutations: readOnly },
  { skill: 'showdar-review', phases: ['discovery', 'verification'], actions: ['review', 'assess'], objects: ['repository', 'architecture', 'code', 'api', 'data'], risks: ['regression'], mutations: readOnly },
  { skill: 'showdar-security', phases: ['discovery', 'verification'], actions: ['assess', 'review'], objects: ['auth', 'secrets', 'trust-boundary', 'api', 'data'], risks: ['security'], mutations: readOnly },
  { skill: 'showdar-upgrade', phases: ['implementation'], actions: ['upgrade', 'modify', 'test'], objects: ['dependency', 'runtime', 'backend', 'api', 'repository'], risks: ['compatibility', 'regression'], mutations: localWrite },
  { skill: 'showdar-ship', phases: ['delivery', 'verification'], actions: ['release', 'review', 'assess'], objects: ['release', 'package', 'repository', 'deployment', 'runtime'], risks: ['production', 'compatibility'], mutations: readOnly },
  { skill: 'showdar-ops', phases: ['operations'], actions: ['deploy', 'modify', 'assess', 'review'], objects: ['deployment', 'container', 'ci', 'runtime', 'network'], risks: ['operations', 'production'], mutations: ['local-write', 'remote-write', 'production-impacting'] },
  { skill: 'showdar-recover', phases: ['recovery'], actions: ['recover', 'investigate'], objects: ['repository', 'implementation', 'runtime', 'state'], risks: ['data-integrity', 'regression'], mutations: readAndLocalWrite },
  { skill: 'showdar-git', phases: ['repository'], actions: ['git', 'modify', 'review'], objects: ['repository', 'branch', 'commit'], risks: ['data-integrity', 'operations'], mutations: ['read-only', 'local-write', 'remote-write'] },
]);

const listFields = ['phases', 'actions', 'objects', 'risks', 'mutations'];
const capabilityFields = new Set(['skill', ...listFields, 'evidence']);
const evidenceSections = ['prefer', 'deEmphasize'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateCapabilities(definitions = CAPABILITIES, skills = SKILLS) {
  const errors = [];
  if (!Array.isArray(definitions)) return { ok: false, errors: ['capabilities must be an array'] };
  const expectedSkills = new Set(skills.map(({ id }) => id));
  const seen = new Set();
  for (const definition of definitions) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push('capability definition must be an object');
      continue;
    }
    const skill = definition.skill;
    if (typeof skill !== 'string' || !skill.trim()) {
      errors.push('capability skill must be a non-empty string');
      continue;
    }
    for (const field of Object.keys(definition)) if (!capabilityFields.has(field)) errors.push(`capability ${skill} contains unknown field: ${field}`);
    if (!expectedSkills.has(skill)) errors.push(`capability entry for nonexistent skill: ${skill}`);
    if (seen.has(skill)) errors.push(`capability entries contain duplicates: ${skill}`);
    seen.add(skill);
    for (const field of listFields) {
      const values = definition[field];
      if (values === undefined) continue;
      if (!Array.isArray(values)) {
        errors.push(`capability ${skill} ${field} must be an array`);
        continue;
      }
      if (values.some((value) => typeof value !== 'string' || !value.trim())) errors.push(`capability ${skill} ${field} must contain non-empty strings`);
      if (new Set(values).size !== values.length) errors.push(`capability ${skill} ${field} contains duplicates`);
      const known = field === 'phases' ? new Set(INTENT_PHASES) : field === 'risks' ? new Set(RISK_CAPABILITIES) : field === 'mutations' ? new Set(MUTATION_CLASSES) : null;
      if (known) for (const value of values) if (typeof value === 'string' && !known.has(value)) errors.push(`capability ${skill} has invalid ${field.slice(0, -1)}: ${value}`);
    }
    if (definition.evidence !== undefined) {
      if (!isRecord(definition.evidence)) errors.push(`capability ${skill} evidence must be an object`);
      else {
        for (const section of Object.keys(definition.evidence)) {
          if (!evidenceSections.includes(section)) {
            errors.push(`capability ${skill} evidence has unknown section: ${section}`);
            continue;
          }
          const preferences = definition.evidence[section];
          if (!isRecord(preferences)) {
            errors.push(`capability ${skill} evidence.${section} must be an object`);
            continue;
          }
          for (const key of Object.keys(preferences)) {
            if (!EVIDENCE_KEYS.includes(key)) errors.push(`capability ${skill} evidence.${section} has unknown key: ${key}`);
            else if (typeof preferences[key] !== 'boolean') errors.push(`capability ${skill} evidence.${section}.${key} must be boolean`);
          }
        }
      }
    }
  }
  for (const skill of expectedSkills) if (!seen.has(skill)) errors.push(`missing capability entry for catalog skill: ${skill}`);
  return { ok: errors.length === 0, errors };
}

export function getCapability(skill) {
  return CAPABILITIES.find((definition) => definition.skill === skill) ?? null;
}
