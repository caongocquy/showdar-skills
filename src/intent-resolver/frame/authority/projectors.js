// T12 typed authority projectors (shadow/non-authoritative, no production wiring).
// Owned frozen taxonomy tables; no imports from 6F projectors or surface scoring.
import { assertAuthorized } from './adjudicator.js';
import { lookupSurfaceOperation } from '../surface-map.js';

const FALLBACK_PRIMARY = Object.freeze({
  phase: 'discovery',
  action: 'understand',
  primaryCapability: 'understand',
});

// Semantic capability (as carried on the authorized candidate) -> Intent phase.
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
  'security-assessment': 'discovery',
  deployment: 'operations',
  operations: 'operations',
  'git-op': 'repository',
  delivery: 'delivery',
  recovery: 'recovery',
});

// Canonical action -> Intent phase (used only when the semantic table misses).
const CANONICAL_TO_PHASE = Object.freeze({
  understand: 'discovery',
  assess: 'verification',
  plan: 'planning',
  design: 'design',
  implement: 'implementation',
  fix: 'implementation',
  test: 'verification',
  upgrade: 'implementation',
  deploy: 'operations',
  investigate: 'diagnosis',
  recover: 'recovery',
  git: 'repository',
  release: 'delivery',
  define: 'definition',
  review: 'verification',
});

// Surface-map semantic capability -> internal routing capability. The candidate
// capability is authority-semantic (firewall rule); the surface taxonomy uses
// finer-grained names (testing, verification, deployment, git-op) than the
// routable capability set, so normalize here. Canonical mapping below is the
// fallback when the semantic table misses.
const SEMANTIC_TO_CAPABILITY = Object.freeze({
  testing: 'test',
  verification: 'review',
  deployment: 'ops',
  operations: 'ops',
  'git-op': 'git',
});

// Canonical action -> internal routing capability.
const CANONICAL_TO_CAPABILITY = Object.freeze({
  understand: 'understand',
  define: 'requirements',
  plan: 'plan',
  design: 'design',
  implement: 'implement',
  fix: 'implement',
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

export function projectPrimary6G(governing) {
  if (governing == null) return FALLBACK_PRIMARY;
  assertAuthorized(governing);
  // Brand was asserted first: this re-lookup is taxonomy normalization ONLY
  // (surface -> canonical action). It never decides authority or role.
  const canonical = lookupSurfaceOperation(governing.candidate.surface)?.canonicalAction;
  if (!canonical) return FALLBACK_PRIMARY;
  const phase = SEMANTIC_TO_PHASE[governing.candidate.capability]
    ?? CANONICAL_TO_PHASE[canonical]
    ?? FALLBACK_PRIMARY.phase;
  // Candidate capability is authority-semantic (firewall rule): normalize it
  // to the routable set first. Delivery-scoped assess (release readiness)
  // ships; verification-scoped assess is quality. Canonical mapping is the
  // fallback when the semantic table misses.
  const candidateCapability = governing.candidate.capability;
  const primaryCapability = candidateCapability === 'security-assessment'
    ? 'security-assessment'
    : (SEMANTIC_TO_CAPABILITY[candidateCapability]
      ?? (canonical === 'assess' && candidateCapability === 'delivery'
        ? 'ship'
        : (CANONICAL_TO_CAPABILITY[canonical] ?? FALLBACK_PRIMARY.primaryCapability)));
  return Object.freeze({ phase, action: canonical, primaryCapability });
}

// Canonical action -> base mutation class (CANONICAL mirror; default read-only).
const CANONICAL_BASE_MUTATION = Object.freeze({
  understand: 'read-only',
  assess: 'read-only',
  test: 'read-only',
  define: 'read-only',
  review: 'read-only',
  investigate: 'read-only',
  implement: 'local-write',
  fix: 'local-write',
  upgrade: 'local-write',
  design: 'local-write',
  git: 'local-write',
  recover: 'local-write',
  deploy: 'production-impacting',
});

const MUTATION_LADDER = Object.freeze(['read-only', 'local-write', 'remote-write', 'production-impacting']);

function mutationIndex(mutation) {
  return MUTATION_LADDER.indexOf(mutation);
}

function maxMutation(a, b) {
  return mutationIndex(a) >= mutationIndex(b) ? a : b;
}

function minMutation(a, b) {
  return mutationIndex(a) <= mutationIndex(b) ? a : b;
}

function qualifiedMutation(candidate) {
  // Brand was asserted first: this re-lookup is taxonomy normalization ONLY
  // (surface -> canonical action). It never decides authority or role.
  const canonical = lookupSurfaceOperation(candidate.surface)?.canonicalAction;
  const base = (canonical && CANONICAL_BASE_MUTATION[canonical]) ?? 'read-only';
  // Environment NEVER manufactures write authority: read-only stays read-only.
  if (base === 'read-only') return 'read-only';
  if (candidate.environment === 'production') return 'production-impacting';
  if (candidate.environment === 'staging' || candidate.environment === 'remote') return 'remote-write';
  return base;
}

export function capMutation(mutation, ceiling) {
  return minMutation(mutation, ceiling);
}

export function projectMutation6G(authorized) {
  for (const rec of authorized) {
    assertAuthorized(rec);
  }
  let overall = 'read-only';
  for (const rec of authorized) {
    overall = maxMutation(overall, qualifiedMutation(rec.candidate));
  }
  return overall;
}

// Semantic capability (as carried on the authorized candidate) -> secondary token.
const SEMANTIC_TO_SECONDARY = Object.freeze({
  understanding: 'understand',
  requirements: 'define',
  planning: 'plan',
  design: 'design',
  implementation: 'implement',
  diagnosis: 'investigate',
  testing: 'test',
  verification: 'review',
  assessment: 'assess',
  'security-assessment': 'security',
  deployment: 'deploy',
  operations: 'deploy',
  'git-op': 'git',
  delivery: 'ship',
  recovery: 'recover',
});

export function projectSecondary6G(orthogonal, primaryCapability = null) {
  for (const rec of orthogonal) {
    assertAuthorized(rec);
  }
  const tokens = new Set();
  for (const rec of orthogonal) {
    // No surface re-inference: the token derives from the adjudicated
    // semantic capability only. Dedupe is ONLY against the explicit
    // primaryCapability param (no governing input exists here).
    const token = SEMANTIC_TO_SECONDARY[rec.candidate.capability];
    if (!token) continue;
    if (token === primaryCapability) continue;
    tokens.add(token);
  }
  return Object.freeze([...tokens].sort().slice(0, 2));
}
