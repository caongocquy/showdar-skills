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

/**
 * Primary selection rules based on intent semantics (phase, action, evidence).
 * These determine OWNERSHIP of the primary work unit.
 * They do NOT create advisors - advisors come ONLY from secondaryActions.
 */
const PRIMARY_SELECTION_RULES = Object.freeze([
  // Security assessment ownership
  { id: 'security-assessment', priority: 120, skill: 'showdar-security', reason: 'explicit security assessment is security-owned', matches: (intent) => intent.risks.includes('security') && ['assess', 'review'].includes(intent.action) && ['discovery', 'verification'].includes(intent.phase) },
  // Unexplained failure -> debug owns diagnosis
  { id: 'unexplained-failure', priority: 115, skill: 'showdar-debug', reason: 'an observed failure with an unknown cause is diagnosis-owned', matches: (intent) => intent.evidence.failureObserved === true && intent.evidence.rootCauseKnown === false && ['diagnosis', 'implementation'].includes(intent.phase) },
  // Known implementation cause -> build owns
  { id: 'known-implementation-cause', priority: 110, skill: 'showdar-build', reason: 'a known cause with defined behavior is implementation-owned', matches: (intent) => intent.phase === 'implementation' && ['implement', 'modify', 'fix'].includes(intent.action) && intent.evidence.rootCauseKnown === true && intent.evidence.behaviorDefined === true },
  // Deployment operation -> ops owns
  { id: 'deployment-operation', priority: 120, skill: 'showdar-ops', reason: 'explicit deployment/runtime operation is operations-owned', matches: (intent) => intent.phase === 'operations' && ['deploy', 'modify'].includes(intent.action) },
  // Release readiness -> ship owns
  { id: 'release-readiness', priority: 110, skill: 'showdar-ship', reason: 'release readiness without deployment mutation is shipping-owned', matches: (intent) => intent.phase === 'delivery' && ['assess', 'release', 'review'].includes(intent.action) && intent.mutation === 'read-only' },
  // QA scope -> quality owns
  { id: 'qa-scope', priority: 105, skill: 'showdar-quality', reason: 'explicit QA or regression-scope assessment is quality-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'assess' },
  // Explicit review -> review owns (below security-assessment so a
  // security-scoped review still routes to security)
  { id: 'explicit-review', priority: 100, skill: 'showdar-review', reason: 'explicit review without security scope is review-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'review' },
  // Automated test -> test owns
  { id: 'automated-test', priority: 105, skill: 'showdar-test', reason: 'automated test implementation is test-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'test' },
  // Dependency migration -> upgrade owns
  { id: 'dependency-migration', priority: 110, skill: 'showdar-upgrade', reason: 'dependency or framework migration is upgrade-owned', matches: (intent) => intent.action === 'upgrade' },
  // Git operation -> git owns
  { id: 'git-operation', priority: 120, skill: 'showdar-git', reason: 'repository history operation is Git-owned', matches: (intent) => intent.phase === 'repository' && intent.action === 'git' },
  // Recovery operation -> recover owns
  { id: 'recovery-operation', priority: 120, skill: 'showdar-recover', reason: 'interrupted work reconstruction is recovery-owned', matches: (intent) => intent.phase === 'recovery' && intent.action === 'recover' },
]);

function choosePrimary(ranked, intent) {
  // Apply primary selection rules based on intent semantics
  const applicable = PRIMARY_SELECTION_RULES
    .filter((rule) => rule.matches(intent) && ranked.some((candidate) => candidate.skill === rule.skill))
    .sort((left, right) => right.priority - left.priority || (left.skill < right.skill ? -1 : left.skill > right.skill ? 1 : 0));

  if (applicable.length > 0) {
    const rule = applicable[0];
    const candidate = ranked.find((item) => item.skill === rule.skill);
    if (candidate) {
      // Add the specialization reason to the candidate
      const candidateWithReason = {
        ...candidate,
        reasons: [...candidate.reasons, `specialization: ${rule.reason}`],
      };
      return { candidate: candidateWithReason, rule };
    }
  }

  // Fallback: top-ranked by score
  return { candidate: ranked[0], rule: null };
}

export function buildRoutePlan(intentInput, capabilities = CAPABILITIES) {
  const intent = normalizeIntent(intentInput);
  const ranked = rankCapabilities(intent, capabilities);
  if (ranked.length === 0) throw new Error('At least one capability is required to build a route plan');

  const { candidate: primary, rule } = choosePrimary(ranked, intent);
  const candidates = ranked.map((candidate) => candidateWithMetadata(candidate, intent, primary.skill));
  const advisorCandidates = candidates
    .filter((candidate) => candidate.advisorEligible)
    .sort((left, right) => right.score - left.score || (left.skill < right.skill ? -1 : left.skill > right.skill ? 1 : 0));

  // If a primary selection rule matched, confidence is decisive
  const decisive = rule !== null;

  return {
    primary: {
      skill: primary.skill,
      score: primary.score,
      reasons: primary.reasons, // Use primary directly (includes specialization reason if rule matched)
    },
    advisors: advisorCandidates.slice(0, MAX_ADVISORS).map((candidate) => ({
      skill: candidate.skill,
      score: candidate.score,
      reasons: [...candidate.reasons, ...candidate.advisorReasons],
    })),
    candidates,
    confidence: confidenceFor(primary, ranked, decisive),
  };
}

export const planRoute = buildRoutePlan;
