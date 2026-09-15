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
  // Multi-intent upgrade+test -> build owns (upgrade with test secondary means implement)
  // REMOVED: This legacy rule contradicts semantic contract. Upgrade with orthogonal test
  // secondary should remain upgrade-owned per structural intent (test is orthogonal, not governing).
  // { id: 'upgrade-with-test', priority: 118, skill: 'showdar-build', reason: 'upgrade with test secondary is implementation-owned', matches: (intent) => intent.action === 'upgrade' && intent.secondaryActions.includes('test') },
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

// Thin deterministic route path (Phase 6F T17; extended with internal
// primaryCapability routing in T20, spec §8A).
// Structural path: internal primaryCapability → primary skill deterministic
// table + secondaryActions → advisor map (SECONDARY_ACTION_SKILLS,
// deduplicated, primary excluded, capped at MAX_ADVISORS). Zero scoring,
// zero PRIMARY_SELECTION_RULES, zero risk/object/evidence re-selection —
// risks, object, and evidence are never consulted on this path.
// Legacy-compat path (no routingMeta): canonical Intent phase/action lookup
// preserved for characterization tests; never used by the structural runtime.
// discovery/understand → showdar-understand is hard-coded here because the
// legacy path reaches it only via scoring fallback.
// Legacy path (buildRoutePlan and all selection rules) is byte-identical.
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
const THIN_PRIMARY_MAP = Object.freeze({
  'implementation:implement': 'showdar-build',
  'implementation:fix': 'showdar-build',
  'implementation:modify': 'showdar-build',
  'diagnosis:investigate': 'showdar-debug',
  'verification:test': 'showdar-test',
  'verification:review': 'showdar-review',
  'verification:assess': 'showdar-quality',
  'operations:deploy': 'showdar-ops',
  'delivery:assess': 'showdar-ship',
  'delivery:release': 'showdar-ship',
  'delivery:review': 'showdar-ship',
  'recovery:recover': 'showdar-recover',
  'repository:git': 'showdar-git',
  'implementation:upgrade': 'showdar-upgrade',
  'discovery:assess': 'showdar-review',
  'discovery:review': 'showdar-review',
  'planning:plan': 'showdar-plan',
  'design:design': 'showdar-design',
  'definition:define': 'showdar-requirements',
});

function thinPrimaryFor(intent) {
  if (intent.phase === 'discovery' && intent.action === 'understand') return 'showdar-understand';
  // Security assessment in discovery/verification -> security
  if (intent.risks?.includes('security') && ['discovery', 'verification'].includes(intent.phase) && ['assess', 'review'].includes(intent.action)) {
    return 'showdar-security';
  }
  // QA regression matrix / test scope -> quality (legacy keyword mapping alignment)
  // Only for explicit QA/matrix scope: verification/test + regression risk + repository object
  // (repository is the canonical object for "QA regression matrix", "regression matrix")
  if (intent.phase === 'verification' && intent.action === 'test' && intent.object === 'repository' && intent.risks?.includes('regression')) {
    return 'showdar-quality';
  }
  // ponytail: key lookup only; no scoring fallback, unknown Intent surfaces as explicit error.
  const key = `${intent.phase}:${intent.action}`;
  const skill = THIN_PRIMARY_MAP[key];
  if (!skill) throw new Error(`No thin route mapping for intent (phase ${intent.phase}, action ${intent.action})`);
  return skill;
}

export function buildThinRoutePlan(intentInput, routingMeta) {
  const intent = normalizeIntent(intentInput);
  // Structural authoritative path (spec §8A): the governing frame's internal
  // primaryCapability decides. This branch consults nothing else — no risks,
  // no object, no evidence, no selection rules.
  const capability = routingMeta?.primaryCapability;
  if (typeof capability === 'string' && CAPABILITY_TO_SKILL[capability]) {
    const skill = CAPABILITY_TO_SKILL[capability];
    const advisors = [];
    for (const action of intent.secondaryActions) {
      const advisor = SECONDARY_ACTION_SKILLS[action] ?? (action.startsWith('showdar-') ? action : null);
      if (advisor && advisor !== skill && !advisors.includes(advisor) && advisors.length < MAX_ADVISORS) advisors.push(advisor);
    }
    return { primary: { skill }, advisors };
  }
  const skill = thinPrimaryFor(intent);
  const advisors = [];
  for (const action of intent.secondaryActions) {
    const advisor = SECONDARY_ACTION_SKILLS[action] ?? (action.startsWith('showdar-') ? action : null);
    if (advisor && advisor !== skill && !advisors.includes(advisor) && advisors.length < MAX_ADVISORS) advisors.push(advisor);
  }
  return { primary: { skill }, advisors };
}
