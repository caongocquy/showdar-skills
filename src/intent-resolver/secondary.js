/**
 * Secondary Actions Resolution — advisor signals only
 *
 * Secondary actions represent EXPLICIT ADDITIONAL REQUESTED WORK.
 * They MUST come from ownership-eligible authorized action candidates,
 * NOT from keywords, risks, domain nouns, or provenance-leaking content.
 */

import { composePrimaryAction } from './composition.js';
import { SEGMENT_KINDS } from './segments.js';

// Provenance kinds that CANNOT produce secondary actions
const BLOCKED_PROVENANCE_KINDS = new Set([
  'CONSTRAINT',
  'QUOTED_CONTENT',
  'CODE_BLOCK',
  'INLINE_CODE',
  'LOG_OUTPUT',
  'EXAMPLE',
  'MENTION',
  'CONTEXT',
]);

// Actions that are part of the same workflow step as the primary
// These should NOT become separate advisors unless explicitly requested
const SAME_WORKFLOW_ACTIONS = new Set([
  // fix + investigate = same repair workflow
  'fix-investigate',
  'investigate-fix',
  'diagnose-fix',
  'fix-diagnose',
  'find-fix',
  'fix-find',
  // upgrade + test = same upgrade workflow (unless test is explicitly separate)
  'upgrade-test',
  'test-upgrade',
  // implement + test = same implementation workflow
  'implement-test',
  'test-implement',
  // recover + git = same recovery workflow
  'recover-git',
  'git-recover',
  // deploy + plan = same deployment workflow
  'deploy-plan',
  'plan-deploy',
  // implement + upgrade = same upgrade workflow
  'implement-upgrade',
  'upgrade-implement',
  // test + quality = same quality workflow
  'test-quality',
  'quality-test',
  // assess + security = same assessment workflow
  'assess-security',
  'security-assess',
  // implement + review = same implementation workflow (when review is implied)
  'implement-review',
  'review-implement',
]);

/**
 * Map from canonical action to secondary capability
 */
const ACTION_TO_SECONDARY = Object.freeze({
  'review': 'review',
  'assess': 'review',
  'audit': 'review',
  'test': 'test',
  'upgrade': 'upgrade',
  'deploy': 'deploy',
  'push': 'deploy',
  'release': 'release',
  'ship': 'release',
  'publish': 'release',
  'deliver': 'release',
  'handoff': 'release',
  'operations': 'operations',
  'recover': 'recover',
  'reconstruct': 'recover',
  'resume': 'recover',
  'git': 'git',
  'commit': 'git',
  'push': 'git',
  'rebase': 'git',
  'cherry-pick': 'git',
  'branch': 'git',
  'stage': 'git',
  'security': 'security',
  'quality': 'quality',
  'design': 'design',
  'doc': 'doc',
  'plan': 'plan',
  'define': 'define',
  'implement': 'implement',
  'fix': 'fix',
  'investigate': 'investigate',
});

/**
 * Map from verb to secondary capability (for compound verbs)
 */
const VERB_TO_SECONDARY = Object.freeze({
  'security review': 'security',
  'security audit': 'security',
  'threat model': 'security',
  'threat-model': 'security',
  'penetration test': 'security',
  'pentest': 'security',
  'code review': 'review',
  'pr review': 'review',
  'update docs': 'doc',
  'update documentation': 'doc',
  'write docs': 'doc',
  'write documentation': 'doc',
  'add docs': 'doc',
  'add documentation': 'doc',
});

/**
 * Get secondary capability from candidate action
 */
function getSecondaryCapability(candidate) {
  // FIRST: Check verb for compound verbs (more specific than action)
  if (candidate.verb) {
    // Compound verb mapping
    const compoundVerbCapability = VERB_TO_SECONDARY[candidate.verb.toLowerCase()];
    if (compoundVerbCapability) return compoundVerbCapability;

    // Check if verb contains security-related terms (before direct verb mapping)
    const verbLower = candidate.verb.toLowerCase();
    if (verbLower.includes('security') || verbLower.includes('threat') || verbLower.includes('penetration') || verbLower.includes('pentest')) {
      return 'security';
    }
    if (verbLower.includes('audit')) {
      return 'security';  // "audit" -> security, not review
    }
    if (verbLower.includes('review')) {
      return 'review';
    }
    if (verbLower.includes('test')) {
      return 'test';
    }
    if (verbLower.includes('upgrade') || verbLower.includes('migrate')) {
      return 'upgrade';
    }
    if (verbLower.includes('deploy') || verbLower.includes('rollout') || verbLower.includes('canary')) {
      return 'deploy';
    }
    if (verbLower.includes('release') || verbLower.includes('ship') || verbLower.includes('publish') || verbLower.includes('deliver') || verbLower.includes('handoff')) {
      return 'release';
    }
    if (verbLower.includes('operation') || verbLower.includes('ops') || verbLower.includes('infrastructure') || verbLower.includes('pipeline') || verbLower.includes('monitor')) {
      return 'operations';
    }
    if (verbLower.includes('recover') || verbLower.includes('reconstruct') || verbLower.includes('resume') || verbLower.includes('replay')) {
      return 'recover';
    }
    if (verbLower.includes('commit') || verbLower.includes('push') || verbLower.includes('merge') || verbLower.includes('rebase') || verbLower.includes('cherry-pick') || verbLower.includes('branch') || verbLower.includes('stage')) {
      return 'git';
    }
    if (verbLower.includes('design')) {
      return 'design';
    }
    // "define" -> "define" (not requirements), "requirement" -> "requirements"
    if (verbLower.includes('requirement')) {
      return 'requirements';
    }

    // Direct verb mapping (after contains checks)
    const directVerbCapability = ACTION_TO_SECONDARY[candidate.verb];
    if (directVerbCapability) return directVerbCapability;
  }

  // SECOND: Use actionHint if available AND different from action (for SECONDARY_INSTRUCTION with specific hints like "doc")
  if (candidate.actionHint && ACTION_TO_SECONDARY[candidate.actionHint] && candidate.actionHint !== candidate.action) {
    return ACTION_TO_SECONDARY[candidate.actionHint];
  }

  // THIRD: Use action mapping (the classified action is the primary signal)
  const actionCapability = ACTION_TO_SECONDARY[candidate.action];
  if (actionCapability) return actionCapability;

  // FOURTH: Use actionHint if available (fallback when action doesn't map)
  if (candidate.actionHint && ACTION_TO_SECONDARY[candidate.actionHint]) {
    return ACTION_TO_SECONDARY[candidate.actionHint];
  }

  return null;
}

/**
 * Check if candidate is ownership-eligible for secondary action
 */
function isOwnershipEligible(candidate, segments) {
  // Must have positive polarity
  if (candidate.provenance && candidate.provenance.polarity === 'negative') {
    return false;
  }

  // Must not be from blocked provenance
  if (candidate.provenance && candidate.provenance.segmentKind) {
    if (BLOCKED_PROVENANCE_KINDS.has(candidate.provenance.segmentKind)) {
      return false;
    }
  }

  // MUST come from SECONDARY_INSTRUCTION segment (explicit additional request)
  // DIRECT_INSTRUCTION context verbs (like "test suite", "rebase", "set up")
  // are NOT explicit secondary requests
  if (candidate.provenance && candidate.provenance.segmentKind !== 'SECONDARY_INSTRUCTION') {
    return false;
  }

  // Must not be negated
  if (candidate.provenance && candidate.provenance.negated === true) {
    return false;
  }

  // Must have a mappable capability
  if (!getSecondaryCapability(candidate)) {
    return false;
  }

  return true;
}

/**
 * Check if two actions represent the same workflow step
 */
function isSameWorkflowStep(primaryAction, secondaryAction) {
  const pair = `${primaryAction}-${secondaryAction}`;
  const reversePair = `${secondaryAction}-${primaryAction}`;
  return SAME_WORKFLOW_ACTIONS.has(pair) || SAME_WORKFLOW_ACTIONS.has(reversePair);
}

/**
 * Resolve secondary actions from composition candidates
 *
 * @param {Array} candidates - from extractActionCandidates()
 * @param {Array} segments - from segmentPrompt()
 * @param {Object} primary - from composePrimaryAction()
 * @returns {string[]} sorted secondary capabilities
 */
export function resolveSecondaryActionsFromComposition(candidates, segments, primary) {
  const primaryAction = primary.action;
  const secondaryCapabilities = new Set();

  // Get all ownership-eligible candidates that are NOT the primary
  // The primary may have been remapped (e.g., upgrade -> implement via special case)
  // Use the original action from the composed result to find the correct candidate
  const originalPrimaryAction = primary.originalAction || primary.action;
  const primaryCandidateIndex = candidates.findIndex(c => c.action === originalPrimaryAction);

  // First, filter to ownership-eligible non-primary candidates
  const eligibleCandidates = candidates
    .filter((c, i) => i !== primaryCandidateIndex && isOwnershipEligible(c, segments))
    .map((c, i) => ({ ...c, originalIndex: candidates.indexOf(c) }));

  // Deduplicate: if a candidate's verb is a substring of another candidate's verb
  // from the same segment, and they have the same target, keep only the longer one
  // Also: if a candidate has a compound verb (in VERB_TO_SECONDARY) from the same
  // segment with same target, suppress generic connector verbs (add, write, create, etc.)
  const CONNECTOR_VERBS = new Set(['add', 'write', 'create', 'implement', 'update', 'make', 'build', 'develop']);
  const deduplicatedCandidates = [];
  for (const candidate of eligibleCandidates) {
    const isSubsumed = eligibleCandidates.some(other =>
      other !== candidate &&
      other.provenance.segmentIndex === candidate.provenance.segmentIndex &&
      other.target === candidate.target &&
      other.verb &&
      candidate.verb &&
      other.verb.toLowerCase().includes(candidate.verb.toLowerCase()) &&
      other.verb.length > candidate.verb.length
    );
    // Also check if another candidate from same segment has a compound verb mapping
    // and this candidate is a generic connector verb with same target
    const hasCompoundVerbSibling = eligibleCandidates.some(other =>
      other !== candidate &&
      other.provenance.segmentIndex === candidate.provenance.segmentIndex &&
      other.target === candidate.target &&
      other.verb &&
      VERB_TO_SECONDARY[other.verb.toLowerCase()] &&
      CONNECTOR_VERBS.has(candidate.verb.toLowerCase())
    );
    if (!isSubsumed && !hasCompoundVerbSibling) {
      deduplicatedCandidates.push(candidate);
    }
  }

  for (const candidate of deduplicatedCandidates) {
    const capability = getSecondaryCapability(candidate);
    if (!capability) continue;

    // Primary skill cannot also be advisor (primary duplication check)
    // Use the FINAL primary action's capability (after remapping), not the original candidate
    const primaryCapability = ACTION_TO_SECONDARY[primaryAction];
    if (primaryCapability && capability === primaryCapability) continue;

    // Check workflow cohesion - same workflow step doesn't get separate advisor
    // SAME_WORKFLOW_ACTIONS pairs are known workflow completions (e.g., investigate+fix,
    // upgrade+test, implement+test, recover+git, deploy+plan, implement+upgrade,
    // test+quality, assess+security, implement+review). These should NOT be separate
    // advisors UNLESS explicitly requested as orthogonal additional work (SECONDARY_INSTRUCTION
    // with its own verb indicating explicit request, not just natural completion).
    if (isSameWorkflowStep(primaryAction, candidate.action)) {
      // For SAME_WORKFLOW pairs, only allow if explicitly requested as orthogonal work
      // Evidence: verb is a known compound verb (in VERB_TO_SECONDARY) OR contains
      // a capability keyword (security, test, review, audit, threat, penetration, pentest, doc)
      const verbLower = candidate.verb?.toLowerCase() || '';
      const isCompoundVerb = VERB_TO_SECONDARY[verbLower] !== undefined;
      const hasCapabilityKeyword = verbLower.includes('security') || verbLower.includes('test') ||
        verbLower.includes('review') || verbLower.includes('audit') || verbLower.includes('threat') ||
        verbLower.includes('penetration') || verbLower.includes('pentest') || verbLower.includes('doc');

      // If no explicit evidence, it's just natural workflow completion - filter it
      if (!isCompoundVerb && !hasCapabilityKeyword) {
        continue;
      }
    }

    secondaryCapabilities.add(capability);
  }

  return Array.from(secondaryCapabilities).sort();
}

/**
 * Legacy-compatible resolver using keyword matching (for backward compat only)
 * @deprecated - use resolveSecondaryActionsFromComposition
 */
export function resolveSecondaryActions(text, primaryPhase, primaryAction) {
  // This is kept for backward compatibility but should not be used
  // The new flow uses composition candidates with provenance
  return [];
}

/**
 * Filter secondary actions through precision gate.
 * This is now a no-op since filtering happens in resolveSecondaryActionsFromComposition
 * @deprecated
 */
export function filterSecondaryActions(secondaryActions, text, primaryAction) {
  return secondaryActions;
}
