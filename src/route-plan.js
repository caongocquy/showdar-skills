import { CAPABILITIES } from './capabilities.js';
import { rankCapabilities } from './capability-score.js';
import { normalizeIntent } from './intent.js';

export const MAX_ADVISORS = 2;

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
});

// These rules describe existing ownership boundaries; they do not add score bonuses.
export const SPECIALIZATION_RULES = Object.freeze([
  { id: 'security-assessment', priority: 120, skill: 'showdar-security', reason: 'explicit security assessment is security-owned', matches: (intent) => intent.risks.includes('security') && ['assess', 'review'].includes(intent.action) && ['discovery', 'verification'].includes(intent.phase) },
  { id: 'unexplained-failure', priority: 115, skill: 'showdar-debug', reason: 'an observed failure with an unknown cause is diagnosis-owned', matches: (intent) => intent.evidence.failureObserved === true && intent.evidence.rootCauseKnown === false },
  { id: 'known-implementation-cause', priority: 110, skill: 'showdar-build', reason: 'a known cause with defined behavior is implementation-owned', matches: (intent) => intent.phase === 'implementation' && ['implement', 'modify', 'fix'].includes(intent.action) && intent.evidence.rootCauseKnown === true && intent.evidence.behaviorDefined === true },
  { id: 'deployment-operation', priority: 120, skill: 'showdar-ops', reason: 'explicit deployment/runtime operation is operations-owned', matches: (intent) => intent.phase === 'operations' && ['deploy', 'modify'].includes(intent.action) },
  { id: 'release-readiness', priority: 110, skill: 'showdar-ship', reason: 'release readiness without deployment mutation is shipping-owned', matches: (intent) => intent.phase === 'delivery' && ['assess', 'release', 'review'].includes(intent.action) && intent.mutation === 'read-only' },
  { id: 'qa-scope', priority: 105, skill: 'showdar-quality', reason: 'explicit QA or regression-scope assessment is quality-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'assess' },
  { id: 'automated-test', priority: 105, skill: 'showdar-test', reason: 'automated test implementation is test-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'test' },
  { id: 'dependency-migration', priority: 110, skill: 'showdar-upgrade', reason: 'dependency or framework migration is upgrade-owned', matches: (intent) => intent.action === 'upgrade' },
  { id: 'git-operation', priority: 120, skill: 'showdar-git', reason: 'repository history operation is Git-owned', matches: (intent) => intent.phase === 'repository' && intent.action === 'git' },
  { id: 'recovery-operation', priority: 120, skill: 'showdar-recover', reason: 'interrupted work reconstruction is recovery-owned', matches: (intent) => intent.phase === 'recovery' && intent.action === 'recover' },
]);

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
  const specializationReasons = SPECIALIZATION_RULES
    .filter((rule) => rule.skill === candidate.skill && rule.matches(intent))
    .map((rule) => `specialization: ${rule.reason}`);
  const signals = candidate.skill === primarySkill ? [] : advisorSignals(intent, candidate);
  return {
    ...candidate,
    reasons: [...candidate.reasons, ...specializationReasons],
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

function choosePrimary(ranked, intent) {
  const applicable = SPECIALIZATION_RULES
    .filter((rule) => rule.matches(intent) && ranked.some((candidate) => candidate.skill === rule.skill))
    .sort((left, right) => right.priority - left.priority || (left.skill < right.skill ? -1 : left.skill > right.skill ? 1 : 0));
  const rule = applicable[0];
  const candidate = ranked.find((item) => item.skill === rule?.skill) ?? ranked[0];
  return { candidate, rule };
}

export function buildRoutePlan(intentInput, capabilities = CAPABILITIES) {
  const intent = normalizeIntent(intentInput);
  const ranked = rankCapabilities(intent, capabilities);
  if (ranked.length === 0) throw new Error('At least one capability is required to build a route plan');

  const { candidate: primary, rule: primaryRule } = choosePrimary(ranked, intent);
  const candidates = ranked.map((candidate) => candidateWithMetadata(candidate, intent, primary.skill));
  const advisorCandidates = candidates
    .filter((candidate) => candidate.advisorEligible)
    .sort((left, right) => right.score - left.score || (left.skill < right.skill ? -1 : left.skill > right.skill ? 1 : 0));

  return {
    primary: {
      skill: primary.skill,
      score: primary.score,
      reasons: candidates.find((candidate) => candidate.skill === primary.skill).reasons,
    },
    advisors: advisorCandidates.slice(0, MAX_ADVISORS).map((candidate) => ({
      skill: candidate.skill,
      score: candidate.score,
      reasons: [...candidate.reasons, ...candidate.advisorReasons],
    })),
    candidates,
    confidence: confidenceFor(primary, ranked, Boolean(primaryRule)),
  };
}

export const planRoute = buildRoutePlan;
