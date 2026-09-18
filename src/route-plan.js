import { CAPABILITIES } from './capabilities.js';
import { rankCapabilities } from './capability-score.js';
import { normalizeIntent } from './intent.js';

export const MAX_ADVISORS = 2;

// Mapping from secondary action to skill
const SECONDARY_ACTION_SKILLS = Object.freeze({
  security: 'showdar-security',
  test: 'showdar-test',
  quality: 'showdar-quality',
  review: 'showdar-review',
  upgrade: 'showdar-upgrade',
  release: 'showdar-ship',
  deploy: 'showdar-ops',
  operations: 'showdar-ops',
  recover: 'showdar-recover',
  git: 'showdar-git',
  design: 'showdar-design',
  requirements: 'showdar-requirements',
});

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function signalForSecondaryAction(action) {
  const skill = SECONDARY_ACTION_SKILLS[action] ?? (action.startsWith('showdar-') ? action : null);
  return skill ? `secondary action ${action} targets ${skill}` : null;
}

function advisorSignals(intent, candidate) {
  const signals = [];
  for (const action of intent.secondaryActions) {
    if (SECONDARY_ACTION_SKILLS[action] === candidate.skill || action === candidate.skill) {
      addUnique(signals, signalForSecondaryAction(action) ?? `secondary action ${action} targets ${candidate.skill}`);
    }
  }
  return signals;
}

function candidateWithMetadata(candidate, intent, primarySkill) {
  const signals = candidate.skill === primarySkill ? [] : advisorSignals(intent, candidate);
  return {
    ...candidate,
    reasons: [...candidate.reasons, ...signals],
    advisorEligible: signals.length > 0,
    advisorReasons: signals,
  };
}

function confidenceFor(primary, candidates, decisive) {
  const next = candidates.find((candidate) => candidate.skill !== primary.skill);
  const margin = primary.score - (next?.score ?? primary.score);
  const level = decisive || (margin >= 6 && primary.matched.some((value) => value.startsWith('phase:') || value.startsWith('action:')))
    ? 'high'
    : margin > 0 ? 'medium' : 'low';
  return { level, margin, decisive };
}

// Thin deterministic structural route path (Phase 6G T16).
// Structural path: internal primaryCapability → primary skill via CAPABILITY_TO_SKILL
// + secondaryActions → advisor map (SECONDARY_ACTION_SKILLS, deduplicated, primary excluded, capped at MAX_ADVISORS).
// Zero scoring, zero PRIMARY_SELECTION_RULES, zero risk/object/evidence re-selection.
// risks, object, and evidence are never consulted on this path.
const CAPABILITY_TO_SKILL = Object.freeze({
  understand: 'showdar-understand',
  requirements: 'showdar-requirements',
  plan: 'showdar-plan',
  design: 'showdar-design',
  implement: 'showdar-build',
  debug: 'showdar-debug',
  test: 'showdar-test',
  review: 'showdar-review',
  quality: 'showdar-quality',
  'security-assessment': 'showdar-security',
  upgrade: 'showdar-upgrade',
  ship: 'showdar-ship',
  ops: 'showdar-ops',
  recover: 'showdar-recover',
  git: 'showdar-git',
});

export function buildThinRoutePlan(intentInput, routingMeta) {
  const intent = normalizeIntent(intentInput);
  // Structural authoritative path (spec §8A): the governing frame's internal
  // primaryCapability decides. This branch consults nothing else — no risks,
  // no object, no evidence, no selection rules, no scoring fallback.
  const capability = routingMeta?.primaryCapability;
  if (typeof capability !== 'string' || !CAPABILITY_TO_SKILL[capability]) {
    throw new Error(`Structural route requires valid primaryCapability; got: ${capability}`);
  }
  const skill = CAPABILITY_TO_SKILL[capability];
  const advisors = [];
  for (const action of intent.secondaryActions) {
    const advisor = SECONDARY_ACTION_SKILLS[action] ?? (action.startsWith('showdar-') ? action : null);
    if (advisor && advisor !== skill && !advisors.includes(advisor) && advisors.length < MAX_ADVISORS) advisors.push(advisor);
  }
  return { primary: { skill }, advisors };
}