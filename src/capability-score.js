import { CAPABILITIES, getCapability } from './capabilities.js';
import { EVIDENCE_KEYS, normalizeIntent } from './intent.js';

export const CAPABILITY_SCORE_WEIGHTS = Object.freeze({
  phase: 4,
  action: 3,
  object: 2,
  risk: 2,
  mutation: 2,
  evidence: 2,
});

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function addMatch(matched, reasons, dimension, value, weight) {
  addUnique(matched, `${dimension}:${value}`);
  reasons.push(`matched ${dimension} ${value} (+${weight})`);
  return weight;
}

function addMiss(unmatched, reasons, dimension, value, supported) {
  addUnique(unmatched, `${dimension}:${value}`);
  reasons.push(`unmatched ${dimension} ${value} (supported: ${supported.join(', ') || 'none'})`);
}

export function scoreIntent(intentInput, capability) {
  const intent = normalizeIntent(intentInput);
  const definition = typeof capability === 'string' ? getCapability(capability) : capability;
  if (!definition?.skill) throw new Error('Capability with a skill id is required');

  const matched = [];
  const unmatched = [];
  const reasons = [];
  let score = 0;
  // ponytail: exact labels only; add aliasing when a future router needs it.
  const dimensions = [
    ['phase', intent.phase, definition.phases ?? [], CAPABILITY_SCORE_WEIGHTS.phase],
    ['action', intent.action, definition.actions ?? [], CAPABILITY_SCORE_WEIGHTS.action],
    ['object', intent.object, definition.objects ?? [], CAPABILITY_SCORE_WEIGHTS.object],
  ];
  for (const [dimension, value, supported, weight] of dimensions) {
    if (supported.includes(value)) score += addMatch(matched, reasons, dimension, value, weight);
    else addMiss(unmatched, reasons, dimension, value, supported);
  }
  for (const risk of intent.risks) {
    if ((definition.risks ?? []).includes(risk)) score += addMatch(matched, reasons, 'risk', risk, CAPABILITY_SCORE_WEIGHTS.risk);
    else addMiss(unmatched, reasons, 'risk', risk, definition.risks ?? []);
  }
  if ((definition.mutations ?? []).includes(intent.mutation)) score += addMatch(matched, reasons, 'mutation', intent.mutation, CAPABILITY_SCORE_WEIGHTS.mutation);
  else addMiss(unmatched, reasons, 'mutation', intent.mutation, definition.mutations ?? []);
  const evidence = definition.evidence ?? {};
  for (const section of ['prefer', 'deEmphasize']) {
    for (const key of EVIDENCE_KEYS) {
      const expected = evidence[section]?.[key];
      if (expected === undefined) continue;
      const actual = intent.evidence[key];
      if (actual === null) {
        reasons.push(`evidence ${key} unspecified; ${section} preference not applied`);
      } else if (section === 'prefer' && actual === expected) {
        score += addMatch(matched, reasons, 'evidence', `${key}=${actual}`, CAPABILITY_SCORE_WEIGHTS.evidence);
      } else if (section === 'prefer') {
        addMiss(unmatched, reasons, 'evidence', `${key}=${actual}`, [`${key}=${expected}`]);
        reasons.push(`evidence mismatch ${key}: expected ${expected}, got ${actual}`);
      } else if (actual === expected) {
        addMiss(unmatched, reasons, 'evidence', `${key}=${actual}`, []);
        score -= CAPABILITY_SCORE_WEIGHTS.evidence;
        reasons.push(`evidence de-emphasized ${key}=${actual} (-${CAPABILITY_SCORE_WEIGHTS.evidence})`);
      } else {
        reasons.push(`evidence ${key}=${actual} did not trigger de-emphasis for ${expected}`);
      }
    }
  }
  return { skill: definition.skill, score, matched, unmatched, reasons };
}

export function rankCapabilities(intentInput, capabilities = CAPABILITIES) {
  const intent = normalizeIntent(intentInput);
  return capabilities.map((capability) => scoreIntent(intent, capability))
    .sort((left, right) => right.score - left.score || (left.skill < right.skill ? -1 : left.skill > right.skill ? 1 : 0));
}
