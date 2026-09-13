// Primary projector (Phase 6F T08)
// Projects phase/action EXCLUSIVELY from positive AUTHORIZED_NOW GOVERNING frame
// via lookupSurfaceOperation; phase via canonical action->phase mapping.
// No numeric scoring. No risk/object keyword imports.

import { lookupSurfaceOperation } from '../surface-map.js';

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

function canonicalActionToPhase(canonicalAction) {
  return ACTION_TO_PHASE[canonicalAction] || 'discovery';
}

export function projectPrimary(requestFrame) {
  const governing = findGoverningAction(requestFrame);
  if (!governing) {
    return { phase: 'discovery', action: 'assess' };
  }
  // Canonical action originates from the surface map at framing time; re-derive
  // via lookup when the surface verb is known, else trust the frame's canonical.
  const action = lookupSurfaceOperation(governing.surfaceVerb)?.canonicalAction
    ?? governing.canonicalAction;
  if (!action) {
    return { phase: 'discovery', action: 'assess' };
  }
  return { phase: canonicalActionToPhase(action), action };
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