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
 * Verification execution ordering policy.
 * Lower number = higher priority (run first).
 * This is EXECUTION guidance, not semantic requirement.
 * Semantic required checks remain authoritative in verificationPlan.required.
 */
const EXECUTION_ORDER_PRIORITY = {
  // Highest diagnostic value, lowest cost
  'targeted-test': 10,
  // Specific regression proof for the change
  'regression': 20,
  // Safety-sensitive concerns relevant to the specific change
  'security': 30,
  'compatibility': 30,
  // Broader suite - run after targeted
  'relevant-suite': 40,
  // Type checking - usually fast
  'typecheck': 50,
  // Build - typically more expensive
  'build': 60,
  // Package / release / deployment - run last if required
  'package': 70,
  'release-readiness': 70,
  'deployment-safety': 70,
  // Optional quality checks
  'lint': 80,
};

/**
 * Checks that are safety-sensitive and should not be skipped or reordered
 * based solely on priority.
 */
const SAFETY_SENSITIVE_CHECKS = new Set([
  'security',
  'deployment-safety',
  'regression',
  'compatibility',
]);

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
 * Compute deterministic verification execution order.
 * Semantic required checks remain the authority; this only orders execution.
 * @param {Array<string>} requiredChecks - Semantic required checks from unified plan
 * @param {Object} intent - Normalized intent
 * @param {Object} routePlan - Current route plan
 * @returns {Array<string>} Checks in execution order
 */
function computeVerificationExecutionOrder(requiredChecks, intent, routePlan) {
  // Sort by priority, then by original semantic order for stability
  const sorted = [...requiredChecks].sort((a, b) => {
    const priorityA = EXECUTION_ORDER_PRIORITY[a] ?? 999;
    const priorityB = EXECUTION_ORDER_PRIORITY[b] ?? 999;
    if (priorityA !== priorityB) return priorityA - priorityB;
    // Stable sort: preserve original semantic order for same priority
    return requiredChecks.indexOf(a) - requiredChecks.indexOf(b);
  });
  return sorted;
}

/**
 * One-pass verification policy: represent execution state to communicate
 * which checks have succeeded and should not be repeated without relevant mutation.
 * @param {Array<string>} executionOrder - Checks in execution order
 * @param {Object} state - Current execution state with verification.completed
 * @param {Object} intent - Normalized intent
 * @returns {Object} Policy guidance for each check
 */
function computeOnePassVerificationPolicy(executionOrder, state, intent) {
  const completed = new Set(state.verification?.completed ?? []);
  const failed = new Set(state.verification?.failed ?? []);

  return executionOrder.map(check => {
    const evidenceKind = mapCheckToEvidence(check);
    const hasVerified = state.evidence?.some(e => e.kind === evidenceKind && e.status === 'verified') ?? false;
    const hasCompleted = completed.has(check);
    const hasFailed = failed.has(check);

    let shouldRun = true;
    let reason = '';

    if (hasFailed) {
      // Failed check - should rerun after fix
      shouldRun = true;
      reason = 'previous failure, rerun after fix';
    } else if (hasVerified || hasCompleted) {
      // Already verified/completed - do not rerun unless relevant mutation
      shouldRun = false;
      reason = 'already verified, skip unless relevant files changed';
    } else {
      // Not yet run
      shouldRun = true;
      reason = 'not yet executed';
    }

    return {
      check,
      shouldRun,
      reason,
      evidenceKind,
      priority: EXECUTION_ORDER_PRIORITY[check] ?? 999,
    };
  });
}

/**
 * Generate repeat-control guidance for the execution brief.
 * Communicates: successful check + no relevant subsequent mutation → do not rerun.
 * @param {Object} onePassPolicy - Output from computeOnePassVerificationPolicy
 * @param {Object} state - Current execution state
 * @returns {string} Human-readable repeat control guidance
 */
function createRepeatControlGuidance(onePassPolicy, state) {
  const lines = ['REPEAT CONTROL:'];
  const completed = onePassPolicy.filter(p => !p.shouldRun && p.reason.includes('already verified'));
  const toRun = onePassPolicy.filter(p => p.shouldRun);
  const failed = onePassPolicy.filter(p => p.reason.includes('failure'));

  if (completed.length > 0) {
    lines.push('  Verified (do not rerun unless relevant files changed):');
    completed.forEach(p => lines.push(`    - ${p.check}: ${p.reason}`));
  }

  if (toRun.length > 0) {
    lines.push('  To execute (in order):');
    toRun.forEach(p => lines.push(`    - ${p.check}: ${p.reason}`));
  }

  if (failed.length > 0) {
    lines.push('  Failed (rerun after fix):');
    failed.forEach(p => lines.push(`    - ${p.check}: ${p.reason}`));
  }

  // Add the general policy rule
  lines.push('  POLICY: Run each required check once with minimum sufficient command. Do not repeat passing checks. Rerun only on: relevant mutation, previous failure, or new invalidating evidence.');

  return lines.join('\n');
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

  // Semantic required checks (authoritative) vs recommended execution order
  lines.push(`VERIFICATION: budget=${unifiedVerificationPlan.budget}`);
  if (unifiedVerificationPlan.required.length > 0) {
    lines.push(`  REQUIRED (semantic): ${unifiedVerificationPlan.required.join(', ')}`);
  }
  if (unifiedVerificationPlan.optional.length > 0) {
    lines.push(`  OPTIONAL (semantic): ${unifiedVerificationPlan.optional.join(', ')}`);
  }

  // Deterministic execution ordering (execution guidance, not semantic requirement)
  const executionOrder = computeVerificationExecutionOrder(unifiedVerificationPlan.required, intent, routePlan);
  if (executionOrder.length > 0) {
    lines.push(`  EXECUTION ORDER: ${executionOrder.join(' → ')}`);
  }

  // One-pass verification policy with repeat control
  const onePassPolicy = computeOnePassVerificationPolicy(executionOrder, state, intent);
  const repeatGuidance = createRepeatControlGuidance(onePassPolicy, state);
  if (repeatGuidance) {
    lines.push(repeatGuidance);
  }

  // Current evidence/stop condition
  lines.push(`EVIDENCE: status=${state.status}; decision=${state.decision.type}`);
  if (state.decision.target) {
    lines.push(`  TARGET: ${state.decision.target}`);
  }

  // Explicit stop rule
  lines.push('STOP RULE: When requested behavior is implemented, every REQUIRED obligation is satisfied, and no blocker remains → STOP. Do not rerun passing checks, reload skills, perform optional exploration, seek additional hypotheses, or broaden scope unless new contradictory evidence appears.');

  // No skill rediscovery instruction
  lines.push('GUIDANCE: Treat this execution brief as the authoritative current Showdar guidance. Do not search for or reload Showdar skill files already summarized here unless information required to complete the task is genuinely missing.');

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
  routePlan.advisors.forEach(advisor => {
    const checks = extractChecksFromSkillGuidance(advisor.skill, intent, metadata);
    checks.forEach(check => {
      if (!primaryChecks.has(check) && !requiredChecks.has(check)) {
        // This is something the advisor wants that isn't required
        deltas.push(`${advisor.skill}: consider ${check}`);
      }
    });
  });

  return deltas;
}

export { CHECK_TO_EVIDENCE_MAP, SUBSUMPTION_RULES, checkSubsumes, EXECUTION_ORDER_PRIORITY, SAFETY_SENSITIVE_CHECKS, computeVerificationExecutionOrder, computeOnePassVerificationPolicy, createRepeatControlGuidance };