// Structural projector barrel (Phase 6F T08)
// Primary-only wiring at this stage; mutation/secondary/metadata land in T11/T12/T14.

import { projectPrimary, projectConservativeIntent } from './primary.js';

export { projectPrimary, projectConservativeIntent };

export function resolveStructuralIntent(requestFrame) {
  // T08: primary-only projection
  const primary = projectPrimary(requestFrame);
  return primary;
}