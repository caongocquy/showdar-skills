// Constraint frames and gates (Phase 6F T12)
// Builds ConstraintFrame[] from clauses + actions, applies reduce-only gates after mutation.

const CONSTRAINT_KINDS = Object.freeze([
  'NO_PUSH',
  'NO_COMMIT',
  'NO_DEPLOY',
  'READ_ONLY',
  'NO_CODE_CHANGE',
  'NO_IMPLEMENTATION',
]);

const MUTATION_LADDER = Object.freeze(['read-only', 'local-write', 'remote-write', 'production-impacting']);

// Constraint kind -> floor mutation class (highest allowed after constraint applied)
const CONSTRAINT_FLOOR = Object.freeze({
  NO_PUSH: 'local-write',      // push is remote-write; forbid push -> max local-write
  NO_COMMIT: 'read-only',      // commit is local-write; forbid commit -> max read-only
  NO_DEPLOY: 'local-write',    // deploy is production-impacting; forbid deploy -> max local-write (per ruling)
  READ_ONLY: 'read-only',      // global read-only
  NO_CODE_CHANGE: 'read-only', // code changes are local-write; forbid -> max read-only
  NO_IMPLEMENTATION: 'read-only', // implementation is local-write; forbid -> max read-only
});

function mutationIndex(mutation) {
  return MUTATION_LADDER.indexOf(mutation);
}

function minMutation(a, b) {
  const ia = mutationIndex(a);
  const ib = mutationIndex(b);
  return ia <= ib ? a : b;
}

function maxMutation(a, b) {
  const ia = mutationIndex(a);
  const ib = mutationIndex(b);
  return ia >= ib ? a : b;
}

/**
 * Extract constraint keywords from clause text.
 * Returns array of { kind, triggerText } found in the clause.
 */
function extractConstraintsFromClause(clause) {
  const constraints = [];
  const text = clause.text.toLowerCase();

  // NO_PUSH: don't push, do not push, avoid pushing, no push, skip push, prevent pushing
  if (/\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\s+push(?:ing)?\b/.test(text)) {
    constraints.push({ kind: 'NO_PUSH', triggerText: 'do not push' });
  }

  // NO_COMMIT: don't commit, do not commit, avoid committing, no commit
  if (/\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\s+commit(?:ting)?\b/.test(text)) {
    constraints.push({ kind: 'NO_COMMIT', triggerText: 'do not commit' });
  }

  // NO_DEPLOY: don't deploy, do not deploy, avoid deploying, no deploy
  if (/\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\s+deploy(?:ing)?\b/.test(text)) {
    constraints.push({ kind: 'NO_DEPLOY', triggerText: 'do not deploy' });
  }

  // READ_ONLY: inspect only, read only, do not modify, no changes, no modifications
  // Also handles "inspect ... only" patterns
  if (/\b(inspect|read)\s+only\b/.test(text) ||
      /\binspect\b.*\bonly\b/.test(text) ||
      /\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\s+(modify|change|edit|write|alter)\b/.test(text) ||
      /\bno\s+(changes?|modifications?)\b/.test(text)) {
    constraints.push({ kind: 'READ_ONLY', triggerText: 'inspect only' });
  }

  // NO_CODE_CHANGE: no code changes, no code modifications
  if (/\bno\s+code\s+(changes?|modifications?)\b/.test(text)) {
    constraints.push({ kind: 'NO_CODE_CHANGE', triggerText: 'no code changes' });
  }

  // NO_IMPLEMENTATION: don't implement, do not implement, avoid implementing
  if (/\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\s+implement(?:ing)?\b/.test(text)) {
    constraints.push({ kind: 'NO_IMPLEMENTATION', triggerText: 'do not implement' });
  }

  // Handle coordination: "do not X or/and Y" -> both verbs constrained
  // Extract all verbs after negation marker (do not/don't/avoid/skip/no/never/prevent/prohibit)
  // that are joined by "or" or "and", and check each against verb families.
  const negationCoordination = text.match(/\b(do not|don't|avoid|skip|no|never|prevent|prohibit)\b(.+?)(?:\.|$)/);
  if (negationCoordination) {
    const afterNegation = negationCoordination[2];
    // Split on " or " or " and " to get individual verbs
    const verbs = afterNegation.split(/\s+(?:or|and)\s+/);
    for (const verb of verbs) {
      const v = verb.trim().toLowerCase();
      // Check each verb against constraint families
      if (/(?:^|\s)push(?:ing)?(?:\s|$)/.test(v)) {
        if (!constraints.some(c => c.kind === 'NO_PUSH')) constraints.push({ kind: 'NO_PUSH', triggerText: 'do not push' });
      }
      if (/(?:^|\s)commit(?:ting)?(?:\s|$)/.test(v)) {
        if (!constraints.some(c => c.kind === 'NO_COMMIT')) constraints.push({ kind: 'NO_COMMIT', triggerText: 'do not commit' });
      }
      if (/(?:^|\s)deploy(?:ing)?(?:\s|$)/.test(v)) {
        if (!constraints.some(c => c.kind === 'NO_DEPLOY')) constraints.push({ kind: 'NO_DEPLOY', triggerText: 'do not deploy' });
      }
      if (/(?:^|\s)implement(?:ing)?(?:\s|$)/.test(v)) {
        if (!constraints.some(c => c.kind === 'NO_IMPLEMENTATION')) constraints.push({ kind: 'NO_IMPLEMENTATION', triggerText: 'do not implement' });
      }
      if (/(?:^|\s)(modify|change|edit|write|alter)(?:\s|$)/.test(v)) {
        if (!constraints.some(c => c.kind === 'READ_ONLY')) constraints.push({ kind: 'READ_ONLY', triggerText: 'do not modify' });
      }
    }
  }

  return constraints;
}

/**
 * Determine scope of a constraint per binding ruling:
 * (a) pronoun (it/this/that) + same-clause action whose surfaceVerb matches the constraint verb family → action:<id>
 * (b) weak markers (avoid/skip/prevent/prohibit) with NO named target → 'global' + _ambiguous flag (emits AMBIGUOUS_CONSTRAINT_SCOPE)
 * (c) same-clause authoritative actions → clause:<id>
 * (d) otherwise 'global'
 * READ_ONLY derived from "only"/"anything" patterns is ALWAYS global (request-wide by nature).
 */
function determineScope(clause, actions, constraintKind) {
  // Find actions in the same clause
  const clauseActions = actions.filter((a) => a.clauseId === clause.id);
  const lowerText = clause.text.toLowerCase();

  // READ_ONLY is ALWAYS global
  if (constraintKind === 'READ_ONLY') {
    return 'global';
  }

  // Check for pronoun "it" or "this" or "that" referring to an action
  const pronounMatch = lowerText.match(/\b(it|this|that)\b/);

  if (pronounMatch && clauseActions.length > 0) {
    // "don't push it" - "it" likely refers to an action in this clause
    const matchingAction = clauseActions.find((a) => {
      const actionMut = getActionBaseMutation(a);
      const constraintFloor = CONSTRAINT_FLOOR[constraintKind];
      // Match if the action's base mutation is at or above the constraint's floor
      // and the surface verb matches the constraint family
      return (mutationIndex(actionMut) >= mutationIndex(constraintFloor)) &&
             ((constraintKind === 'NO_PUSH' && (a.surfaceVerb === 'push' || a.surfaceVerb === 'publish')) ||
              (constraintKind === 'NO_COMMIT' && a.surfaceVerb === 'commit') ||
              (constraintKind === 'NO_DEPLOY' && a.surfaceVerb === 'deploy'));
    });

    if (matchingAction) {
      return `action:${matchingAction.id}`;
    }
  }

  // If constraint is in a clause with authoritative actions, scope to that clause
  if (clauseActions.length > 0) {
    return `clause:${clause.id}`;
  }

  // Check for ambiguous scope markers: weak markers with NO named target
  const ambiguousMarkers = ['avoid', 'skip', 'prevent', 'prohibit'];
  const isAmbiguous = ambiguousMarkers.some((m) => lowerText.includes(m)) && !pronounMatch && clauseActions.length === 0;

  if (isAmbiguous) {
    return 'global:ambiguous';
  }

  return 'global';
}

function getActionBaseMutation(action) {
  if (action.surfaceVerb && SURFACE_BASE_MUTATION[action.surfaceVerb]) {
    return SURFACE_BASE_MUTATION[action.surfaceVerb];
  }
  if (action.canonicalAction && CANONICAL_BASE_MUTATION[action.canonicalAction]) {
    return CANONICAL_BASE_MUTATION[action.canonicalAction];
  }
  return 'read-only';
}

// Surface/base mutation maps (inline to avoid circular import)
const CANONICAL_BASE_MUTATION = Object.freeze({
  understand: 'read-only',
  assess: 'read-only',
  test: 'read-only',
  define: 'read-only',
  git: 'local-write',
  deploy: 'production-impacting',
  recover: 'local-write',
});

const SURFACE_BASE_MUTATION = Object.freeze({
  inspect: 'read-only',
  explain: 'read-only',
  summarize: 'read-only',
  trace: 'read-only',
  map: 'read-only',
  review: 'read-only',
  audit: 'read-only',
  validate: 'read-only',
  verify: 'read-only',
  check: 'read-only',
  evaluate: 'read-only',
  diagnose: 'read-only',
  investigate: 'read-only',
  plan: 'read-only',
  prepare: 'read-only',
  scope: 'read-only',
  outline: 'read-only',
  breakdown: 'read-only',
  estimate: 'read-only',
  commit: 'local-write',
  rebase: 'local-write',
  merge: 'local-write',
  push: 'remote-write',
  publish: 'remote-write',
  'remote-merge': 'remote-write',
  implement: 'local-write',
  fix: 'local-write',
  patch: 'local-write',
  add: 'local-write',
  write: 'local-write',
  modify: 'local-write',
  update: 'local-write',
  refactor: 'local-write',
  create: 'local-write',
  code: 'local-write',
  build: 'local-write',
  develop: 'local-write',
  stage: 'local-write',
  branch: 'local-write',
  recover: 'local-write',
  reconstruct: 'local-write',
  resume: 'local-write',
  replay: 'local-write',
  upgrade: 'local-write',
  deploy: 'production-impacting',
  rollback: 'production-impacting',
  restart: 'production-impacting',
  scale: 'production-impacting',
  rotate: 'production-impacting',
  promote: 'production-impacting',
});

/**
 * Build ConstraintFrame[] from ClauseFrame[] + ActionFrame[].
 * Returns array of { kind, scope, text }.
 * Scope: 'global' | 'clause:<id>' | 'action:<id>'
 * Ambiguous scope signals via _ambiguous flag.
 */
export function buildConstraintFrames(clauses, actions) {
  const constraintFrames = [];

  for (const clause of clauses) {
    const clauseConstraints = extractConstraintsFromClause(clause);

    for (const { kind } of clauseConstraints) {
      const scope = determineScope(clause, actions, kind);
      const isAmbiguous = scope.endsWith(':ambiguous');

      constraintFrames.push({
        kind,
        scope: scope.replace(':ambiguous', ''),
        text: clause.text,
        _ambiguous: isAmbiguous,
      });
    }
  }

  return constraintFrames;
}

/**
 * Apply constraint gates to a mutation class.
 * Reduce-only: never escalates mutation.
 * Per binding ruling: gateOne per applicable constraint FROM THE ORIGINAL mutation,
 * then take the minimum ("most restrictive wins").
 * gateOne = READ_ONLY→'read-only', else min(m, max(oneStepBelow(m), floor(kind)))
 * 
 * @param {string} mutation - current mutation class
 * @param {ConstraintFrame[]} constraintFrames - constraint frames
 * @param {string} [actionId] - optional action ID for scoped constraints
 * @param {ActionFrame[]} [actions] - optional actions array for clause-scoped membership proof
 * @returns {string} gated mutation
 */
export function applyConstraintGates(mutation, constraintFrames, actionId, actions) {
  if (!constraintFrames || constraintFrames.length === 0) {
    return mutation;
  }

  // Filter applicable constraints
  const applicable = constraintFrames.filter((constraint) => {
    if (!actionId) return true;
    if (constraint.scope.startsWith('action:') && constraint.scope !== `action:${actionId}`) {
      return false; // action-scoped to different action
    }
    if (constraint.scope.startsWith('clause:')) {
      // Clause-scoped: bare actionId without actions map → skip clause-scoped (conservative)
      if (!actions) return false;
      // Check if the actionId's clauseId matches the constraint's clause scope
      const constraintClauseId = constraint.scope.replace('clause:', '');
      const action = actions.find(a => a.id === actionId);
      if (!action || action.clauseId !== constraintClauseId) return false;
    }
    return true;
  });

  if (applicable.length === 0) return mutation;

  // Compute gateOne for each applicable constraint FROM THE ORIGINAL mutation, take minimum
  let minGated = mutation;
  for (const constraint of applicable) {
    const floor = CONSTRAINT_FLOOR[constraint.kind];
    if (!floor) continue;

    const currentIdx = mutationIndex(mutation);
    const floorIdx = mutationIndex(floor);

    // READ_ONLY is special: gates everything to read-only immediately
    if (constraint.kind === 'READ_ONLY') {
      return 'read-only';
    }

    // gateOne = min(m, max(oneStepBelow(m), floor(kind)))
    const oneStepBelowIdx = Math.max(0, currentIdx - 1);
    const oneStepBelow = MUTATION_LADDER[oneStepBelowIdx];
    const maxAllowed = maxMutation(oneStepBelow, floor);
    const gated = minMutation(mutation, maxAllowed);
    minGated = minMutation(minGated, gated);
  }

  return minGated;
}