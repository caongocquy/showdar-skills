// Structural projector barrel (Phase 6F T08; extended T11 with mutation; T12 with constraints; T14 secondaries+metadata)
// Primary → mutation → gates → secondaries → metadata

import { projectPrimary, projectConservativeIntent } from './primary.js';
import { projectMutation } from './mutation.js';
import { applyConstraintGates } from './constraints.js';
import { projectSecondaries } from './secondary.js';
import { deriveRisks, deriveEvidence, deriveObject } from './metadata.js';

export { projectPrimary, projectConservativeIntent, projectMutation, applyConstraintGates, projectSecondaries, deriveRisks, deriveEvidence, deriveObject };

export function resolveStructuralIntent(requestFrame) {
  // Primary → mutation → gates → secondaries → metadata
  const primary = projectPrimary(requestFrame);
  let mutation = projectMutation(requestFrame);
  mutation = applyConstraintGates(mutation, requestFrame.constraints);
  const secondaryActions = projectSecondaries(requestFrame, primary.action);
  const risks = deriveRisks(requestFrame.actions);
  const evidence = deriveEvidence(requestFrame.actions);
  const object = deriveObject(requestFrame.actions);
  return { ...primary, mutation, secondaryActions, risks, evidence, object };
}
