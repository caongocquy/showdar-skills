import { normalizeIntent } from './intent.js';
import { VERIFICATION_CHECKS } from './verification-budget.js';
import { mapCheckToEvidence } from './evidence-state.js';

/**
 * Semantic map of verification checks to their evidence kinds
 */
const CHECK_TO_EVIDENCE_MAP = {
  'targeted-test': 'targeted-tests-passed',
  'relevant-suite': 'relevant-suite-passed',
  'typecheck': 'typecheck-passed',
  'lint': 'lint-passed',
  'build': 'build-passed',
  'package': 'package-verified',
  'compatibility': 'compatibility-verified',
  'security': 'security-reviewed',
  'regression': 'regression-proof-added',
  'release-readiness': 'release-readiness-verified',
  'deployment-safety': 'deployment-verified',
};

/**
 * Subsumption rules: when one check can replace another
 * Key: checking check, Value: array of checks it subsumes
 */
const SUBSUMPTION_RULES = {
  // relevant-suite subsumes targeted-test when the behavior is actually covered
  // This is conservative - only when we can prove the suite covers the specific test
  'relevant-suite': [],

  // build subsumes typecheck for projects where build command includes type checking
  'build': [],

  // No other automatic subsumption to preserve safety
};

/**
 * Determine if check A subsumes check B based on context
 * @param {string} checkA - The potential subsuming check
 * @param {string} checkB - The check to be subsumed
 * @param {Object} intent - Normalized intent
 * @param {Object} routePlan - Current route plan
 * @param {Object} metadata - Change metadata
 * @returns {boolean} True if checkA subsumes checkB
 */
function checkSubsumes(checkA, checkB, intent, routePlan, metadata) {
  // No automatic subsumption for safety-sensitive checks
  const safetyChecks = ['security', 'deployment-safety'];
  if (safetyChecks.includes(checkB)) {
    return false;
  }

  // Regression proof is not satisfied by generic test success
  if (checkB === 'regression') {
    return false;
  }

  // Apply static rules
  if (SUBSUMPTION_RULES[checkA] && SUBSUMPTION_RULES[checkA].includes(checkB)) {
    return true;
  }

  // Context-specific rules
  if (checkA === 'relevant-suite' && checkB === 'targeted-test') {
    // relevant-suite subsumes targeted-test only when:
    // 1. We have evidence that the suite actually tests the specific behavior
    // 2. For now, be conservative - don't subsume without explicit evidence
    return false;
  }

  if (checkA === 'build' && checkB === 'typecheck') {
    // build subsumes typecheck when build command is known to perform type checking
    // This would require knowing the build script, so be conservative for now
    return false;
  }

  return false;
}

/**
 * Create a unified, deduplicated verification execution plan
 * @param {Object} intent - Normalized intent
 * @param {Object} routePlan - Current route plan from buildRoutePlan
 * @param {Object} verificationPlan - Current verification plan from buildVerificationPlan
 * @param {Object} metadata - Change metadata
 * @returns {Object} Unified verification execution plan
 */
export function buildUnifiedVerificationPlan(intentInput, routePlan, verificationPlanInput, metadataInput) {
  const intent = normalizeIntent(intentInput);

  // Start with verification plan as base
  const required = new Set(verificationPlanInput.required);
  const optional = new Set(verificationPlanInput.optional);
  const budget = verificationPlanInput.budget;

  // Collect all verification obligations from primary skill guidance
  const primaryChecks = extractChecksFromSkillGuidance(routePlan.primary.skill, intent, metadataInput);
  required.forEach(check => primaryChecks.add(check)); // Primary guarantees these

  // Collect all verification obligations from advisors
  const advisorChecks = new Set();
  routePlan.advisors.forEach(advisor => {
    advisorChecks.add(...extractChecksFromSkillGuidance(advisor.skill, intent, metadataInput));
  });

  // Merge all obligations
  required.forEach(check => advisorChecks.add(check)); // Required checks are obligations
  optional.forEach(check => advisorChecks.add(check)); // Optional checks are considerations

  // Apply deduplication: remove checks that are subsumed by others
  const deduplicatedRequired = new Set();
  required.forEach(check => {
    let isSubsumed = false;
    for (const otherCheck of required) {
      if (otherCheck !== check && checkSubsumes(otherCheck, check, intent, routePlan, metadataInput)) {
        isSubsumed = true;
        break;
      }
    }
    if (!isSubsumed) {
      deduplicatedRequired.add(check);
    }
  });

  // Apply deduplication to optional checks (less critical, but still useful)
  const deduplicatedOptional = new Set();
  optional.forEach(check => {
    let isSubsumed = false;
    // Check against required (higher priority)
    for (const reqCheck of deduplicatedRequired) {
      if (checkSubsumes(reqCheck, check, intent, routePlan, metadataInput)) {
        isSubsumed = true;
        break;
      }
    }
    // Check against other optional
    if (!isSubsumed) {
      for (const optCheck of optional) {
        if (optCheck !== check && checkSubsumes(optCheck, check, intent, routePlan, metadataInput)) {
          isSubsumed = true;
          break;
        }
      }
    }
    if (!isSubsumed) {
      deduplicatedOptional.add(check);
    }
  });

  // Create unified plan
  return {
    budget,
    required: [...deduplicatedRequired],
    optional: [...deduplicatedOptional],
    // Preserve escalations for compatibility
    escalations: verificationPlanInput.escalations,
    // Metadata for debugging
    _metadata: {
      originalRequired: [...verificationPlanInput.required],
      originalOptional: [...verificationPlanInput.optional],
      deduplicatedCount: verificationPlanInput.required.length - deduplicatedRequired.size,
      advisorContributions: [...advisorChecks].filter(c => !required.has(c)),
    }
  };
}

/**
 * Extract verification obligations implied by skill guidance
 * @param {string} skillId - The skill ID
 * @param {Object} intent - Normalized intent
 * @param {Object} metadata - Change metadata
 * @returns {Set} Set of verification check names
 */
function extractChecksFromSkillGuidance(skillId, intent, metadata) {
  const checks = new Set();

  // Map skills to their typical verification obligations
  // These are based on what each skill typically requires in their guidance
  switch (skillId) {
    case 'showdar-build':
      checks.add('targeted-test');
      checks.add('relevant-suite');
      // Build often implies typecheck and lint for implementation work
      if (intent.phase === 'implementation' || ['implement', 'modify', 'fix'].includes(intent.action)) {
        checks.add('typecheck');
        checks.add('lint');
      }
      checks.add('build');
      break;

    case 'showdar-test':
      checks.add('targeted-test');
      checks.add('relevant-suite');
      checks.add('regression'); // Test skill cares about regression testing
      break;

    case 'showdar-security':
      checks.add('security');
      // Security skill may also want compatibility checks for crypto/security deps
      if (metadata.dependencyChange) {
        checks.add('compatibility');
      }
      break;

    case 'showdar-quality':
      checks.add('relevant-suite');
      checks.add('typecheck');
      checks.add('lint');
      // Quality skill focuses on overall quality gates
      break;

    case 'showdar-ops':
      checks.add('deployment-safety');
      // Ops cares about deployment safety and sometimes build
      if (intent.action === 'deploy' || metadata.dependencyChange) {
        checks.add('build');
      }
      break;

    case 'showdar-upgrade':
      checks.add('compatibility');
      checks.add('regression');
      checks.add('build');
      checks.add('targeted-test');
      // Upgrade needs to verify the upgrade works
      break;

    case 'showdar-debug':
      checks.add('targeted-test');
      checks.add('regression');
      // Debug focuses on fixing the specific issue and verifying it doesn't regress
      break;

    case 'showdar-requirements':
      // Requirements phase typically doesn't require execution verification
      break;

    case 'showdar-plan':
      // Planning phase doesn't require execution verification
      break;

    case 'showdar-ship':
      checks.add('release-readiness');
      checks.add('package');
      break;

    case 'showdar-recover':
      checks.add('targeted-test');
      checks.add('relevant-suite');
      // Recovery needs to verify the reconstructed state works
      break;

    case 'showdar-git':
      // Git operations typically don't require execution verification
      break;

    case 'showdar-design':
      // Design work may need UI/UX verification but not execution
      break;

    case 'showdar-understand':
      // Understanding phase doesn't require execution verification
      break;

    default:
      // Unknown skill - be conservative
      break;
  }

  return checks;
}

/**
 * Create a compact execution brief from semantic components
 * @param {Object} intent - Normalized intent
 * @param {Object} routePlan - Current route plan
 * @param {Object} unifiedVerificationPlan - Output from buildUnifiedVerificationPlan
 * @param {Object} state - Current execution state
 * @param {Object} metadata - Change metadata
 * @returns {string} Compact execution brief
 */
export function createCompactExecutionBrief(intent, routePlan, unifiedVerificationPlan, state, metadata) {
  const lines = [];

  // Task intent summary
  lines.push(`TASK: ${intent.action} ${intent.object} (${intent.phase})`);
  if (intent.secondaryActions && intent.secondaryActions.length > 0) {
    lines.push(`SECONDARY ACTIONS: ${intent.secondaryActions.join(', ')}`);
  }

  // Primary execution ownership
  lines.push(`PRIMARY: ${routePlan.primary.skill}`);

  // Advisor deltas (only what they add beyond primary/budget)
  const advisorDeltas = computeAdvisorDeltas(routePlan, unifiedVerificationPlan, intent, metadata);
  if (advisorDeltas.length > 0) {
    lines.push(`ADVISOR DELTAS: ${advisorDeltas.join('; ')}`);
  }

  // Constraints/safety
  lines.push(`CONSTRAINTS: mutation=${intent.mutation}; risks=${intent.risks.join(', ')}`);

  // Minimal verification execution plan
  lines.push(`VERIFICATION: budget=${unifiedVerificationPlan.budget}`);
  if (unifiedVerificationPlan.required.length > 0) {
    lines.push(`  REQUIRED: ${unifiedVerificationPlan.required.join(', ')}`);
  }
  if (unifiedVerificationPlan.optional.length > 0) {
    lines.push(`  OPTIONAL: ${unifiedVerificationPlan.optional.join(', ')}`);
  }

  // Current evidence/stop condition
  lines.push(`EVIDENCE: status=${state.status}; decision=${state.decision.type}`);
  if (state.decision.target) {
    lines.push(`  TARGET: ${state.decision.target}`);
  }

  return lines.join('\n');
}

/**
 * Compute what advisors actually contribute beyond primary and budget
 * @param {Object} routePlan - Current route plan
 * @param {Object} unifiedVerificationPlan - Unified verification plan
 * @param {Object} intent - Normalized intent
 * @param {Object} metadata - Change metadata
 * @returns {Array} List of advisor delta descriptions
 */
function computeAdvisorDeltas(routePlan, unifiedVerificationPlan, intent, metadata) {
  const deltas = [];

  // Get all checks implied by advisors
  const advisorChecks = new Set();
  routePlan.advisors.forEach(advisor => {
    advisorChecks.add(...extractChecksFromSkillGuidance(advisor.skill, intent, metadata));
  });

  // Get all checks required by unified plan (what must be executed)
  const requiredChecks = new Set(unifiedVerificationPlan.required);

  // Get all checks implied by primary skill
  const primaryChecks = extractChecksFromSkillGuidance(routePlan.primary.skill, intent, metadata);

  // Advisor contributes: what they suggest that's not already covered by primary or budget
  advisorChecks.forEach(check => {
    if (!primaryChecks.has(check) && !requiredChecks.has(check)) {
      // This is something the advisor wants that isn't required
      deltas.add(`${advisor.skill}: consider ${check}`);
    }
  });

  return [...deltas];
}

export { CHECK_TO_EVIDENCE_MAP, SUBSUMPTION_RULES, checkSubsumes };