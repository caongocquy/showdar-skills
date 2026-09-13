// Metadata projector (Phase 6F T14)
// Authority-free derivations for informational fields ONLY.
// This module MUST NOT be imported by primary/mutation/secondary/constraints modules.
// Output never feeds authority decisions.

const RISK_VERBS = Object.freeze(new Set([
  'deploy', 'push', 'promote', 'rollback', 'restart', 'scale', 'rotate',
  'migrate', 'upgrade', 'patch', 'modify', 'update', 'fix',
]));

const RISK_ENVS = Object.freeze(new Set(['production', 'remote']));

const SECURITY_VERBS = Object.freeze(new Set([
  'audit', 'threat-model', 'penetration', 'pentest', 'security',
]));

function hasProductionRisk(actions) {
  return actions.some(a =>
    (a.environment === 'production' || a.environment === 'remote') &&
    (RISK_VERBS.has(a.surfaceVerb?.toLowerCase()) || RISK_VERBS.has(a.canonicalAction))
  );
}

function hasSecurityRisk(actions) {
  return actions.some(a =>
    SECURITY_VERBS.has(a.surfaceVerb?.toLowerCase()) ||
    SECURITY_VERBS.has(a.canonicalAction)
  );
}

export function deriveRisks(frames) {
  if (!frames || !Array.isArray(frames)) return [];

  const risks = new Set();
  const actions = frames.filter(f => f.role === 'GOVERNING' || f.role === 'ORTHOGONAL' || f.role === 'SUPPORTING');

  if (hasProductionRisk(actions)) risks.add('production');
  if (hasSecurityRisk(actions)) risks.add('security');
  if (actions.some(a => a.canonicalAction === 'test' || a.canonicalAction === 'quality')) risks.add('quality');
  if (actions.some(a => a.canonicalAction === 'git')) risks.add('repository');
  if (actions.some(a => a.canonicalAction === 'deploy' || a.canonicalAction === 'operations')) risks.add('operations');

  return Array.from(risks).sort();
}

// Evidence no-inference rule:
// fix/repair/resolve alone NEVER imply rootCauseKnown: true
// Require explicit cause language (e.g., "caused by", "due to", "root cause")
// Unknown-cause language -> rootCauseKnown: false

const CAUSE_KEYWORDS = Object.freeze([
  'caused by', 'due to', 'root cause', 'because of', 'originated from',
  'stemming from', 'triggered by', 'result of', 'resulted from',
]);

const UNKNOWN_CAUSE_KEYWORDS = Object.freeze([
  'unknown cause', 'unknown reason', 'cause unknown', 'reason unknown',
  'unclear why', 'not sure why', 'mystery', 'unknown origin',
]);

const FAILURE_KEYWORDS = Object.freeze([
  'failure', 'error', 'crash', 'bug', 'issue', 'problem', 'incident',
  'outage', 'downtime', 'broken', 'failing', 'failed',
]);

const BEHAVIOR_DEFINED_KEYWORDS = Object.freeze([
  'spec', 'specification', 'requirement', 'expected behavior', 'expected result',
  'acceptance criteria', 'behavior defined', 'defined behavior',
]);

function hasCauseLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return CAUSE_KEYWORDS.some(kw => lower.includes(kw));
}

function hasUnknownCauseLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return UNKNOWN_CAUSE_KEYWORDS.some(kw => lower.includes(kw));
}

function hasFailureLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return FAILURE_KEYWORDS.some(kw => lower.includes(kw));
}

function hasBehaviorDefinedLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return BEHAVIOR_DEFINED_KEYWORDS.some(kw => lower.includes(kw));
}

export function deriveEvidence(frames) {
  if (!frames || !Array.isArray(frames)) {
    return { rootCauseKnown: null, behaviorDefined: null, failureObserved: null };
  }

  // Only consider GOVERNING action for evidence
  const governing = frames.find(f => f.role === 'GOVERNING');
  if (!governing) {
    return { rootCauseKnown: null, behaviorDefined: null, failureObserved: null };
  }

  const target = governing.target || '';

  // Evidence no-inference rule: fix/repair/resolve alone NEVER imply rootCauseKnown
  const isFixLike = ['fix', 'repair', 'resolve'].includes(governing.canonicalAction);

  let rootCauseKnown = null;
  if (isFixLike) {
    // fix/repair/resolve alone -> false unless explicit cause language
    if (hasCauseLanguage(target)) {
      rootCauseKnown = true;
    } else if (hasUnknownCauseLanguage(target)) {
      rootCauseKnown = false;
    } else {
      // fix/repair/resolve alone, no cause language -> false (no inference)
      rootCauseKnown = false;
    }
  } else if (hasCauseLanguage(target)) {
    rootCauseKnown = true;
  } else if (hasUnknownCauseLanguage(target)) {
    rootCauseKnown = false;
  }

  let behaviorDefined = null;
  if (hasBehaviorDefinedLanguage(target)) {
    behaviorDefined = true;
  }

  let failureObserved = null;
  if (hasFailureLanguage(target)) {
    failureObserved = true;
  }

  return { rootCauseKnown, behaviorDefined, failureObserved };
}

export function deriveObject(frames) {
  if (!frames || !Array.isArray(frames)) return 'unknown';

  // First GOVERNING action's target
  const governing = frames.find(f => f.role === 'GOVERNING');
  if (governing && governing.target) {
    return governing.target;
  }

  // Fallback: first action with target
  for (const action of frames) {
    if (action.target) return action.target;
  }

  return 'unknown';
}