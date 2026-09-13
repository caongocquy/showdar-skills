// Structural projector barrel (Phase 6F T08; extended T11 with mutation; T12 with constraints)
// Primary → mutation → gates → secondary/metadata land in T14.

import { projectPrimary, projectConservativeIntent } from './primary.js';
import { projectMutation } from './mutation.js';
import { applyConstraintGates } from './constraints.js';

export { projectPrimary, projectConservativeIntent, projectMutation, applyConstraintGates };

export function resolveStructuralIntent(requestFrame) {
  // T11: primary + mutation projection
  const primary = projectPrimary(requestFrame);
  let mutation = projectMutation(requestFrame);
  // T12: apply constraint gates after mutation
  mutation = applyConstraintGates(mutation, requestFrame.constraints);
  return { ...primary, mutation };
}