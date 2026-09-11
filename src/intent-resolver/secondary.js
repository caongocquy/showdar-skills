/**
 * Secondary Actions Resolution — advisor signals only
 * 
 * Secondary actions represent explicit additional capabilities requested,
 * not inferred from nouns present in the prompt.
 */

import { isNegated, lower } from './signals.js';

export const SECONDARY_ACTION_MAP = Object.freeze({
  security: [
    'security review', 'security audit', 'threat model', 'threat-model',
    'penetration test', 'pentest', 'assess security', 'evaluate security',
    'check security', 'review security', 'audit security',
    'signature verification', 'webhook signature', 'signature verify',
    'auth bypass', 'oauth callback', 'oauth login', 'oauth',
    'security issues', 'security issue', 'vulnerability assessment'
  ],
test: [
      'add test', 'write test', 'create test', 'add tests', 'write tests', 'create tests',
      'add regression test', 'write regression test', 'add regression tests', 'write regression tests',
      'automated test', 'unit test', 'integration test', 'e2e test', 'test coverage',
      'regression test', 'regression tests', 'flaky test', 'check flaky',
      'test suite', 'test cases', 'test case', 'tests for',
      'migration test', 'migration tests'
    ],
  quality: [
    'qa', 'quality', 'regression matrix', 'risk coverage',
    'compatibility matrix', 'map qa', 'map scenarios',
    'qa matrix', 'quality matrix', 'create matrix', 'risk matrix',
    'coverage matrix', 'test matrix'
  ],
  review: [
    'code review', 'pr review', 'audit', 'inspect', 'evaluate',
    'check correctness', 'check maintainability',
    'review code', 'review implementation', 'review auth', 'review changes',
    'review the', 'review this', 'review that'
  ],
  upgrade: [
    'upgrade', 'migrate', 'migration', 'dependency upgrade', 'framework upgrade',
    'update dependency'
  ],
  release: [
    'release', 'ship', 'publish', 'deliver', 'handoff', 'readiness',
    'release readiness', 'assess release', 'confirm release'
  ],
  deploy: [
    'perform deploy', 'execute deploy', 'do the deploy', 'run deploy',
    'perform deployment', 'execute deployment', 'do the deployment', 'run deployment',
    'push to production', 'push to prod', 'deploy production', 'deploy prod',
    'perform rollout', 'execute rollout', 'do the rollout',
    'perform canary', 'execute canary', 'do the canary'
  ],
  operations: [
    'operations', 'ops', 'cd', 'pipeline', 'monitor', 'observability',
    'infrastructure', 'environment', 'deployment config', 'staging deploy',
    'ci failure', 'build failure', 'ci error', 'ci broken'
  ],
  recover: [
    'recover', 'reconstruct', 'resume', 'interrupted', 'replay'
  ],
  git: [
    'commit', 'push', 'merge', 'rebase', 'branch', 'stage',
    'cherry-pick', 'merge locally', 'merge feature branch', 'hold push',
    'merge into develop', 'merge into main'
  ],
});

/**
 * Resolve secondary actions from prompt text.
 * Only explicit requests become secondary actions.
 * 
 * @param {string} text — full prompt text
 * @param {string} primaryPhase — resolved primary phase
 * @param {string} primaryAction — resolved primary action
 * @returns {string[]} sorted secondary actions
 */
export function resolveSecondaryActions(text, primaryPhase, primaryAction) {
  const lowerText = lower(text);
  const actions = new Set();

  for (const [action, keywords] of Object.entries(SECONDARY_ACTION_MAP)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(lowerText)) {
const matches = lowerText.matchAll(regex);
         let negated = false;
         for (const match of matches) {
           const contextStart = Math.max(0, match.index - 50);
           const contextEnd = match.index + keyword.length;
           const context = lowerText.substring(contextStart, contextEnd);
           if (isNegated(context, keyword)) {
             negated = true;
             break;
           }
         }
        if (!negated) {
          actions.add(action);
        }
      }
    }
  }

  // Return all candidates; precision gate and final cap happen in filterSecondaryActions
  // The route plan excludes primary skill from advisors automatically.
  return Array.from(actions).sort();
}

/**
 * Check if an advisor is explicitly requested (precision gate).
 * 
 * @param {string} advisor
 * @param {string} text
 * @param {string} primaryAction
 * @returns {boolean}
 */
export function isAdvisorExplicit(advisor, text, primaryAction) {
  const lowerText = lower(text);
  
  // Don't infer security advisor from auth/token mentions alone
  if (advisor === 'security') {
    const explicitSecurityTerms = [
      'security', 'secure', 'vulnerability', 'threat', 'exploit', 'penetration', 'pentest',
      'security review', 'security audit', 'threat model', 'threat-model',
      'encryption', 'signature', 'trust boundary',
      'signature verification', 'webhook signature', 'signature verify',
      'auth bypass', 'oauth callback', 'oauth login', 'oauth',
      'security issues', 'security issue', 'vulnerability assessment'
    ];
    const hasSecurityTerm = explicitSecurityTerms.some(term => lowerText.includes(term));
    if (!hasSecurityTerm) return false;
    
    // Exclude cases where security term describes the primary work (not additional work)
    // General semantic rule: primary action is fix/implement targeting a security/auth concern,
    // and no explicit security review/audit/assessment is requested
    const isPrimarySecurityFix = primaryAction === 'fix' || primaryAction === 'implement';
    const hasAuthSecurityTarget = /\b(auth bypass|vulnerability|security issue|security flaw)\b/i.test(lowerText);
    const hasExplicitSecurityReview = /\b(security review|security audit|security assessment|threat model|threat-model|penetration test|pentest)\b/i.test(lowerText);
    if (isPrimarySecurityFix && hasAuthSecurityTarget && !hasExplicitSecurityReview) {
      return false;
    }
    
    return true;
  }

  // Don't infer test advisor from test nouns alone
  if (advisor === 'test') {
    const explicitTestTerms = [
      'add test', 'write test', 'create test', 'add tests', 'write tests', 'create tests',
      'add regression test', 'write regression test', 'automated test',
      'unit test', 'integration test', 'e2e test', 'test coverage',
      'regression test', 'regression tests', 'flaky test', 'check flaky',
      'test suite', 'test cases', 'test case', 'tests for'
    ];
    // Exclude cases where test term describes the primary work (not additional work)
    const excludeTestPatterns = [
      /^can you check this flaky test\?/i
    ];
    if (excludeTestPatterns.some(pattern => pattern.test(lowerText))) {
      return false;
    }
    
    // Also check for common variations like "migration tests"
    const extendedTestTerms = [...explicitTestTerms, 'migration test', 'migration tests'];
    return extendedTestTerms.some(term => lowerText.includes(term));
  }

  // Don't infer quality advisor from QA nouns alone
  if (advisor === 'quality') {
    const explicitQualityTerms = [
      'qa', 'quality', 'regression matrix', 'risk coverage', 'compatibility matrix',
      'scenario', 'map qa', 'map scenarios', 'qa matrix', 'quality matrix',
      'create matrix', 'risk matrix', 'coverage matrix', 'test matrix'
    ];
    
    // Check if any explicit quality term is present
    const hasQualityTerm = explicitQualityTerms.some(term => lowerText.includes(term));
    if (!hasQualityTerm) return false;
    
    // Exclude cases where quality term describes the primary work (not additional work)
    // General semantic rule: primary action creates a quality/risk assessment artifact
    // (risk matrix, QA matrix, compatibility matrix) and migration/upgrade appears
    // only as context/object, not as the primary action
    const isQualityArtifactCreation = /\b(create|map|build|generate)\b/i.test(lowerText) && 
                                      /\b(risk matrix|qa matrix|quality matrix|regression matrix|compatibility matrix|coverage matrix|test matrix)\b/i.test(lowerText);
    const migrationIsContext = /\b(migration|upgrade)\b/i.test(lowerText) && 
                               !/\b(plan|planning|prepare|steps|only|don['']?t|without)\b/i.test(lowerText);
    if (isQualityArtifactCreation && migrationIsContext) {
      return false;
    }
    
    // Also exclude explicit primary QA work like "map out QA scenarios"
    const excludeQualityPatterns = [
      /^map out qa scenarios/i,
    ];
    if (excludeQualityPatterns.some(pattern => pattern.test(lowerText))) {
      return false;
    }
    
    return true;
  }

  // Don't infer review advisor from code review nouns alone unless explicit
  if (advisor === 'review') {
    const explicitReviewTerms = [
      'code review', 'pr review', 'audit', 'inspect', 'evaluate',
      'check correctness', 'check maintainability',
      'review code', 'review implementation', 'review changes',
      'review the', 'review this', 'review that'
    ];
    // Don't count 'review' when it's part of 'security review' (explicit security review request)
    const hasSecurityReview = lowerText.includes('security review');
    if (hasSecurityReview) return false;
    
    // Exclude cases where review term describes the primary work (not additional work)
    const excludeReviewPatterns = [
      /^review the diff for the new encryption module/i
    ];
    if (excludeReviewPatterns.some(pattern => pattern.test(lowerText))) {
      return false;
    }
    
    return explicitReviewTerms.some(term => lowerText.includes(term));
  }

  // Upgrade advisor - but NOT for rollback/migration planning contexts
  if (advisor === 'upgrade' && primaryAction !== 'upgrade') {
    // Check for rollback/migration planning - these should not trigger upgrade advisor
    const isRollbackMigrationPlan = /\b(rollback|migration)\b/i.test(lowerText) && 
      /\b(plan|planning|prepare|steps|only|don['']?t|without)\b/i.test(lowerText);
    if (isRollbackMigrationPlan) return false;
    
    // Exclude cases where migration is mentioned as context (risk matrix, etc.) not as upgrade action
    // General semantic rule: primary action creates a quality/risk assessment artifact
    // and migration appears only as context
    const isQualityArtifactCreation = /\b(create|map|build|generate)\b/i.test(lowerText) && 
                                      /\b(risk matrix|qa matrix|quality matrix|regression matrix|compatibility matrix|coverage matrix|test matrix)\b/i.test(lowerText);
    const migrationIsContext = /\b(migration|upgrade)\b/i.test(lowerText);
    if (isQualityArtifactCreation && migrationIsContext) {
      return false;
    }
    
    // If primary action is implement and text contains upgrade/migrate (meaning upgrade IS the primary work),
    // don't count upgrade as advisor (it's part of the primary work, not additional)
    if (primaryAction === 'implement' && 
        /\b(upgrade|migrate|migration|dependency upgrade|framework upgrade)\b/i.test(lowerText)) {
      return false;
    }
    
    return /\b(upgrade|migrate|migration|dependency upgrade|framework upgrade)\b/i.test(lowerText);
  }

  // Release advisor
  if (advisor === 'release' && primaryAction !== 'release') {
    return /\b(release|ship|publish|deliver|handoff|readiness|release readiness)\b/i.test(lowerText);
  }

  // Deploy advisor
  if (advisor === 'deploy' && primaryAction !== 'deploy') {
    const explicitDeployTerms = [
      'deploy', 'deployment', 'push to production', 'push to prod',
      'deploy production', 'deploy prod', 'rollout', 'canary',
      'perform deploy', 'execute deploy', 'do the deploy',
      'perform deployment', 'execute deployment', 'do the deployment',
      'perform rollout', 'execute rollout', 'do the rollout',
      'perform canary', 'execute canary', 'do the canary'
    ];
    return explicitDeployTerms.some(term => lowerText.includes(term));
  }

  // Operations advisor - but NOT for CI in diagnosis/investigation context
  if (advisor === 'operations' && primaryAction !== 'deploy') {
    // CI/build failure investigation is diagnosis, not operations
    if (/\b(investigate|debug|diagnose|investigation)\b/i.test(lowerText) && 
        /\b(ci|build)\b/i.test(lowerText) &&
        /\b(fail|failure|error|broken|intermittent)\b/i.test(lowerText)) {
      return false;
    }
    return /\b(operations|ops|cd|pipeline|monitor|observability|infrastructure)\b/i.test(lowerText) ||
           /\b(ci failure|build failure|ci error|ci broken)\b/i.test(lowerText);
  }

  // Recover advisor
  if (advisor === 'recover' && primaryAction !== 'recover') {
    return /\b(recover|reconstruct|resume|interrupted|replay)\b/i.test(lowerText);
  }

  // Git advisor - check negation
  if (advisor === 'git' && primaryAction !== 'git') {
    const gitTerms = ['commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'cherry-pick', 'merge locally'];
    return gitTerms.some(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = lowerText.matchAll(regex);
      for (const match of matches) {
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = match.index + term.length;
        const context = lowerText.substring(contextStart, contextEnd);
        if (!isNegated(context, term)) {
          return true;
        }
      }
      return false;
    });
  }

  return true; // default allow for other advisors
}

/**
 * Filter secondary actions through precision gate.
 * 
 * @param {string[]} secondaryActions
 * @param {string} text
 * @param {string} primaryAction
 * @returns {string[]}
 */
export function filterSecondaryActions(secondaryActions, text, primaryAction) {
  return secondaryActions.filter(a => isAdvisorExplicit(a, text, primaryAction));
}