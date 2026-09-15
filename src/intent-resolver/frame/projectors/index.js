// Structural projector barrel (Phase 6F T08; extended T11 with mutation; T12 with constraints; T14 secondaries+metadata)
// Primary → mutation → gates → secondaries → metadata

import { projectPrimary, projectConservativeIntent } from './primary.js';
import { projectMutation } from './mutation.js';
import { applyConstraintGates } from './constraints.js';
import { projectSecondaries } from './secondary.js';
import { deriveRisks, deriveEvidence, deriveObject, deriveObjectWithContext } from './metadata.js';

export { projectPrimary, projectConservativeIntent, projectMutation, applyConstraintGates, projectSecondaries, deriveRisks, deriveEvidence, deriveObject, deriveObjectWithContext };

export function resolveStructuralIntent(requestFrame) {
  // Primary → mutation → gates → secondaries → metadata
  const primary = projectPrimary(requestFrame);
  // primaryCapability is INTERNAL routing metadata (spec §8A): it must never
  // leak into the public Intent object (validateIntent rejects unknown keys).
  // Consumers needing authoritative routing read it via projectPrimary or
  // resolvePrimaryCapability on the same RequestFrame.
  const { primaryCapability, ...publicPrimary } = primary;
  let mutation = projectMutation(requestFrame);
  mutation = applyConstraintGates(mutation, requestFrame.constraints);
  const secondaryActions = projectSecondaries(requestFrame, primary.action);
  // deriveEvidence needs access to LOG_OUTPUT context frames for failure detection
  const evidence = deriveEvidence(requestFrame.actions, requestFrame.contexts);
  const risks = deriveRisks(requestFrame.actions, requestFrame.contexts, requestFrame.clauses);
  const object = deriveObjectWithContext(requestFrame.actions, requestFrame.contexts);
  return { ...publicPrimary, mutation, secondaryActions, risks, evidence, object };
}

// Internal routing capability for the structural path (spec §8A).
// Pure re-derivation from the same GOVERNING frame; deterministic.
export function resolvePrimaryCapability(requestFrame) {
  return projectPrimary(requestFrame).primaryCapability ?? 'review';
}
