// Structural projector barrel (Phase 6F T08; extended T11 with mutation)
// Primary + mutation wiring; secondary/metadata land in T14.

import { projectPrimary, projectConservativeIntent } from './primary.js';
import { projectMutation } from './mutation.js';

export { projectPrimary, projectConservativeIntent, projectMutation };

export function resolveStructuralIntent(requestFrame) {
  // T11: primary + mutation projection
  const primary = projectPrimary(requestFrame);
  const mutation = projectMutation(requestFrame);
  return { ...primary, mutation };
}