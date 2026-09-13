/**
 * Mutation Resolution — derives mutation from authorized action candidates
 *
 * Mutation MUST come from authorized requested actions, not from context nouns.
 * Consumes structured composition output and applies constraint gates.
 *
 * Precedence (after authority filtering):
 * production-impacting > remote-write > local-write > read-only
 */

import { lower, isNegated, isStagingDeploy, hasReadinessPattern } from './signals.js';
import { composePrimaryAction } from './composition.js';

// Action → base mutation class (before environment binding)
const ACTION_BASE_MUTATION = Object.freeze({
  // Read-only actions
  'explain': 'read-only',
  'summarize': 'read-only',
  'understand': 'read-only',
  'inspect': 'read-only',
  'review': 'read-only',
  'assess': 'read-only',
  'audit': 'read-only',
  'validate': 'read-only',
  'verify': 'read-only',
  'check': 'read-only',
  'evaluate': 'read-only',
  'diagnose': 'read-only',
  'investigate': 'read-only',
  'plan': 'read-only',
  'prepare': 'read-only',
  'strategy': 'read-only',
  'outline': 'read-only',
  'scope': 'read-only',
  'breakdown': 'read-only',
  'estimate': 'read-only',

  // Local-write actions
  'design': 'local-write',

  // Local-write actions
  'implement': 'local-write',
  'fix': 'local-write',
  'patch': 'local-write',
  'add': 'local-write',
  'write': 'local-write',
  'modify': 'local-write',
  'update': 'local-write',
  'refactor': 'local-write',
  'create': 'local-write',
  'code': 'local-write',
  'build': 'local-write',
  'develop': 'local-write',
  'stage': 'local-write',
  'commit': 'local-write',
  'merge': 'local-write',
  'rebase': 'local-write',
  'cherry-pick': 'local-write',
  'branch': 'local-write',
  'recover': 'local-write',
  'reconstruct': 'local-write',
  'resume': 'local-write',
  'replay': 'local-write',
  'upgrade': 'local-write',

  // Remote-write actions (explicit remote operations)
  'push': 'remote-write',
  'publish': 'remote-write',
  'remote-merge': 'remote-write',

  // Production-impacting actions (explicit production operations)
  'deploy': 'production-impacting',
  'rollback': 'production-impacting',
  'restart': 'production-impacting',
  'scale': 'production-impacting',
  'rotate': 'production-impacting',
  'promote': 'production-impacting',
});

// Target category → environment hint
const TARGET_ENVIRONMENT = Object.freeze({
  'deployment': 'remote',      // deployment targets are remote environments (staging/prod unspecified)
  'release': 'remote',         // release targets are remote
  'production': 'production',  // explicit production
  'prod': 'production',
  'live': 'production',
  'canary': 'remote',          // canary is a deployment strategy, not necessarily production
  'staging': 'staging',
  'branch': 'remote',
  'remote': 'remote',
  'upstream': 'remote',
  'origin': 'remote',
});

// Actions that can escalate mutation based on environment
// Only actions that explicitly operate on PRODUCTION infrastructure
const ENVIRONMENT_SENSITIVE_ACTIONS = new Set([
  'deploy', 'scale', 'rotate', 'restart', 'promote', 'rollback', 'push', 'merge', 'upgrade'
]);

// Constraint gate results
const CONSTRAINT_GATE = Object.freeze({
  ALLOW: 'allow',
  BLOCK: 'block',
  SCOPE: 'scope', // scoped constraint - only blocks specific targets
});

/**
 * Determine base mutation class from action verb
 */
function getBaseMutation(action, verb) {
  // Use verb for more specific lookup, fall back to action
  return ACTION_BASE_MUTATION[verb] || ACTION_BASE_MUTATION[action] || 'read-only';
}

/**
 * Check if target category implies production/remote environment
 */
function getEnvironmentFromTarget(targetCategory) {
  return TARGET_ENVIRONMENT[targetCategory] || null;
}

/**
 * Check if a candidate's target is production-bound
 */
function isProductionBound(candidate) {
  // Check target category
  const targetEnv = getEnvironmentFromTarget(candidate.targetCategory);
  if (targetEnv === 'production') return true;

  // Check if target text contains production terms
  if (candidate.target && /\b(production|prod|live)\b/i.test(candidate.target)) return true;

  return false;
}

/**
 * Check if a candidate's target is remote-bound
 */
function isRemoteBound(candidate) {
  const targetEnv = getEnvironmentFromTarget(candidate.targetCategory);
  if (targetEnv === 'remote') return true;

  if (candidate.target && /\b(remote|upstream|origin|branch)\b/i.test(candidate.target)) return true;

  return false;
}

/**
 * Apply environment binding to escalate mutation if warranted
 * Only ENVIRONMENT_SENSITIVE_ACTIONS can escalate based on target
 * Checks for staging context to prevent production escalation
 */
function applyEnvironmentBinding(baseMutation, action, candidate, contextText = '') {
  // Read-only actions never escalate
  if (baseMutation === 'read-only') return 'read-only';

  // Check for staging context - if explicitly staging, treat as remote (not production)
  const isStagingContext = /\bstaging\b/i.test(contextText);

  // Check for repo state context - recovery from repo state is inspection only
  const isRepoStateContext = /\brepo\s+state\b/i.test(contextText) || /\brepository\s+state\b/i.test(contextText);

  // Recover from repo state -> read-only (inspection only)
  if (isRepoStateContext && action === 'recover') {
    // "recover from repo state" = inspection only
    // But "reconstruct lost changes" = file restoration = local-write
    // Check if it's reconstruct (restoration) vs recover (inspection)
    const isReconstruction = /\breconstruct\b/i.test(contextText);
    if (!isReconstruction) {
      return 'read-only';
    }
  }

  // Only certain actions can escalate based on environment
  if (!ENVIRONMENT_SENSITIVE_ACTIONS.has(action)) {
    return baseMutation;
  }

  // Check for production binding
  if (isProductionBound(candidate) && !isStagingContext) {
    // Deploy, upgrade, scale, rotate, restart, promote, rollback on production
    if (action === 'deploy') return 'production-impacting';
    if (['upgrade', 'scale', 'rotate', 'restart', 'promote', 'rollback'].includes(action)) {
      return 'production-impacting';
    }
    // Push/merge to production branch could be production-impacting
    if (['push', 'merge'].includes(action) && candidate.targetCategory === 'branch') {
      return 'production-impacting';
    }
    return 'remote-write'; // other actions on production = remote-write
  }

  // Check for remote binding (includes staging)
  // Cluster/database upgrades and scaling are remote operations even without explicit staging
  const isClusterUpgrade = action === 'upgrade' &&
    candidate.targetCategory === 'deployment';
  const isDatabaseUpgrade = action === 'upgrade' &&
    (candidate.targetCategory === null || candidate.targetCategory === 'dependency') &&
    (candidate.target && /\b(postgresql|postgres|mysql|redis|mongodb|cassandra|cluster|database)\b/i.test(candidate.target) ||
     /\b(postgresql|postgres|mysql|redis|mongodb|cassandra|cluster|database)\b/i.test(contextText));
  const isClusterScale = action === 'deploy' && candidate.verb === 'scale' &&
    (candidate.targetCategory === 'deployment' || candidate.targetCategory === 'dependency' ||
     /\b(cluster|redis|database)\b/i.test(contextText));

  if (isRemoteBound(candidate) || isStagingContext || isClusterUpgrade || isDatabaseUpgrade || isClusterScale) {
    if (['push', 'merge'].includes(action)) return 'remote-write';
    if (action === 'deploy') return 'remote-write'; // deploy to staging/remote = remote-write
    if (action === 'upgrade') return 'remote-write'; // cluster/db upgrade = remote-write
    return 'remote-write';
  }

  return baseMutation;
}

/**
 * Check if constraint blocks a candidate
 * Returns CONSTRAINT_GATE result
 */
function checkConstraintGate(candidate, constraints, segments) {
  if (!constraints || constraints.length === 0) return CONSTRAINT_GATE.ALLOW;

  for (const constraint of constraints) {
    // Global no-modify constraint
    if (constraint.type === 'no-modify' && !constraint.scope) {
      // Only blocks write mutations, not read-only
      if (getBaseMutation(candidate.action, candidate.verb) !== 'read-only') {
        return CONSTRAINT_GATE.BLOCK;
      }
    }

    // Scoped constraint
    if (constraint.type === 'no-modify' && constraint.scope) {
      // Check if candidate's target falls in scope
      const scope = constraint.scope.toLowerCase();
      const targetText = (candidate.target || '').toLowerCase();
      const actionText = (candidate.verb || '').toLowerCase();

      // Check if target matches scope
      if (targetText.includes(scope) || actionText.includes(scope)) {
        if (getBaseMutation(candidate.action, candidate.verb) !== 'read-only') {
          return CONSTRAINT_GATE.SCOPE;
        }
      }
    }

    // No-push constraint
    if (constraint.type === 'no-push') {
      if (candidate.action === 'push' || candidate.action === 'merge') {
        return CONSTRAINT_GATE.BLOCK;
      }
    }

    // No-deploy constraint
    if (constraint.type === 'no-deploy') {
      if (candidate.action === 'deploy') {
        return CONSTRAINT_GATE.BLOCK;
      }
    }
  }

  return CONSTRAINT_GATE.ALLOW;
}

/**
 * Get constraints from segments
 * Returns array of { type, scope?, negatedVerb? }
 */
function extractConstraints(segments) {
  const constraints = [];

  for (const segment of segments) {
    if (segment.kind === 'CONSTRAINT') {
      const text = segment.text.toLowerCase();

      // "don't push" / "no push" / "without pushing"
      if (/\b(no|don['']?t|do not|without)\s+push\b/i.test(text)) {
        constraints.push({ type: 'no-push', source: segment.index });
      }

      // "don't deploy" / "no deploy" / "without deploying"
      if (/\b(no|don['']?t|do not|without)\s+deploy\b/i.test(text)) {
        constraints.push({ type: 'no-deploy', source: segment.index });
      }

      // "don't implement" / "without implementing"
      if (/\b(no|don['']?t|do not|without)\s+implement\b/i.test(text)) {
        constraints.push({ type: 'no-implement', source: segment.index });
      }

      // "don't modify" / "without modifying" / "no changes"
      if (/\b(no|don['']?t|do not|without)\s+(modify|change|write)\b/i.test(text) || /\bno\s+changes?\b/i.test(text)) {
        // Check if scoped: "don't modify src/", "leave production alone"
        const scopedMatch = text.match(/\b(?:don['']?t|do not|without)\s+(?:modify|change|write|touch)\s+([\w\/\-\.]+)/i);
        if (scopedMatch) {
          constraints.push({ type: 'no-modify', scope: scopedMatch[1], source: segment.index });
        } else if (/\b(modify|change|write)\b.*\b(src|production|prod|application|app)\b/i.test(text)) {
          // "don't modify production" etc.
          const scopeMatch = text.match(/\b(modify|change|write)\b.*\b(\w+)\b/i);
          if (scopeMatch) {
            constraints.push({ type: 'no-modify', scope: scopeMatch[2], source: segment.index });
          } else {
            constraints.push({ type: 'no-modify', source: segment.index }); // global
          }
        } else {
          constraints.push({ type: 'no-modify', source: segment.index }); // global
        }
      }

      // "review only" / "assess only" / "check only" / "read only"
      if (/\b(review|assess|check|inspect|audit|validate|verify)\s+only\b/i.test(text) || /\b(read|look)\s+only\b/i.test(text)) {
        constraints.push({ type: 'read-only', source: segment.index });
      }

      // "plan only" / "prepare only"
      if (/\b(plan|prepare)\s+only\b/i.test(text) || /\b(only|just)\s+(plan|prepare)\b/i.test(text)) {
        constraints.push({ type: 'read-only', source: segment.index });
      }
    }
  }

  return constraints;
}

/**
 * Check if a candidate is negated in its segment
 */
function isCandidateNegated(candidate, segments) {
  if (candidate.provenance && candidate.provenance.segmentIndex !== undefined) {
    const segment = segments[candidate.provenance.segmentIndex];
    if (segment) {
      return segment.negated === true || isNegated(segment.text, candidate.verb);
    }
  }
  return false;
}

/**
 * Resolve mutation from composition candidates
 *
 * @param {Array} candidates - from extractActionCandidates()
 * @param {Array} segments - from segmentPrompt()
 * @param {Array} constraints - from extractConstraints()
 * @returns {string} mutation class
 */
export function resolveMutationFromComposition(candidates, segments) {
  // Extract constraints
  const constraints = extractConstraints(segments);

  // Build full context text from all segments
  const fullContextText = segments.map(s => s.text).join(' ');

  // Planning without execution -> read-only (override all candidates)
  // "plan X, don't implement/deploy/execute/rollout"
  const isPlanningWithoutExecution = /\b(plan|planning)\b/i.test(fullContextText) &&
    /\b(only|do not|don't|without)\b/i.test(fullContextText) &&
    /\b(deploy|implement|execute|run|rollout)\b/i.test(fullContextText);

  if (isPlanningWithoutExecution) {
    return 'read-only';
  }

  // Log output context: log indicators + production-like nouns should not grant production mutation
  // "Logs: deployment failed" -> read-only even if 'deployment' matches deploy verb
  const hasLogIndicator = /\b(Error:|error:|Exception:|Log|log|Output|output|Logs?)\b/i.test(fullContextText);
  const hasProductionLikeNoun = /\b(production|prod|live|deployment|deploy)\b/i.test(fullContextText);
  const isLogContext = hasLogIndicator && hasProductionLikeNoun;

  if (isLogContext) {
    // Check if there's an explicit deploy action in DIRECT_INSTRUCTION
    const hasExplicitDeploy = candidates.some(c => {
      const seg = segments[c.provenance?.segmentIndex];
      return seg && seg.kind === 'DIRECT_INSTRUCTION' && c.action === 'deploy' && c.verb !== 'deployment';
    });
    if (!hasExplicitDeploy) {
      return 'read-only';
    }
  }

  // Diagnostic context: "why is X failing/hanging" -> read-only
  const isDiagnosticQuestion = /^(why|how|what)\b/i.test(fullContextText.trim()) &&
    /\b(failing|hanging|broken|error|crash|issue|problem|wrong)\b/i.test(fullContextText);

  if (isDiagnosticQuestion) {
    return 'read-only';
  }

  // Plan/prepare/sketch/verify without execution -> read-only
  const isPlanningOrVerifyWithoutExecution = (
    /\b(sketch|prepare|plan|verify|confirm|reconstruct)\b/i.test(fullContextText) &&
    /\b(plan|steps|config|configuration|rollout|deploy)\b/i.test(fullContextText) &&
    /\b(only|don't|do not|without|but)\b/i.test(fullContextText) &&
    /\b(execute|run|implement|deploy)\b/i.test(fullContextText)
  );

  if (isPlanningOrVerifyWithoutExecution) {
    return 'read-only';
  }

  // "sketch the rollout plan" -> planning, read-only
  const isSketchRolloutPlan = /\bsketch\b/i.test(fullContextText) && /\brollout plan\b/i.test(fullContextText);
  if (isSketchRolloutPlan) {
    return 'read-only';
  }

  // "verify the X config" or "confirm the X passes" -> assessment, read-only
  const isVerifyConfig = /\b(verify|confirm)\b/i.test(fullContextText) &&
    /\b(config|configuration|canary|artifact|gates)\b/i.test(fullContextText);

  if (isVerifyConfig) {
    return 'read-only';
  }

  // "reconstruct what happened" or "reconstruct the failure" -> diagnosis, read-only
  // But NOT "reconstruct the lost changes/files" -> restoration, local-write
  const isReconstructDiagnostic = /\breconstruct\b/i.test(fullContextText) &&
    /\b(what happened|the failure|the incident|the crash|the outage)\b/i.test(fullContextText);
  if (isReconstructDiagnostic) {
    return 'read-only';
  }

  // "deploy script works but rollback fails" -> diagnosis, read-only
  const isDeployButRollback = /\b(deploy|rollback)\b/i.test(fullContextText) &&
    /\b(works|works but|fails|script)\b/i.test(fullContextText);
  if (isDeployButRollback) {
    return 'read-only';
  }

  // Determine primary action from composition (for phase/action AND mutation)
  // Mutation follows the PRIMARY authorized intent, not noun-matched context verbs.
  // Segments are passed so segment-aware composition (governing/supporting
  // precedence) agrees with the intent path.
  const primary = composePrimaryAction(candidates, fullContextText, segments);
  const primaryAction = primary.action;

  // Special case: setup deployment strategy (blue-green/canary configuration)
  // This is configuration of deployment pipeline, not production execution
  if (primary.source === 'setup-deployment-strategy') {
    return 'remote-write';
  }

  // If no candidates at all, use primary action's base mutation
  if (candidates.length === 0) {
    const baseMutation = getBaseMutation(primaryAction, primaryAction);
    return baseMutation;
  }

  // Find the primary candidate (matches primary action)
  const primaryCandidate = candidates.find(c => c.action === primaryAction) || candidates[0];

  // Get base mutation from PRIMARY action only
  // This prevents context nouns (build, test, stage, etc.) from escalating mutation
  const baseMutation = getBaseMutation(primaryAction, primaryCandidate?.verb || primaryAction);

  // Special case: explicit multi-intent coordination ("find AND fix", "investigate AND fix")
  // If primary is read-only but there's a clear coordinate write action, allow escalation
  // Only for specific patterns: "find.*and.*fix", "investigate.*and.*fix", "diagnose.*and.*fix"
  if (baseMutation === 'read-only') {
    const hasCoordinationFix = /\b(find|investigate|diagnose)\b.*\band\b.*\b(fix|resolve|repair|patch)\b/i.test(fullContextText);
    if (hasCoordinationFix) {
      // Find the fix candidate and use its mutation
      const fixCandidate = candidates.find(c => c.action === 'fix' &&
        segments[c.provenance?.segmentIndex]?.kind === 'DIRECT_INSTRUCTION');
      if (fixCandidate) {
        const fixBaseMutation = getBaseMutation('fix', fixCandidate.verb);
        if (fixBaseMutation !== 'read-only') {
          const fixEnvMutation = applyEnvironmentBinding(fixBaseMutation, 'fix', fixCandidate, fullContextText);
          const fixGate = checkConstraintGate(fixCandidate, constraints, segments);
          if (fixGate !== CONSTRAINT_GATE.BLOCK && fixGate !== CONSTRAINT_GATE.SCOPE) {
            return fixEnvMutation;
          }
        }
      }
    }

    // Special case: write-tests-only -> mutation follows originalAction (implement = local-write)
    if (primary.source === 'write-tests-only' && primary.originalAction) {
      const origBaseMutation = getBaseMutation(primary.originalAction, primary.originalAction);
      if (origBaseMutation !== 'read-only') {
        const origEnvMutation = applyEnvironmentBinding(origBaseMutation, primary.originalAction, primaryCandidate, fullContextText);
        const origGate = checkConstraintGate(primaryCandidate, constraints, segments);
        if (origGate !== CONSTRAINT_GATE.BLOCK && origGate !== CONSTRAINT_GATE.SCOPE) {
          return origEnvMutation;
        }
      }
    }
  }

  // Read-only actions never escalate via environment
  if (baseMutation === 'read-only') {
    return 'read-only';
  }

  // Apply environment binding to primary candidate only
  const envMutation = applyEnvironmentBinding(baseMutation, primaryAction, primaryCandidate, fullContextText);

  // Check constraint gates on primary candidate
  const gate = checkConstraintGate(primaryCandidate, constraints, segments);
  if (gate === CONSTRAINT_GATE.BLOCK) {
    return 'read-only';
  }
  if (gate === CONSTRAINT_GATE.SCOPE) {
    return 'read-only';
  }

  // Special case: explicit multi-intent coordination ("find AND fix", "investigate AND fix")
  // If primary is read-only but there's a clear coordinate write action, allow escalation
  // Only for specific patterns: "find.*and.*fix", "investigate.*and.*fix", "diagnose.*and.*fix"
  if (baseMutation === 'read-only') {
    const hasCoordinationFix = /\b(find|investigate|diagnose)\b.*\band\b.*\b(fix|resolve|repair|patch)\b/i.test(fullContextText);
    if (hasCoordinationFix) {
      // Find the fix candidate and use its mutation
      const fixCandidate = candidates.find(c => c.action === 'fix' &&
        segments[c.provenance?.segmentIndex]?.kind === 'DIRECT_INSTRUCTION');
      if (fixCandidate) {
        const fixBaseMutation = getBaseMutation('fix', fixCandidate.verb);
        if (fixBaseMutation !== 'read-only') {
          const fixEnvMutation = applyEnvironmentBinding(fixBaseMutation, 'fix', fixCandidate, fullContextText);
          const fixGate = checkConstraintGate(fixCandidate, constraints, segments);
          if (fixGate !== CONSTRAINT_GATE.BLOCK && fixGate !== CONSTRAINT_GATE.SCOPE) {
            return fixEnvMutation;
          }
        }
      }
    }
  }

  return envMutation;
}

/**
 * Legacy compatibility: resolve mutation from keyword signals
 * DEPRECATED - kept for backward compatibility only
 * Does NOT override composition-based resolution
 */
export function resolveMutation(keywordSignals, fullText, phase, action) {
  const lowerText = lower(fullText);

  // Readiness assessment -> read-only
  if (hasReadinessPattern(lowerText)) {
    return 'read-only';
  }

  // Staging deploy -> remote-write
  if (phase === 'operations' && action === 'deploy' && isStagingDeploy(lowerText)) {
    return 'remote-write';
  }

  // Context-aware read-only patterns
  const isPlanWithoutExecute = (phase === 'planning' && action === 'plan' && /\b(only|do not|don't|without)\b/i.test(lowerText) && /\b(deploy|implement|execute|run|rollout)\b/i.test(lowerText)) ||
    /\b(sketch|prepare)\b/i.test(lowerText) && /\b(plan|steps)\b/i.test(lowerText) && (/\b(only|don['']?t|do not|without)\b/i.test(lowerText) || /\b(sketch|rollout plan)\b/i.test(lowerText)) && /\b(deploy|implement|execute|rollout)\b/i.test(lowerText);

  if (isPlanWithoutExecute) {
    return 'read-only';
  }

  if ((phase === 'verification' || phase === 'operations') && action === 'assess' && /\b(verify|confirm|check)\b/i.test(lowerText) && /\b(config|configuration|readiness|ready)\b/i.test(lowerText)) {
    return 'read-only';
  }

  if (phase === 'recovery' && action === 'recover' && /\b(reconstruct|failed|what happened)\b/i.test(lowerText)) {
    return 'read-only';
  }

  if (phase === 'recovery' && action === 'recover' && /\b(repo state|repository state)\b/i.test(lowerText)) {
    return 'read-only';
  }

  if (phase === 'diagnosis' && action === 'investigate' && /\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Merge locally / hold push -> local-write
  if (phase === 'repository' && action === 'git' && /\b(merge|feature branch)\b/i.test(lowerText) && /\b(hold|don['']?t|do not|without|only)\b.*\bpush\b/i.test(lowerText)) {
    return 'local-write';
  }

  // Replay interrupted work from git -> local-write
  if (phase === 'recovery' && action === 'recover' && /\breplay\b/i.test(lowerText) && /\b(from|git)\b/i.test(lowerText)) {
    return 'local-write';
  }

  // Check flaky test -> read-only
  if (phase === 'implementation' && action === 'implement' && /\bcheck\b/i.test(lowerText) && /\bflaky\s+test\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Code/log/example content authority
  if (/\b(Error:|error:|Exception:|Log:|log:|Output:|output:|Logs?:)\b/i.test(lowerText) && /\b(production|prod|live)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Log output with production mention - already handled by provenance in composition
  // Fallback: check for explicit production deploy intent
  const hasExplicitDeployIntent = /\b(deploy|deployment|push to|roll out|rollout|promote|canary|blue-green|ship|publish|release\b.*\b(to|production|prod|live)|deploy\b.*\b(production|prod|live))\b/i.test(lowerText);

  if (hasExplicitDeployIntent && !isStagingDeploy(lowerText)) {
    // Check if production deploy is negated
    if (!isNegated(lowerText, 'deploy') && !isNegated(lowerText, 'production')) {
      return 'production-impacting';
    }
  }

  // Remote-write: only on explicit push/merge/remote keywords (not infrastructure nouns)
  if (/\b(push|pull request|rebase|cherry-pick|merge locally|hold the push|merge feature branch)\b/i.test(lowerText) && !isNegated(lowerText, 'push')) {
    if (!/\b(no|don['']?t|do not|without)\s+push\b/i.test(lowerText)) {
      return 'remote-write';
    }
  }

  // Local-write: explicit implementation/fix/modify/write keywords
  if (/\b(implement|fix|modify|change|update|refactor|add|create|write|patch|code|develop|build|locally|local|commit|stage|add idempotency|add feature flags|write integration tests|write unit tests|write contract tests|create risk matrix|add unit tests)\b/i.test(lowerText)) {
    const isActionNegated = isNegated(lowerText, action) ||
      /\bno\s+deploy\b/i.test(lowerText) ||
      /\bdo not\s+deploy\b/i.test(lowerText) ||
      /\bdon't\s+deploy\b/i.test(lowerText) ||
      /\bwithout\s+deploying\b/i.test(lowerText) ||
      /\bdon['']?t\s+implement\b/i.test(lowerText) ||
      /\bdo not\s+implement\b/i.test(lowerText) ||
      /\bwithout\s+implementing\b/i.test(lowerText);

    if (!isActionNegated) {
      if (phase === 'repository' && action === 'git') {
        return 'local-write';
      }
      return 'local-write';
    }
  }

  return 'read-only';
}

// Debug exports (temporary)
export { getBaseMutation, applyEnvironmentBinding, isProductionBound, isRemoteBound, ENVIRONMENT_SENSITIVE_ACTIONS };