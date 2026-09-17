// T02 compat layer: re-exports the adjudicator's public authority API.
// Owns no brand, no WeakSet, no factory, and defines no authority logic;
// the adjudicator module is the sole construction point (design §18A/§19).
export {
  assertAuthorized,
  assertAdjudicated,
  contextual,
  negated,
  conditional,
  hypothetical,
  unresolved,
  isAuthorizedBrand,
  adjudicate,
} from './adjudicator.js';
