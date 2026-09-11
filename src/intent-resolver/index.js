/**
 * Intent Resolver — Deterministic Semantic Signal Pipeline
 * 
 * Pipeline stages:
 * 1. sanitizePrompt — strip code blocks (highest authority for action/mutation)
 * 2. extractConstraints — prohibited operations
 * 3. resolvePhase — phase determination from general patterns
 * 4. resolveAction — action within phase
 * 5. resolveObject — domain target from broad signals
 * 6. resolveRisks — risk classification from domain signals
 * 7. resolveMutation — requested work type
 * 8. resolveEvidence — failure/cause/behavior state
 * 9. resolveSecondaryActions — advisor signals
 * 10. computeConfidence — signal clarity
 * 11. normalizeIntent — validate and canonicalize
 */

import { validateIntent, normalizeIntent } from '../intent.js';
import { extractConstraints } from './constraints.js';
import { extractKeywords, lower, PHASE_KEYWORDS, ACTION_KEYWORDS, OBJECT_KEYWORDS, RISK_KEYWORDS, MUTATION_KEYWORDS, EVIDENCE_KEYWORDS, NEGATION_PATTERNS, MULTI_INTENT_SEPARATORS, findBestMatch, isNegated, isActionNegated, EVIDENCE_KEYS, hasKnownCausePattern, hasFindRootCausePattern, hasReadinessPattern, isStagingDeploy } from './signals.js';
import { resolveSecondaryActions, filterSecondaryActions } from './secondary.js';
import { resolveObject } from './object.js';
import { resolveRisks } from './risks.js';
import { resolveMutation } from './mutation.js';
import { resolveEvidence } from './evidence.js';
import { computeConfidence } from './confidence.js';

export const INTENT_RESOLVER_VERSION = '2.0.0';

/**
 * Detect multi-intent segments.
 */
function detectMultiIntent(text) {
  const segments = [];
  let currentSegment = text;
  for (const separator of MULTI_INTENT_SEPARATORS) {
    const parts = currentSegment.split(new RegExp(`\\s*${separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'));
    if (parts.length > 1) {
      segments.push(...parts.filter(p => p.trim().length > 0));
      currentSegment = segments[segments.length - 1] || '';
    }
  }
  if (segments.length <= 1) return null;
  return segments.map(s => s.trim()).filter(s => s.length > 10);
}

/**
 * Strip code blocks from text (highest authority for action/mutation resolution).
 */
function sanitizePrompt(text) {
  let result = text.replace(/```[\s\S]*?```/g, '');
  result = result.replace(/`[^`]+`/g, '');
  return result;
}

/**
 * Resolve phase from general patterns.
 * This is the core phase resolution logic - keeps GENERAL_SIGNAL and GENERAL_PRECEDENCE patterns.
 */
function resolvePhase(text) {
  const lowerText = lower(text);
  const found = extractKeywords(text, PHASE_KEYWORDS);

  // Implement + security review/test -> implementation (not verification)
  // But only if implement is NOT negated (e.g., "don't implement")
  const hasNonNegatedImplForSecReview = /\b(implement|build|create|add|develop|code|fix|modify|change|update|refactor|patch)\b/i.test(lowerText) &&
    !isNegated(lowerText, 'implement') &&
    !isNegated(lowerText, 'build') &&
    !isNegated(lowerText, 'create') &&
    !isNegated(lowerText, 'add') &&
    !isNegated(lowerText, 'develop') &&
    !isNegated(lowerText, 'fix') &&
    !isNegated(lowerText, 'modify') &&
    !isNegated(lowerText, 'change') &&
    !isNegated(lowerText, 'update') &&
    !isNegated(lowerText, 'refactor') &&
    !isNegated(lowerText, 'patch');
  
  if (hasNonNegatedImplForSecReview && /\b(security review|add tests?|regression tests?)\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Threat model / security audit / audit security -> discovery
  if (/\b(threat model|threat-model|security audit|security review|audit security)\b/i.test(lowerText)) {
    return 'discovery';
  }

  // "What does X do" / "Explain X" -> discovery (understanding/documentation)
  if (/\b(what does|explain|how does|how do|describe|walk me through)\b/i.test(lowerText)) {
    return 'discovery';
  }

  // Explicit review/audit without implement -> verification
  // Check if implementation verbs are negated (e.g., "do not change")
  const hasNonNegatedImpl = /\b(implement|build|create|add|develop|write|fix|modify|update|refactor|patch)\b/i.test(lowerText) ||
    (/\bchange\b/i.test(lowerText) && !isNegated(lowerText, 'change'));
  
  if (/\b(review|audit|code review|pr review)\b/i.test(lowerText) && !hasNonNegatedImpl) {
    return 'verification';
  }

  // Prepare/planning without execution -> planning
  if (/\b(prepare|plan|planning)\b/i.test(lowerText) && 
      /\b(only|do not|don't|without)\b/i.test(lowerText) &&
      /\b(deploy|implement|execute|run)\b/i.test(lowerText)) {
    return 'planning';
  }

  // Readiness assessment -> delivery
  if (hasReadinessPattern(lowerText)) {
    return 'delivery';
  }

  // Known-cause fix -> implementation (not diagnosis)
  if (hasKnownCausePattern(lowerText) && /\b(fix|implement|modify|patch|repair|resolve)\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Find-root-cause -> diagnosis
  if (hasFindRootCausePattern(lowerText) && !hasKnownCausePattern(lowerText)) {
    return 'diagnosis';
  }

  // Implement with approved/defined behavior -> implementation
  if (/\bimplement\b/i.test(lowerText) && /\b(approved|acceptance criteria|according to)\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Write/add/create tests as PRIMARY -> verification (when no implementation keywords)
  if (/\b(write|add|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|regression\s+)?tests?\b/i.test(lowerText) &&
      !/\b(implement|build|upgrade|migrate|fix|modify|change|update|refactor|patch)\b/i.test(lowerText)) {
    return 'verification';
  }

  // QA/QC matrix/scenario planning -> verification
  // Note: "create" is allowed here because creating a matrix/scenario is not implementation
  // "code" is excluded when part of "test code" / "no code" context
  const hasNonNegatedImplForQA = /\b(implement|build|add|develop|write|fix|modify|change|update|refactor|patch)\b/i.test(lowerText) ||
    (/\bcode\b/i.test(lowerText) && !/\b(test code|no code|code review|code coverage|code quality)\b/i.test(lowerText));
  
  if (/\b(qa|quality|regression matrix|matrix|scenario|coverage)\b/i.test(lowerText) &&
      !hasNonNegatedImplForQA) {
    return 'verification';
  }

  // Recover without git -> recovery
  if (/\b(recover|reconstruct|resume|interrupted|lost|context|state|where was i|replay)\b/i.test(lowerText) &&
      !/\b(commit|push|merge|rebase|branch|stage)\b/i.test(lowerText) &&
      !(/\bgit\b/i.test(lowerText) && !/\breplay\b/i.test(lowerText))) {
    return 'recovery';
  }

  // Commit/merge/rebase/push without implement -> repository
  if (/\b(commit|merge|rebase|push|stage|cherry-pick)\b/i.test(lowerText) && !/\b(implement|build|create|add|develop|write|fix|modify|change|update|refactor|patch)\b/i.test(lowerText)) {
    return 'repository';
  }

  // Penetration test / pentest -> discovery (not verification)
  if (/\b(penetration test|pentest)\b/i.test(lowerText)) {
    return 'discovery';
  }

  // "X works but Y fails" pattern -> diagnosis (investigating a specific failure)
  if (/\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  // Rollback in planning -> planning
  if (/\b(rollback)\b/i.test(lowerText) && /\b(plan|planning|migration)\b/i.test(lowerText)) {
    return 'planning';
  }

  // Rollback with operations keywords -> operations
  if (/\b(rollback)\b/i.test(lowerText) && /\b(deploy|production|prod|ops|operations|ci|cd|pipeline|monitor|observability)\b/i.test(lowerText)) {
    return 'operations';
  }

  // Upgrade without regression tests -> implementation
  if (/\b(upgrade|migrate)\b/i.test(lowerText) && !/\b(regression test|add test|write test|add tests|write tests)\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Deploy -> operations (unless negated)
  const isDeployNegated = /\bno\s+deploy\b/i.test(lowerText) || /\bdon['']?t\s+deploy\b/i.test(lowerText) || /\bwithout\s+deploy\b/i.test(lowerText);
  
  if (/\b(deploy|deployment)\b/i.test(lowerText) && !isDeployNegated && !/\b(plan|planning|prepare|steps)\b/i.test(lowerText)) {
    return 'operations';
  }

  // CI failure investigation -> diagnosis
  if (/\b(ci|build)\b/i.test(lowerText) && /\b(fail|failure|error|broken)\b/i.test(lowerText) && /\b(investigate|debug|diagnose|why|intermittent|no confirmed cause)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  // Intermittent/flaky -> diagnosis
  if (/\b(intermittent|flaky)\b/i.test(lowerText)) {
    // But "check flaky test" with implementation intent -> implementation
    if (/\bcheck\b/i.test(lowerText) && /\bflaky\s+test\b/i.test(lowerText)) {
      return 'implementation';
    }
    return 'diagnosis';
  }

  // "X works but Y fails" pattern -> diagnosis (investigating a specific failure)
  if (/\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  // Failure observation -> diagnosis
  if (/\b(fails|failing|crash|crashes|error|broken|bug|issue|problem|doesn't work|not working)\b/i.test(lowerText) && 
      /\b(investigate|debug|diagnose|find|root cause|why|reproduce|isolate)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  // Default to keyword best match, fallback to implementation
  return findBestMatch(found, 'implementation');
}

/**
 * Resolve action within a phase.
 */
function resolveAction(text, phase) {
  const lowerText = lower(text);
  const found = extractKeywords(text, ACTION_KEYWORDS);

  // QA/quality/matrix/scenario/coverage in verification -> test
  if (phase === 'verification' && /\b(qa|quality|matrix|scenario|coverage)\b/i.test(lowerText)) return 'test';
  if (phase === 'planning' && /\b(rollback|prepare|plan)\b/i.test(lowerText)) return 'plan';
  if (phase === 'operations' && /\b(rollback)\b/i.test(lowerText)) return 'plan';
  if (phase === 'operations' && /\b(verify|confirm)\b/i.test(lowerText)) return 'assess';
  if (phase === 'delivery' && hasReadinessPattern(lowerText)) return 'assess';
  if (phase === 'discovery' && /\b(penetration test|pentest|threat model|threat-model|security audit|security review|audit security)\b/i.test(lowerText)) return 'assess';
  if (phase === 'verification' && /\b(verify|confirm)\b/i.test(lowerText)) return 'assess';
  
  // Write/add/create tests in verification -> test
  if (phase === 'verification' && /\b(write|add|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+)?tests?\b/i.test(lowerText)) return 'test';
  
  // Recovery replay -> recover
  if (phase === 'recovery' && /\breplay\b/i.test(lowerText)) return 'recover';
  
  // Upgrade + add tests -> implement (primary work is implementation) - CHECK FIRST
  if (phase === 'implementation' && /\b(upgrade|migrate)\b/i.test(lowerText) && /\b(add|write|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|migration\s+)?tests?\b/i.test(lowerText)) return 'implement';

  // Upgrade without tests -> upgrade
  if (phase === 'implementation' && /\b(upgrade|migrate)\b/i.test(lowerText) && !/\b(add|write|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|migration\s+)?tests?\b/i.test(lowerText)) return 'upgrade';

  // Investigation -> investigate (before fix, because "find root cause" is investigation)
  // Priority: investigation keywords with root cause patterns override fix/implement
  if (/\b(find the root cause|find root cause|determine the (root )?cause|what (caused|is causing)|why (did|does|is))\b/i.test(lowerText)) {
    return 'investigate';
  }
  // General investigation without fix/implement
  if (/\b(investigate|debug|diagnose|troubleshoot|reproduce|isolate)\b/i.test(lowerText) && 
      !/\b(implement|build|create|add|develop|write|feature|fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'investigate';

  // Fix -> fix
  if (/\b(fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'fix';

  // Git operations -> git
  if (/\b(commit|push|merge|rebase|branch|stage|cherry-pick|merge locally)\b/i.test(lowerText)) return 'git';

  // Fix -> fix
  if (/\b(fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'fix';

  // Implement -> implement (code as noun in "auth code" should not match)
  if (/\b(implement|build|create|add|develop|write|feature)\b/i.test(lowerText)) return 'implement';

  // Phase-specific action defaults
  const phaseActions = {
    discovery: ['understand', 'investigate', 'assess'],
    definition: ['define', 'assess', 'review'],
    planning: ['plan', 'define', 'review'],
    design: ['design', 'review', 'modify'],
    implementation: ['implement', 'modify', 'fix', 'upgrade'],
    diagnosis: ['investigate', 'reproduce', 'isolate', 'fix'],
    verification: ['test', 'review', 'assess'],
    delivery: ['assess', 'release', 'review'],
    operations: ['deploy', 'modify', 'assess', 'review'],
    recovery: ['recover', 'investigate'],
    repository: ['git', 'modify', 'review'],
  };
  const allowed = phaseActions[phase] ?? ['implement', 'modify', 'fix'];
  for (const action of allowed) {
    if (found.has(action)) return action;
  }
  return allowed[0];
}

/**
 * Extract signals for meta output.
 */
function extractSignals(intent, text) {
  const signals = [];
  const lowerText = lower(text);
  signals.push(`phase:${intent.phase}`);
  signals.push(`action:${intent.action}`);
  signals.push(`object:${intent.object}`);
  for (const risk of intent.risks) signals.push(`risk:${risk}`);
  signals.push(`mutation:${intent.mutation}`);
  for (const key of EVIDENCE_KEYS) {
    if (intent.evidence[key] !== null) signals.push(`evidence:${key}=${intent.evidence[key]}`);
  }
  for (const action of intent.secondaryActions) signals.push(`secondary:${action}`);
  for (const { pattern } of NEGATION_PATTERNS) {
    if (pattern.test(lowerText)) { signals.push('negation:present'); break; }
  }
  const codeBlockMatches = lowerText.match(/```[\s\S]*?```/g);
  if (codeBlockMatches && codeBlockMatches.length > 0) signals.push('code-block:present');
  return signals;
}

/**
 * Identify unresolved fields.
 */
function identifyUnresolved(text, intent, confidence) {
  const unresolved = [];
  if (intent.phase === 'implementation' && intent.action === 'implement') {
    if (intent.evidence.behaviorDefined === null) unresolved.push('behaviorDefined');
  }
  if (intent.evidence.failureObserved === null && (intent.phase === 'diagnosis' || intent.action === 'fix')) {
    unresolved.push('failureObserved');
  }
  if (intent.evidence.rootCauseKnown === null && (intent.phase === 'diagnosis' || intent.action === 'fix')) {
    unresolved.push('rootCauseKnown');
  }
  if (intent.risks.length === 0 && (intent.mutation === 'local-write' || intent.mutation === 'production-impacting')) {
    unresolved.push('risks');
  }
  if (confidence === 'low') unresolved.push('confidence:low');
  return unresolved;
}

/**
 * Main resolver function.
 */
export function resolveIntentFromPrompt(prompt, context = {}) {
  const originalText = String(prompt ?? '');
  const sanitizedText = sanitizePrompt(originalText);

  // Stage 1: Extract constraints
  const constraints = extractConstraints(originalText);

  // Stage 2: Resolve phase and action from sanitized text
  const phase = resolvePhase(sanitizedText);
  const action = resolveAction(sanitizedText, phase);

  // Stage 3: Extract object signals
  const objectSignals = extractKeywords(sanitizedText, OBJECT_KEYWORDS);
  const object = resolveObject(objectSignals, phase, action, sanitizedText);

  // Stage 4: Resolve risks
  const riskSignals = extractKeywords(sanitizedText, RISK_KEYWORDS);
  const risks = resolveRisks(riskSignals, sanitizedText, phase, action, object);

  // Stage 5: Resolve mutation
  const mutationSignals = extractKeywords(sanitizedText, MUTATION_KEYWORDS);
  const mutation = resolveMutation(mutationSignals, sanitizedText, phase, action);

  // Stage 6: Resolve evidence
  const evidenceSignals = {
    failureObserved: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.failureObserved),
    rootCauseKnown: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.rootCauseKnown),
    behaviorDefined: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.behaviorDefined),
  };
  const evidence = resolveEvidence(evidenceSignals, sanitizedText);

  // Stage 7: Resolve secondary actions
  const rawSecondary = resolveSecondaryActions(sanitizedText, phase, action);
  const secondaryActions = filterSecondaryActions(rawSecondary, sanitizedText, action).slice(0, 2);

  // Stage 8: Build and validate intent
  const intentInput = { phase, action, secondaryActions, object, risks, mutation, evidence };
  const validation = validateIntent(intentInput);
  if (!validation.ok) throw new Error(`Resolved intent invalid: ${validation.errors.join('; ')}`);
  const intent = validation.value;

  // Stage 9: Compute confidence
  const confidence = computeConfidence(sanitizedText, intent);

  // Stage 10: Extract signals and unresolved
  const signals = extractSignals(intent, sanitizedText);
  const unresolved = identifyUnresolved(sanitizedText, intent, confidence);

  return {
    intent,
    constraints,
    confidence,
    signals,
    unresolved,
    meta: {
      version: INTENT_RESOLVER_VERSION,
      sourceTextLength: originalText.length,
      processedTextLength: sanitizedText.length,
      hasCodeBlocks: originalText !== sanitizedText,
      hasNegation: signals.includes('negation:present'),
      multiIntent: detectMultiIntent(sanitizedText),
    },
  };
}

/**
 * Sync wrapper.
 */
export function resolveIntentFromPromptSync(prompt, context = {}) {
  return resolveIntentFromPrompt(prompt, context);
}

/**
 * Public API.
 */
export const resolverApi = {
  resolveIntentFromPrompt,
  resolveIntentFromPromptSync,
  INTENT_RESOLVER_VERSION,
};