// Single surface→semantic→canonical map (Phase 6F T03).
// Closed set: fixture-gated growth only. Unknown phrases return null.
// Surface vocabulary never decides skill ownership (no skill names here).

const ENTRIES = {
  map: ['understanding', 'understand'],
  trace: ['understanding', 'understand'],
  explain: ['understanding', 'understand'],
  commit: ['git-op', 'git'],
  rebase: ['git-op', 'git'],
  push: ['git-op', 'git'],
  merge: ['git-op', 'git'],
  run: ['testing', 'test'],
  execute: ['testing', 'test'],
  'test-suite': ['testing', 'test'],
  audit: ['assessment', 'assess'],
  'threat-model': ['assessment', 'assess'],
  define: ['requirements', 'define'],
  specify: ['requirements', 'define'],
  deploy: ['deployment', 'deploy'],
  promote: ['deployment', 'deploy'],
  rollout: ['deployment', 'deploy'],
  recover: ['recovery', 'recover'],
  resume: ['recovery', 'recover'],
};

const table = Object.create(null);
for (const [verb, [semanticCapability, canonicalAction]] of Object.entries(ENTRIES)) {
  table[verb] = Object.freeze({ semanticCapability, canonicalAction });
}

export const SURFACE_TO_CAPABILITY = Object.freeze(table);

export function lookupSurfaceOperation(phrase) {
  if (typeof phrase !== 'string') return null;
  const surfaceVerb = phrase.trim().toLowerCase();
  const entry = SURFACE_TO_CAPABILITY[surfaceVerb];
  if (!entry) return null;
  return { surfaceVerb, semanticCapability: entry.semanticCapability, canonicalAction: entry.canonicalAction };
}
