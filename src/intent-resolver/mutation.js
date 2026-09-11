/**
 * Mutation Resolution — independent from phase and constraints
 * 
 * Only DIRECT requested operations should establish mutation.
 * Mutation describes requested work, not prohibited work.
 * 
 * Precedence:
 * production-impacting > remote-write > local-write > read-only
 */

import { lower, extractKeywords, isNegated, isStagingDeploy, hasReadinessPattern } from './signals.js';
import { MUTATION_KEYWORDS } from './signals.js';

// Strong keywords that indicate clear write intent (not generic words that appear in read-only contexts)
const STRONG_REMOTE_WRITE = new Set(['push', 'pull request', 'rebase', 'cherry-pick', 'merge locally', 'hold the push', 'merge feature branch']);
const STRONG_LOCAL_WRITE = new Set(['fix', 'implement', 'refactor', 'write integration tests', 'write unit tests', 'write contract tests', 'add idempotency', 'add feature flags', 'add unit tests']);
const STRONG_PRODUCTION_IMPACTING = new Set(['deploy', 'deployment', 'production', 'prod', 'live', 'release', 'publish', 'ship', 'rollout', 'canary', 'blue-green', 'infrastructure', 'terraform', 'kubernetes', 'docker', 'container', 'deploy hotfix', 'deploy to prod', 'deploy production']);

/**
 * Resolve mutation from keyword signals and context.
 * 
 * Only DIRECT requested operations should establish mutation.
 * Mutation describes requested work, not prohibited work.
 * 
 * Precedence:
 * production-impacting > remote-write > local-write > read-only
 * 
 * @param {Map} keywordSignals — from extractKeywords(MUTATION_KEYWORDS)
 * @param {string} fullText — full prompt text
 * @param {string} phase — resolved phase
 * @param {string} action — resolved action
 * @returns {string}
 */
export function resolveMutation(keywordSignals, fullText, phase, action) {
  const lowerText = lower(fullText);
  
  // Check for readiness assessment -> read-only (not production-impacting)
  if (hasReadinessPattern(lowerText)) {
    return 'read-only';
  }

  // Staging deploy -> remote-write
  if (phase === 'operations' && action === 'deploy' && isStagingDeploy(lowerText)) {
    return 'remote-write';
  }

  // Context-aware read-only patterns (must come BEFORE general keyword checks)
  
  // Plan/prepare without execution -> read-only (not a write operation)
  // "prepare X but don't execute", "sketch plan", "plan rollout" = planning, not execution
  const isPlanWithoutExecute = (phase === 'planning' && action === 'plan' && /\b(only|do not|don't|without)\b/i.test(lowerText) && /\b(deploy|implement|execute|run|rollout)\b/i.test(lowerText)) ||
    /\b(sketch|prepare)\b/i.test(lowerText) && /\b(plan|steps)\b/i.test(lowerText) && (/\b(only|don['']?t|do not|without)\b/i.test(lowerText) || /\b(sketch|rollout plan)\b/i.test(lowerText)) && /\b(deploy|implement|execute|rollout)\b/i.test(lowerText);
  
  if (isPlanWithoutExecute) {
    return 'read-only';
  }

  // Verify/assess config or readiness -> read-only
  if ((phase === 'verification' || phase === 'operations') && action === 'assess' && /\b(verify|confirm|check)\b/i.test(lowerText) && /\b(config|configuration|readiness|ready)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Recovery/reconstruct from failure -> read-only (investigation, not mutation)
  if (phase === 'recovery' && action === 'recover' && /\b(reconstruct|failed|what happened)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Recover from repo state -> read-only (inspection only, not mutation)
  if (phase === 'recovery' && action === 'recover' && /\b(repo state|repository state)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // "X works but Y fails" investigation -> read-only
  if (phase === 'diagnosis' && action === 'investigate' && /\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Merge locally / hold push -> local-write (not remote-write)
  if (phase === 'repository' && action === 'git' && /\b(merge|feature branch)\b/i.test(lowerText) && /\b(hold|don['']?t|do not|without|only)\b.*\bpush\b/i.test(lowerText)) {
    return 'local-write';
  }

  // Replay interrupted work from git -> local-write
  if (phase === 'recovery' && action === 'recover' && /\breplay\b/i.test(lowerText) && /\b(from|git)\b/i.test(lowerText)) {
    return 'local-write';
  }

  // Check flaky test -> read-only (investigation, not implementation)
  if (phase === 'implementation' && action === 'implement' && /\bcheck\b/i.test(lowerText) && /\bflaky\s+test\b/i.test(lowerText)) {
    return 'read-only';
  }

  // Code/log/example content authority: mention of production in logs/examples
  // must not produce production-impacting
  if (/\b(Error:|error:|Exception:|Log:|log:|Output:|output:)\b/i.test(lowerText) && /\b(production|prod|live)\b/i.test(lowerText)) {
    // This is in a log/example context -> do not infer production mutation
    return 'read-only';
  }
  
  // Check for explicit production-impacting (but not staging)
  if (keywordSignals.has('production-impacting')) {
    const prodMatches = keywordSignals.get('production-impacting').matched;
    // Prefer strong non-negated matches
    for (const match of prodMatches) {
      if (STRONG_PRODUCTION_IMPACTING.has(match) && !isNegated(lowerText, match) && !isStagingDeploy(lowerText)) {
        return 'production-impacting';
      }
    }
    // Fallback: any non-negated match if no strong match
    for (const match of prodMatches) {
      if (!isNegated(lowerText, match) && !isStagingDeploy(lowerText)) {
        return 'production-impacting';
      }
    }
  }

  // Check for remote-write
  if (keywordSignals.has('remote-write')) {
    const remoteMatches = keywordSignals.get('remote-write').matched;
    // PR/pull request in review context is not remote-write
    const isPrReview = /\b(pr|pull request)\b/i.test(lowerText) && /\b(review|audit|check)\b/i.test(lowerText);
    if (!isPrReview) {
      // If ANY STRONG remote-write keyword is negated, user explicitly doesn't want remote-write
      const hasNegatedStrong = remoteMatches.some(m => STRONG_REMOTE_WRITE.has(m) && isNegated(lowerText, m));
      if (!hasNegatedStrong) {
        // Check for non-negated STRONG remote-write keywords
        const hasNonNegatedStrong = remoteMatches.some(m => STRONG_REMOTE_WRITE.has(m) && !isNegated(lowerText, m));
        if (hasNonNegatedStrong) {
          return 'remote-write';
        }
        // If no strong match, check if ANY remote-write keyword is negated
        const hasAnyNegated = remoteMatches.some(m => isNegated(lowerText, m));
        if (!hasAnyNegated) {
          // No negated keywords - safe to fall back to any non-negated weak keyword
          for (const match of remoteMatches) {
            if (!isNegated(lowerText, match)) {
              return 'remote-write';
            }
          }
        }
      }
    }
  }

  // Check for local-write
  if (keywordSignals.has('local-write')) {
    const localMatches = keywordSignals.get('local-write').matched;
    // If ANY STRONG local-write keyword is negated, user explicitly doesn't want local-write
    const hasNegatedStrong = localMatches.some(m => STRONG_LOCAL_WRITE.has(m) && isNegated(lowerText, m));
    if (!hasNegatedStrong) {
      // Check for non-negated STRONG local-write keywords - these indicate clear write intent
      const hasNonNegatedStrong = localMatches.some(m => STRONG_LOCAL_WRITE.has(m) && !isNegated(lowerText, m));
      if (hasNonNegatedStrong) {
        return 'local-write';
      }
      // If no strong match, check if ANY local-write keyword is negated
      const hasAnyNegated = localMatches.some(m => isNegated(lowerText, m));
      if (!hasAnyNegated) {
        // No negated keywords at all - safe to fall back to any non-negated weak keyword
        for (const match of localMatches) {
          if (!isNegated(lowerText, match)) {
            return 'local-write';
          }
        }
      }
    }
  }

  // Check for read-only
  if (keywordSignals.has('read-only')) {
    const readOnlyMatches = keywordSignals.get('read-only').matched;
    let negated = false;
    for (const match of readOnlyMatches) {
      if (isNegated(lowerText, match)) {
        negated = true;
        break;
      }
    }
    if (!negated) return 'read-only';
  }

  // Default based on phase/action context
  const writeActions = ['implement', 'modify', 'fix', 'create', 'add', 'write', 'patch', 'upgrade', 'deploy', 'recover', 'git'];
  const writePhases = ['implementation', 'design', 'operations', 'recovery', 'repository'];
  
  // Check if the action is negated
  const isActionNegated = isNegated(lowerText, action) || 
    /\bno\s+deploy\b/i.test(lowerText) ||
    /\bdo not\s+deploy\b/i.test(lowerText) ||
    /\bdon't\s+deploy\b/i.test(lowerText) ||
    /\bwithout\s+deploying\b/i.test(lowerText) ||
    /\bdon['']?t\s+implement\b/i.test(lowerText) ||
    /\bdo not\s+implement\b/i.test(lowerText) ||
    /\bwithout\s+implementing\b/i.test(lowerText);
  
  if (writeActions.includes(action) && !isActionNegated) {
    return 'local-write';
  }
  
  if (writePhases.includes(phase) && !isActionNegated) {
    return 'local-write';
  }

  return 'read-only';
}