// Secondary projector (Phase 6F T14)
// Projects secondaryActions from ORTHOGONAL + positive + AUTHORIZED_NOW frames ONLY
// Primary capability deduplicated, capped at 2.

const ACTION_TO_SECONDARY = Object.freeze({
  review: 'review',
  assess: 'review',
  audit: 'security',   // audit -> security per legacy secondary.js mapping
  test: 'test',
  upgrade: 'upgrade',
  deploy: 'deploy',
  push: 'deploy',
  release: 'release',
  ship: 'release',
  publish: 'release',
  deliver: 'release',
  handoff: 'release',
  operations: 'operations',
  recover: 'recover',
  reconstruct: 'recover',
  resume: 'recover',
  git: 'git',
  commit: 'git',
  rebase: 'git',
  'cherry-pick': 'git',
  branch: 'git',
  stage: 'git',
  security: 'security',
  quality: 'quality',
  design: 'design',
  doc: 'doc',
  plan: 'plan',
  define: 'define',
  implement: 'implement',
  fix: 'fix',
  investigate: 'investigate',
});

function getSecondaryCapability(action) {
  const canonical = action.canonicalAction;
  if (canonical && ACTION_TO_SECONDARY[canonical]) {
    return ACTION_TO_SECONDARY[canonical];
  }
  // Also check surfaceVerb for verb-specific mappings not covered by canonical
  if (action.surfaceVerb) {
    const verb = action.surfaceVerb.toLowerCase();
    if (ACTION_TO_SECONDARY[verb]) {
      return ACTION_TO_SECONDARY[verb];
    }
  }
  return null;
}

export function projectSecondaries(requestFrame, primaryCapability) {
  if (!requestFrame || !Array.isArray(requestFrame.actions)) {
    return [];
  }

  const primarySecondary = ACTION_TO_SECONDARY[primaryCapability] ?? null;
  const secondaryCapabilities = new Set();

  for (const action of requestFrame.actions) {
    // Only ORTHOGONAL role
    if (action.role !== 'ORTHOGONAL') continue;
    // Must be positive polarity
    if (action.polarity !== 'positive') continue;
    // Must be AUTHORIZED_NOW
    if (action.commitment !== 'AUTHORIZED_NOW') continue;

    const capability = getSecondaryCapability(action);
    if (!capability) continue;

    // Primary capability deduplication
    if (primarySecondary && capability === primarySecondary) continue;

    secondaryCapabilities.add(capability);
  }

  // Sort for deterministic output, cap at 2
  return Array.from(secondaryCapabilities).sort().slice(0, 2);
}