/**
 * Evidence Resolution — single-pass precedence per field
 * 
 * Collect signals first, resolve each field exactly once.
 * Do not derive evidence from task type.
 * 
 * failureObserved:
 * - true: explicit observed malfunction
 * - false: explicit success/stable (only when observing a running system)
 * - null: not established
 * 
 * rootCauseKnown:
 * - true: explicit known cause
 * - false: explicit unknown/investigate cause request
 * - null: not established
 * 
 * behaviorDefined:
 * - true: explicit specification/defined expected behavior
 * - false: explicit undefined/missing requirements
 * - null: not established
 */

import { lower, extractKeywords, hasKnownCausePattern, hasFindRootCausePattern } from './signals.js';
import { EVIDENCE_KEYWORDS } from './signals.js';

/**
 * Resolve evidence from keyword signals and context.
 * 
 * @param {Object} evidenceKeywordSignals — { failureObserved: Map, rootCauseKnown: Map, behaviorDefined: Map }
 * @param {string} fullText — full prompt text
 * @returns {{ failureObserved: boolean|null, rootCauseKnown: boolean|null, behaviorDefined: boolean|null }}
 */
export function resolveEvidence(evidenceKeywordSignals, fullText) {
  const lowerText = lower(fullText);
  const evidence = {
    failureObserved: null,
    rootCauseKnown: null,
    behaviorDefined: null,
  };

  // Collect signals per field from keywords
  const failureTrue = evidenceKeywordSignals.failureObserved?.get('true');
  const failureFalse = evidenceKeywordSignals.failureObserved?.get('false');
  const rootTrue = evidenceKeywordSignals.rootCauseKnown?.get('true');
  const rootFalse = evidenceKeywordSignals.rootCauseKnown?.get('false');
  const behaviorTrue = evidenceKeywordSignals.behaviorDefined?.get('true');
  const behaviorFalse = evidenceKeywordSignals.behaviorDefined?.get('false');

  // === CONTEXT PATTERNS (collected before resolution) ===
  
  // failureObserved context patterns
  const hasExplicitFailure = 
    hasKnownCausePattern(lowerText) ||
    /\b(ci|build)\b/i.test(lowerText) && /\b(fail|failure|error|broken)\b/i.test(lowerText) ||
    /\b(failed\s+deploy|deploy\s+failed|deployment\s+failed|failed\s+deployment|rollback\s+fails)\b/i.test(lowerText) ||
    /\bintermittent\w*\b/i.test(lowerText) && /\b(connection|502|flaky|fail|test suite)\b/i.test(lowerText) ||
    /\bmemory leak\b/i.test(lowerText) ||
    /\bconnection refused\b/i.test(lowerText) ||
    /\b502\b/i.test(lowerText) && /\b(gateway|upstream)\b/i.test(lowerText) ||
    /\b(login crash|auth bypass|null token|null-token)\b/i.test(lowerText) ||
    (/\b(investigate|debug|diagnose|troubleshoot)\b/i.test(lowerText) && 
     /\b(unknown|no known cause|no confirmed cause|don't know|unclear)\b/i.test(lowerText));

  const hasExplicitSuccess = 
    /\b(all tests pass|deploy succeeded|deployment successful|works correctly|stable|no issues)\b/i.test(lowerText);

  // rootCauseKnown context patterns
  const hasExplicitKnownCause = hasKnownCausePattern(lowerText);
  const hasExplicitUnknownCause = hasFindRootCausePattern(lowerText) || 
    /\b(no known cause|unknown cause|root cause unknown|cause unknown|no confirmed cause|no logs|what happened in the|what caused the)\b/i.test(lowerText) ||
    /\berror:\s+[a-z0-9_ -]+/i.test(lowerText) ||
    /\brollback\s+fails\b/i.test(lowerText);
  
  // But "not known" in context of business rule/requirements is about behavior, not root cause
  const isBusinessRuleNotKnown = /\bbusiness rule\b/i.test(lowerText) && /\bnot known\b/i.test(lowerText);
  const isRequirementsNotKnown = /\b(requirements?|spec|specification|acceptance criteria)\b/i.test(lowerText) && /\bnot (defined|known|decided)\b/i.test(lowerText);
  
  // Adjust unknown cause if it's about business rule/requirements
  if (isBusinessRuleNotKnown || isRequirementsNotKnown) {
    // Don't set rootCauseKnown to false for these
  }

  // behaviorDefined context patterns
  const hasExplicitSpec = 
    /\b(acceptance criteria|according to (spec|specification|requirements?)|defined behavior|defined expected|specified behavior|specified expected|clear requirements?|clear spec|well defined|fully defined)\b/i.test(lowerText) ||
    (/\b(implement|build|create|add|develop|write|fix)\b/i.test(lowerText) && 
     /\b(approved|acceptance criteria|according to|specified|defined behavior|according to spec|according to specification|design doc|specification)\b/i.test(lowerText) &&
     !/\b(plan|prepare|planning)\b/i.test(lowerText)) ||
    (/\b(idempotency|webhook)\b/i.test(lowerText) && 
     /\b(handler|retry|circuit breaker|validation|verify|signature)\b/i.test(lowerText)) ||
    (/\bfeature flags?\b/i.test(lowerText) && /\b(implement|add|create)\b/i.test(lowerText)) ||
    (/\bauth bypass\b/i.test(lowerText) && /\b(fix|repair|resolve)\b/i.test(lowerText)) ||
    (/\bfix\b/i.test(lowerText) && /\bcause is the\b/i.test(lowerText)) ||
    (/\bimplement\b/i.test(lowerText) && /\bwebhook\b/i.test(lowerText) && (/\btests?\b/i.test(lowerText) || /\bsecurity review\b/i.test(lowerText)));

  const hasExplicitUndefined = 
    (/\bbusiness rule\b/i.test(lowerText) && /\bnot known\b/i.test(lowerText)) ||
    /\b(requirements?|business rule|spec|specification|acceptance criteria)\b.*\b(not\s+)?(defined|known|decided|missing|undefined|unclear|ambiguous)\b/i.test(lowerText) ||
    (/\b(document|define|specify|clarify)\b.*\b(api|contract|requirements?|business rule|spec|specification|acceptance criteria)\b/i.test(lowerText) && 
     !/\b(approved|defined|known|decided|missing|documented)\b/i.test(lowerText));

  // Test-writing context (tests don't define behavior, don't observe failure)
  const isTestWritingPrimary = 
    /\b(write|add|create)\s+(automated\s+)?(regression\s+)?tests?\b/i.test(lowerText) && 
    !/\b(implement|build|create|add|develop|fix|modify)\b/.test(lowerText.replace(/write|add|create/gi, ''));

  // Planning context (planning doesn't define behavior yet)
  const isPlanningContext = 
    /\b(plan|prepare|planning)\b/i.test(lowerText) && 
    !/\b(implement|build|create|add|develop|write|fix)\b/i.test(lowerText);

  // === RESOLVE EACH FIELD ONCE USING PRECEDENCE ===

  // failureObserved: explicit context > keyword signals > null
  if (hasExplicitFailure) {
    evidence.failureObserved = true;
  } else if (hasExplicitSuccess) {
    evidence.failureObserved = false;
  } else if (failureTrue && !failureFalse) {
    evidence.failureObserved = true;
  } else if (failureFalse && !failureTrue) {
    evidence.failureObserved = false;
  } else if (failureTrue && failureFalse) {
    evidence.failureObserved = failureTrue.count > failureFalse.count ? true : false;
  }
  // Test-writing resets failureObserved (tests are for known bugs, not observed failures)
  if (isTestWritingPrimary && evidence.failureObserved !== false) {
    evidence.failureObserved = null;
  }

  // rootCauseKnown: explicit context > keyword signals > null
  // But don't infer rootCauseKnown=false from business rule/requirements "not known"
  const shouldSetRootCauseUnknown = hasExplicitUnknownCause && !(isBusinessRuleNotKnown || isRequirementsNotKnown);
  
  // If business rule/requirements context, don't use keyword signals for rootCauseKnown
  // (keywords like "not known" apply to behavior, not root cause)
  const useKeywordRootCause = !(isBusinessRuleNotKnown || isRequirementsNotKnown);
  
  if (hasExplicitKnownCause) {
    evidence.rootCauseKnown = true;
  } else if (shouldSetRootCauseUnknown) {
    evidence.rootCauseKnown = false;
  } else if (useKeywordRootCause) {
    // Only use keyword signals when not in business rule/requirements context
    if (rootTrue && !rootFalse) {
      evidence.rootCauseKnown = true;
    } else if (rootFalse && !rootTrue) {
      evidence.rootCauseKnown = false;
    } else if (rootTrue && rootFalse) {
      evidence.rootCauseKnown = rootTrue.count > rootFalse.count ? true : false;
    }
  }

  // behaviorDefined: explicit context > keyword signals > null
  // Explicit undefined beats explicit spec
  // In planning context, don't use keyword signals for behaviorDefined (planning doesn't define behavior)
  const useKeywordBehavior = !isPlanningContext;
  
  if (hasExplicitUndefined) {
    evidence.behaviorDefined = false;
  } else if (hasExplicitSpec && !isPlanningContext) {
    evidence.behaviorDefined = true;
  } else if (useKeywordBehavior) {
    if (behaviorTrue && !behaviorFalse) {
      evidence.behaviorDefined = true;
    } else if (behaviorFalse && !behaviorTrue) {
      evidence.behaviorDefined = false;
    } else if (behaviorTrue && behaviorFalse) {
      evidence.behaviorDefined = behaviorTrue.count > behaviorFalse.count ? true : false;
    }
  }
  // Test-writing resets behaviorDefined (tests don't define behavior)
  if (isTestWritingPrimary) {
    evidence.behaviorDefined = null;
  }

  return evidence;
}