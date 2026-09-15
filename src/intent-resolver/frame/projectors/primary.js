// Primary projector (Phase 6F T08; extended with internal primaryCapability)
// Projects phase/action/primaryCapability EXCLUSIVELY from positive
// AUTHORIZED_NOW GOVERNING frame via lookupSurfaceOperation; phase from surface
// map semanticCapability when available, else via canonical action->phase mapping.
// primaryCapability is INTERNAL routing metadata (never part of public Intent):
// it derives ONLY from the governing frame's semanticCapability/canonicalAction.
// No numeric scoring. No risk/object keyword imports.

import { lookupSurfaceOperation } from '../surface-map.js';

// Canonical action -> internal routing capability. Mirrors the thin
// capability->skill table in route-plan.js; security-assessment arrives via
// the governing frame's semanticCapability (never via risks).
const ACTION_TO_PRIMARY_CAPABILITY = Object.freeze({
  understand: 'understand',
  define: 'requirements',
  plan: 'plan',
  design: 'design',
  implement: 'implement',
  fix: 'implement',
  modify: 'implement',
  upgrade: 'upgrade',
  investigate: 'debug',
  test: 'test',
  review: 'review',
  assess: 'quality',
  deploy: 'ops',
  git: 'git',
  release: 'ship',
  recover: 'recover',
});

const ACTION_TO_PHASE = Object.freeze({
  understand: 'discovery',
  assess: 'verification',
  plan: 'planning',
  design: 'design',
  implement: 'implementation',
  fix: 'implementation',
  test: 'verification',
  quality: 'verification',
  upgrade: 'implementation',
  deploy: 'operations',
  investigate: 'diagnosis',
  recover: 'recovery',
  git: 'repository',
  release: 'delivery',
  define: 'definition',
  review: 'verification',
});

function findGoverningAction(requestFrame) {
  if (!requestFrame || !Array.isArray(requestFrame.actions)) return null;
  // Positive AUTHORIZED_NOW with GOVERNING role
  return requestFrame.actions.find(
    (a) => a.role === 'GOVERNING' &&
           a.polarity === 'positive' &&
           a.commitment === 'AUTHORIZED_NOW'
  );
}

const UNKNOWN_CAUSE_PATTERNS = Object.freeze([
  /\b(i don'?t know|i dont know|unknown cause|unknown reason|cause unknown|reason unknown|unclear why|not sure why|mystery|unknown origin)\b/i,
]);

function hasUnknownCauseInContext(requestFrame) {
  if (!requestFrame) return false;
  // Check all context frames for unknown cause language
  if (Array.isArray(requestFrame.contexts)) {
    if (requestFrame.contexts.some(ctx => UNKNOWN_CAUSE_PATTERNS.some(p => p.test(ctx.text)))) {
      return true;
    }
  }
  // Also check original text for unknown cause language
  if (requestFrame.originalText && UNKNOWN_CAUSE_PATTERNS.some(p => p.test(requestFrame.originalText))) {
    return true;
  }
  return false;
}

function hasFailureInLogOutput(requestFrame) {
  if (!requestFrame || !Array.isArray(requestFrame.contexts)) return false;
  const logFrames = requestFrame.contexts.filter(f => f.kind === 'LOG_OUTPUT');
  // Reuse the same failure patterns from metadata (simplified here)
  const failurePatterns = [
    /\b(fails?|crashes?|errors?|is\s+failing|is\s+broken|is\s+down|connection\s+refused|timeout|network\s+error|exit\s+\d+|exited\s+with\s+status\s+\d+)\b/i,
  ];
  return logFrames.some(ctx => failurePatterns.some(p => p.test(ctx.text)));
}

function canonicalActionToPhase(canonicalAction) {
  return ACTION_TO_PHASE[canonicalAction] || 'discovery';
}

// Surface semanticCapability -> canonical phase. Surface map uses finer-grained
// semantics (understanding, requirements, testing, assessment, deployment,
// git-op) than the frozen Intent phase taxonomy; map them explicitly.
// 'assessment' defaults to discovery (threat-model, audit-security fixtures);
// delivery-scoped assess verbs already carry semanticCapability='delivery'.
const SEMANTIC_TO_PHASE = Object.freeze({
  understanding: 'discovery',
  requirements: 'definition',
  planning: 'planning',
  design: 'design',
  implementation: 'implementation',
  diagnosis: 'diagnosis',
  testing: 'verification',
  verification: 'verification',
  assessment: 'discovery',
  deployment: 'operations',
  operations: 'operations',
  'git-op': 'repository',
  delivery: 'delivery',
  recovery: 'recovery',
});

function primaryCapabilityFor(governing, phase, action) {
  // Security-assessment scope lives on the governing frame itself; it is the
  // only capability that does not follow the canonical-action mapping.
  if (governing?.semanticCapability === 'security-assessment') return 'security-assessment';
  // Delivery-scoped assess (readiness) ships; verification-scoped assess is quality.
  if (action === 'assess' && phase === 'delivery') return 'ship';
  return ACTION_TO_PRIMARY_CAPABILITY[action] ?? 'review';
}

export function projectPrimary(requestFrame) {
  const governing = findGoverningAction(requestFrame);
  if (!governing) {
    // Infer diagnosis/investigate from LOG_OUTPUT with failure + unknown cause in any context
    if (hasFailureInLogOutput(requestFrame) && hasUnknownCauseInContext(requestFrame)) {
      return { phase: 'diagnosis', action: 'investigate', primaryCapability: 'debug' };
    }
    return { phase: 'discovery', action: 'assess', primaryCapability: 'review' };
  }
  // Canonical action: the governing frame wins ONLY on genuine framing-time
  // divergence (security scope, test authorship, requirements deficit, matrix
  // quality), detected as a semanticCapability the bare-verb lookup would not
  // produce. Otherwise the lookup normalizes (also covering synthetic frames
  // without a stored capability). A bare-verb re-lookup must never discard
  // clause context captured at framing time.
  const lookup = lookupSurfaceOperation(governing.surfaceVerb);
  const frameCapability = governing.semanticCapability;
  const framedOverride = frameCapability && lookup?.semanticCapability && frameCapability !== lookup.semanticCapability;
  let action = framedOverride ? governing.canonicalAction : (lookup?.canonicalAction ?? governing.canonicalAction);
  if (!action) {
    return { phase: 'discovery', action: 'assess', primaryCapability: 'review' };
  }
  // Use semanticCapability from surface map as phase when available (more precise
  // than canonicalAction->phase mapping which can be ambiguous, e.g., 'assess'
  // appears in both verification and delivery). Fallback to canonical mapping.
  // Phase uses the lookup capability (pre-promotion value) so a
  // security-assessment scope assigned at framing time never shifts phase;
  // routing scope travels via primaryCapability instead.
  const phaseCapability = lookup?.semanticCapability ?? governing.semanticCapability;
  let phase = phaseCapability ? SEMANTIC_TO_PHASE[phaseCapability] ?? canonicalActionToPhase(action) : canonicalActionToPhase(action);

  // Special case: when defining QA/regression/testing artifacts, treat as verification/test
  if (action === 'define' && governing.target) {
    const targetLower = governing.target.toLowerCase();
    if (targetLower.includes('qa') || targetLower.includes('regression') || targetLower.includes('test') || targetLower.includes('matrix')) {
      phase = 'verification';
      action = 'test';
    }
  }

  return { phase, action, primaryCapability: primaryCapabilityFor(governing, phase, action) };
}

export function projectConservativeIntent(diagnostics) {
  // Read-only discovery/verification intent with no secondaries
  return {
    phase: 'discovery',
    action: 'assess',
    secondaryActions: [],
    object: 'unknown',
    risks: [],
    mutation: 'read-only',
    evidence: {
      rootCauseKnown: null,
      behaviorDefined: null,
      failureObserved: null,
    },
  };
}