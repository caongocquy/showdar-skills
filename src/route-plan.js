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
 * Legacy primary selection rules based on intent semantics (phase, action, evidence).
 * These determine OWNERSHIP of the primary work unit in the legacy path.
 * They do NOT create advisors - advisors come ONLY from secondaryActions.
 * KEPT for legacy diagnostic path (shadow harness, characterization tests) ONLY.
 * Structural runtime (buildThinRoutePlan) does NOT use these rules.
 */
const PRIMARY_SELECTION_RULES = Object.freeze([
  // Security assessment ownership
  { id: 'security-assessment', priority: 120, skill: 'showdar-security', reason: 'explicit security assessment is security-owned', matches: (intent) => intent.risks.includes('security') && ['assess', 'review'].includes(intent.action) && ['discovery', 'verification'].includes(intent.phase) },
  // Unexplained failure -> debug owns diagnosis
  { id: 'unexplained-failure', priority: 115, skill: 'showdar-debug', reason: 'an observed failure with an unknown cause is diagnosis-owned', matches: (intent) => intent.evidence.failureObserved === true && intent.evidence.rootCauseKnown === false && ['diagnosis', 'implementation'].includes(intent.phase) },
  // Known cause fix -> build owns (legacy parity: fix with known cause routes to build)
  { id: 'known-cause-fix', priority: 115, skill: 'showdar-build', reason: 'fix with known cause is implementation-owned', matches: (intent) => intent.phase === 'implementation' && intent.action === 'fix' && intent.evidence.rootCauseKnown === true },
  // Known implementation cause -> build owns
  { id: 'known-implementation-cause', priority: 110, skill: 'showdar-build', reason: 'a known cause with defined behavior is implementation-owned', matches: (intent) => intent.phase === 'implementation' && ['implement', 'modify', 'fix'].includes(intent.action) && intent.evidence.rootCauseKnown === true && intent.evidence.behaviorDefined === true },
  // Deployment operation -> ops owns
  { id: 'deployment-operation', priority: 120, skill: 'showdar-ops', reason: 'explicit deployment/runtime operation is operations-owned', matches: (intent) => intent.phase === 'operations' && ['deploy', 'modify'].includes(intent.action) },
  // Release readiness -> ship owns
  { id: 'release-readiness', priority: 110, skill: 'showdar-ship', reason: 'release readiness without deployment mutation is shipping-owned', matches: (intent) => intent.phase === 'delivery' && ['assess', 'release', 'review'].includes(intent.action) && intent.mutation === 'read-only' },
  // QA scope -> quality owns
  { id: 'qa-scope', priority: 105, skill: 'showdar-quality', reason: 'explicit QA or regression-scope assessment is quality-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'assess' && !intent.risks.includes('security') },
  // QA regression matrix / test scope -> quality owns (higher than automated-test)
  // Only for explicit QA/matrix scope: verification/test + regression risk + repository object
  // (repository is the canonical object for "QA regression matrix", "regression matrix")
  { id: 'qa-test-scope', priority: 110, skill: 'showdar-quality', reason: 'QA regression matrix or test scope is quality-owned', matches: (intent) => intent.phase === 'verification' && intent.action === 'test' && intent.object === 'repository' && intent.risks?.includes('regression') },
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
  // Rules are authoritative - they determine primary unconditionally when matched
  const applicable = PRIMARY_SELECTION_RULES
    .filter((rule) => rule.matches(intent))
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
    // Rule matched but skill not in candidates - this shouldn't happen but handle gracefully
  }

  // Fallback: top-ranked by score (only when NO rules match)
  return { candidate: ranked[0], rule: null };
}

/**
 * Legacy route plan with scoring and primary selection rules.
 * Used ONLY for diagnostic/comparison (shadow harness, characterization tests).
 * NOT used by the structural runtime.
 */
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

// Thin deterministic structural route path (Phase 6F T17; T20 primaryCapability routing, spec §8A).
// Structural path: internal primaryCapability → primary skill via CAPABILITY_TO_SKILL
// + secondaryActions → advisor map (SECONDARY_ACTION_SKILLS, deduplicated, primary excluded, capped at MAX_ADVISORS).
// Zero scoring, zero PRIMARY_SELECTION_RULES, zero risk/object/evidence re-selection.
// risks, object, and evidence are never consulted on this path.
// Legacy-compat path (no routingMeta): REMOVED in T21. Structural runtime MUST provide primaryCapability.
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