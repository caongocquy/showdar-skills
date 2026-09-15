// Mutation projector (Phase 6F T11)
// Computes mutation from authorized frames via contributor table:
// - GOVERNING AUTHORIZED_NOW: contributes base mutation
// - SUPPORTING AUTHORIZED_NOW: capped by governing ceiling on read-only < local-write < remote-write < production-impacting
// - ORTHOGONAL AUTHORIZED_NOW: contributes independently
// - CONDITIONAL/HYPOTHETICAL/CONTEXTUAL/NEGATED: contribute nothing
// Environment qualifier NEVER manufactures write authority (inspect+production→read-only; deploy+production→production-impacting)

const MUTATION_LADDER = Object.freeze(['read-only', 'local-write', 'remote-write', 'production-impacting']);

// Canonical action -> base mutation class
// Complete over the canonical taxonomy: compound surface verbs (implement-oauth,
// fix-login, upgrade-dependency, design-system) miss the surface table and must
// resolve here rather than falling through to read-only.
const CANONICAL_BASE_MUTATION = Object.freeze({
  understand: 'read-only',
  assess: 'read-only',
  test: 'read-only',
  define: 'read-only',
  review: 'read-only',
  investigate: 'read-only',
  plan: 'read-only',
  implement: 'local-write',
  modify: 'local-write',
  upgrade: 'local-write',
  design: 'local-write',    // design artifacts (mockups, layouts) are local writes
  git: 'local-write',      // commit, rebase, merge are local-write
  deploy: 'production-impacting',
  recover: 'local-write',   // recovery/restoration
  fix: 'local-write',       // fix/repair are local-write
});

// Surface verb -> base mutation (more specific than canonical)
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
  migrate: 'local-write',
  deploy: 'production-impacting',
  rollback: 'production-impacting',
  restart: 'production-impacting',
  scale: 'production-impacting',
  rotate: 'production-impacting',
  promote: 'production-impacting',
  // Test authoring verbs (writing tests is local-write)
  'add-unit-coverage': 'local-write',
  'write-integration-tests': 'local-write',
  'write-unit-tests': 'local-write',
  'create-unit-tests': 'local-write',
  'add-integration-tests': 'local-write',
  'create-integration-tests': 'local-write',
  'add-regression-tests': 'local-write',
  'write-regression-tests': 'local-write',
  'create-regression-tests': 'local-write',
  'add-tests': 'local-write',
  'write-tests': 'local-write',
  'create-tests': 'local-write',
});

function mutationIndex(mutation) {
  return MUTATION_LADDER.indexOf(mutation);
}

function maxMutation(a, b) {
  const ia = mutationIndex(a);
  const ib = mutationIndex(b);
  return ia >= ib ? a : b;
}

function minMutation(a, b) {
  const ia = mutationIndex(a);
  const ib = mutationIndex(b);
  return ia <= ib ? a : b;
}

function getBaseMutation(action) {
  // Use surface verb for precision, fallback to canonical action
  if (action.surfaceVerb && SURFACE_BASE_MUTATION[action.surfaceVerb]) {
    return SURFACE_BASE_MUTATION[action.surfaceVerb];
  }
  if (action.canonicalAction && CANONICAL_BASE_MUTATION[action.canonicalAction]) {
    return CANONICAL_BASE_MUTATION[action.canonicalAction];
  }
  return 'read-only';
}

function applyEnvironmentQualifier(baseMutation, action) {
  // Environment NEVER manufactures write authority
  // read-only actions stay read-only regardless of environment
  if (baseMutation === 'read-only') {
    return 'read-only';
  }

  // Only actions with inherent write authority can be qualified by environment
  const env = action.environment;

  if (env === 'production') {
    // deploy + production -> production-impacting (already is)
    // Other write actions on production -> production-impacting
    if (action.canonicalAction === 'deploy') {
      return 'production-impacting';
    }
    // git push to production branch could be production-impacting
    if (action.canonicalAction === 'git' && action.surfaceVerb === 'push') {
      return 'production-impacting';
    }
    // Other write actions on production become production-impacting
    if (mutationIndex(baseMutation) >= mutationIndex('local-write')) {
      return 'production-impacting';
    }
  }

  if (env === 'remote' || env === 'staging') {
    // deploy to staging/remote -> remote-write
    if (action.canonicalAction === 'deploy') {
      return 'remote-write';
    }
    // git push to remote -> remote-write
    if (action.canonicalAction === 'git' && action.surfaceVerb === 'push') {
      return 'remote-write';
    }
    // Other write actions on remote stay at their base or remote-write
    if (mutationIndex(baseMutation) >= mutationIndex('remote-write')) {
      return baseMutation;
    }
    // Local-write actions on remote become remote-write
    return 'remote-write';
  }

  if (env === 'local') {
    // Local environment - no escalation
    return baseMutation;
  }

  // unspecified - no escalation
  return baseMutation;
}

function isContributor(action) {
  // Must be AUTHORIZED_NOW
  if (action.commitment !== 'AUTHORIZED_NOW') return false;
  // Must be positive polarity
  if (action.polarity !== 'positive') return false;
  // Must not be CONDITIONAL, HYPOTHETICAL, CONTEXTUAL
  if (action.role === 'CONDITIONAL' || action.role === 'HYPOTHETICAL' || action.role === 'CONTEXTUAL') return false;
  return true;
}

function getContributorMutation(action, governingMutation) {
  if (!isContributor(action)) return null;

  const baseMutation = getBaseMutation(action);
  const envMutation = applyEnvironmentQualifier(baseMutation, action);

  // Apply supporting ceiling
  if (action.role === 'SUPPORTING') {
    return minMutation(envMutation, governingMutation);
  }

  // GOVERNING and ORTHOGONAL contribute their full env-qualified mutation
  return envMutation;
}

export function projectMutation(requestFrame) {
  if (!requestFrame || !Array.isArray(requestFrame.actions)) {
    return 'read-only';
  }

  const actions = requestFrame.actions;

  // Find GOVERNING action to establish ceiling
  const governingAction = actions.find(
    (a) => a.role === 'GOVERNING' &&
           a.polarity === 'positive' &&
           a.commitment === 'AUTHORIZED_NOW'
  );

  const governingMutation = governingAction
    ? applyEnvironmentQualifier(getBaseMutation(governingAction), governingAction)
    : 'read-only';

  // Collect mutations from all contributors
  let finalMutation = 'read-only';

  for (const action of actions) {
    const contribMutation = getContributorMutation(action, governingMutation);
    if (contribMutation) {
      finalMutation = maxMutation(finalMutation, contribMutation);
    }
  }

  return finalMutation;
}