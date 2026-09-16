/**
 * Intent Resolver — Deterministic Structural Authority Engine (Phase 6F T20)
 *
 * Authoritative path: assembleRequestFrame → resolveStructuralIntent → buildThinRoutePlan
 * Legacy keyword-based resolver preserved as resolveLegacyIntent for diagnostics only.
 * No legacy authority fallback exists after cutover.
 */

import { validateIntent, normalizeIntent, RISK_CAPABILITIES } from '../intent.js';
import { assembleRequestFrame } from './frame/request-frame.js';
import { resolveStructuralIntent, resolvePrimaryCapability, projectConservativeIntent } from './frame/projectors/index.js';
import { buildThinRoutePlan } from '../route-plan.js';
import { runAuthorityShadow } from './frame/authority/shadow.js';

export const INTENT_RESOLVER_VERSION = '2.0.0';

/**
 * Legacy keyword-based resolver (pre-composition, from 07496ae).
 * Preserved for diagnostics and the T20 proof test only.
 * NEVER consulted on any authority decision after structural cutover.
 */
export function resolveLegacyIntent(prompt) {
  const originalText = String(prompt ?? '');
  const sanitizedText = sanitizePrompt(originalText);

  // Stage 1: Extract constraints
  const constraints = extractConstraints(originalText);

  // Stage 2: Resolve phase and action from sanitized text (keyword-based)
  const phase = resolvePhase(sanitizedText);
  const action = resolveAction(sanitizedText, phase);

  // Stage 3: Extract object signals
  const objectSignals = extractKeywords(sanitizedText, OBJECT_KEYWORDS);
  const object = resolveObject(objectSignals, phase, action, sanitizedText);

  // Stage 4: Resolve risks
  const riskSignals = extractKeywords(sanitizedText, RISK_KEYWORDS);
  const risks = resolveRisks(riskSignals, sanitizedText, phase, action, object);

  // Stage 5: Resolve mutation (keyword-based)
  const mutationSignals = extractKeywords(sanitizedText, MUTATION_KEYWORDS);
  const mutation = resolveMutation(mutationSignals, sanitizedText, phase, action);

  // Stage 6: Resolve evidence
  const evidenceSignals = {
    failureObserved: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.failureObserved),
    rootCauseKnown: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.rootCauseKnown),
    behaviorDefined: extractKeywords(sanitizedText, EVIDENCE_KEYWORDS.behaviorDefined),
  };
  const evidence = resolveEvidence(evidenceSignals, sanitizedText);

  // Stage 7: Resolve secondary actions (keyword-based)
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
      engine: 'legacy',
      usesLegacyAuthority: true,
    },
  };
}

/**
 * Reported-speech attribution guard (Phase 6F T20).
 * A single unattributed direct instruction whose verb phrase follows a
 * third-party reporting matrix ("documentation says X", "docs state X")
 * names the operation without requesting it. Structural uncertainty must
 * degrade to conservative authority, never the stronger legacy authority
 * the keyword path would have granted.
 */
function isUnattributedReport(text) {
  return /\b(documentation|docs?|runbook|manual|guide|wiki|readme|article|page|note|notes)\b[^.?!]{0,40}\b(says?|say|states?|describes?|mentions?|notes?|tells?|instructs?|directs?|commands?|demands?)\b/i.test(text);
}

function conservativeReportIntent() {
  return {
    phase: 'discovery',
    action: 'understand',
    secondaryActions: [],
    object: 'repository',
    risks: [],
    mutation: 'read-only',
    evidence: { rootCauseKnown: null, behaviorDefined: null, failureObserved: null },
  };
}

/**
 * Structural authoritative resolver (Phase 6F T20).
 * Path: assembleRequestFrame → resolveStructuralIntent → buildThinRoutePlan
 */
export function resolveIntentFromPrompt(prompt, context = {}) {
  const originalText = String(prompt ?? '');
  const sanitizedText = sanitizePrompt(originalText);

  // Stage 1: Assemble RequestFrame from raw prompt
  const requestFrame = assembleRequestFrame(originalText);

  // Stage 2: Resolve structural intent (primary → mutation → gates → secondaries → metadata)
  let structuralIntent = resolveStructuralIntent(requestFrame);
  // Schema conformance: structural metadata may emit informational risk tokens
  // outside the public RISK_CAPABILITIES set; the public contract admits only
  // known values, so drop unknown tokens here (never escalate, never infer).
  if (Array.isArray(structuralIntent.risks)) {
    structuralIntent = {
      ...structuralIntent,
      risks: structuralIntent.risks.filter((r) => RISK_CAPABILITIES.includes(r)),
    };
  }
  let diagnostics = requestFrame.diagnostics;
  // Unattributed-report downgrade (reported operation names no authority):
  // both the public Intent AND the routing capability degrade together —
  // routing the downgraded intent with the original capability would
  // reintroduce the refused authority through the back door.
  const reportDowngraded = structuralIntent.mutation !== 'read-only' && isUnattributedReport(sanitizedText);
  if (reportDowngraded) {
    structuralIntent = conservativeReportIntent();
    diagnostics = [
      ...diagnostics,
      { code: 'NO_GOVERNING_ACTION', detail: 'Reported operation names no authorized governing action; degraded to conservative authority' },
    ];
  }

  // Stage 3: Build thin route plan (internal primaryCapability → primary
  // skill + advisors; spec §8A). The capability derives ONLY from the
  // GOVERNING ActionFrame; the thin map covers characterized capabilities,
  // and an unmapped structural intent keeps its faithful intent (public
  // contract) while routing degrades to the conservative read-only route
  // (uncertainty reduces authority, never falls back to legacy scoring).
  const primaryCapability = reportDowngraded ? 'understand' : resolvePrimaryCapability(requestFrame);
  let thinRoute;
  try {
    thinRoute = buildThinRoutePlan(structuralIntent, { primaryCapability });
  } catch {
    thinRoute = buildThinRoutePlan({ ...projectConservativeIntent(diagnostics), secondaryActions: [] });
  }

  // Stage 4: Compute confidence (structural uses conservative confidence)
  const confidence = computeStructuralConfidence(requestFrame, structuralIntent);

  // Stage 5: Extract signals and unresolved
  const signals = extractStructuralSignals(structuralIntent, sanitizedText);
  const unresolved = identifyUnresolved(sanitizedText, structuralIntent, confidence);

  // Constraints extracted from original text for backward compatibility
  const constraints = extractConstraints(originalText);

  // Authority shadow (Phase 6G T03): diagnostic-only, append-only.
  // Computed in try/catch; errors swallowed — never breaks production.
  let authorityShadow;
  try {
    authorityShadow = runAuthorityShadow(originalText);
  } catch {
    // Shadow must never break production
  }

  const meta = {
    version: INTENT_RESOLVER_VERSION,
    sourceTextLength: originalText.length,
    processedTextLength: sanitizedText.length,
    hasCodeBlocks: originalText !== sanitizedText,
    hasNegation: signals.includes('negation:present'),
    multiIntent: detectMultiIntent(sanitizedText),
    // Phase 6F T20: Structural authoritative metadata
    engine: 'structural',
    usesLegacyAuthority: false,
    primary: thinRoute.primary,
    advisors: thinRoute.advisors,
    // Diagnostics from RequestFrame assembly (+ report-attribution downgrade)
    issues: diagnostics,
  };
  // Append-only: attach shadow if computed; existing fields untouched
  if (authorityShadow !== undefined) {
    meta.authorityShadow = authorityShadow;
  }

  return {
    intent: structuralIntent,
    constraints,
    confidence,
    signals,
    unresolved,
    primary: thinRoute.primary,
    advisors: thinRoute.advisors,
    // Internal routing metadata (spec §8A): authoritative capability for the
    // structural path. Never part of the public Intent contract.
    resolverMeta: {
      routing: {
        primaryCapability,
      },
    },
    meta,
  };
}

/**
 * Sync wrapper.
 */
export function resolveIntentFromPromptSync(prompt, context = {}) {
  return resolveIntentFromPrompt(prompt, context);
}

/**
 * Check if a resolver result uses legacy authority path.
 * @param {object} result - Result from resolveIntentFromPrompt or resolveLegacyIntent
 * @returns {boolean}
 */
export function usesLegacyAuthority(result) {
  return result?.meta?.usesLegacyAuthority === true;
}

/**
 * Public API.
 */
export const resolverApi = {
  resolveIntentFromPrompt,
  resolveIntentFromPromptSync,
  resolveLegacyIntent,
  usesLegacyAuthority,
  INTENT_RESOLVER_VERSION,
};

// ============================================================================
// Legacy resolver internals (copied from 07496ae for diagnostic preservation)
// ============================================================================

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

function sanitizePrompt(text) {
  let result = text.replace(/```[\s\S]*?```/g, '');
  result = result.replace(/`[^`]+`/g, '');
  return result;
}

// Import shared utilities from signals.js
import {
  extractKeywords,
  lower,
  PHASE_KEYWORDS,
  ACTION_KEYWORDS,
  OBJECT_KEYWORDS,
  RISK_KEYWORDS,
  MUTATION_KEYWORDS,
  EVIDENCE_KEYWORDS,
  NEGATION_PATTERNS,
  MULTI_INTENT_SEPARATORS,
  findBestMatch,
  isNegated,
  isActionNegated,
  EVIDENCE_KEYS,
  hasKnownCausePattern,
  hasFindRootCausePattern,
  hasReadinessPattern,
  isStagingDeploy,
} from './signals.js';

import { extractConstraints } from './constraints.js';
import { resolveObject } from './object.js';
import { resolveRisks } from './risks.js';
import { resolveMutation } from './mutation.js';
import { resolveEvidence } from './evidence.js';
import { resolveSecondaryActions, filterSecondaryActions } from './secondary.js';
import { computeConfidence } from './confidence.js';

function resolvePhase(text) {
  const lowerText = lower(text);
  const found = extractKeywords(text, PHASE_KEYWORDS);

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

  if (/\b(threat model|threat-model|security audit|security review|audit security)\b/i.test(lowerText)) {
    return 'discovery';
  }

  if (/\b(what does|explain|how does|how do|describe|walk me through)\b/i.test(lowerText)) {
    return 'discovery';
  }

  const hasNonNegatedImpl = /\b(implement|build|create|add|develop|write|fix|modify|update|refactor|patch)\b/i.test(lowerText) ||
    (/\bchange\b/i.test(lowerText) && !isNegated(lowerText, 'change'));

  if (/\b(review|audit|code review|pr review)\b/i.test(lowerText) && !hasNonNegatedImpl) {
    return 'verification';
  }

  if (/\b(prepare|plan|planning)\b/i.test(lowerText) &&
      /\b(only|do not|don't|without)\b/i.test(lowerText) &&
      /\b(deploy|implement|execute|run)\b/i.test(lowerText)) {
    return 'planning';
  }

  if (hasReadinessPattern(lowerText)) {
    return 'delivery';
  }

  if (hasKnownCausePattern(lowerText) && /\b(fix|implement|modify|patch|repair|resolve)\b/i.test(lowerText)) {
    return 'implementation';
  }

  if (hasFindRootCausePattern(lowerText) && !hasKnownCausePattern(lowerText)) {
    return 'diagnosis';
  }

  if (/\bimplement\b/i.test(lowerText) && /\b(approved|acceptance criteria|according to)\b/i.test(lowerText)) {
    return 'implementation';
  }

  if (/\b(write|add|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|regression\s+)?tests?\b/i.test(lowerText) &&
      !/\b(implement|build|upgrade|migrate|fix|modify|change|update|refactor|patch)\b/i.test(lowerText)) {
    return 'verification';
  }

  const hasNonNegatedImplForQA = /\b(implement|build|add|develop|write|fix|modify|change|update|refactor|patch)\b/i.test(lowerText) ||
    (/\bcode\b/i.test(lowerText) && !/\b(test code|no code|code review|code coverage|code quality)\b/i.test(lowerText));

  if (/\b(qa|quality|regression matrix|matrix|scenario|coverage)\b/i.test(lowerText) &&
      !hasNonNegatedImplForQA) {
    return 'verification';
  }

  if (/\b(recover|reconstruct|resume|interrupted|lost|context|state|where was i|replay)\b/i.test(lowerText) &&
      !/\b(commit|push|merge|rebase|branch|stage)\b/i.test(lowerText) &&
      !(/\bgit\b/i.test(lowerText) && !/\breplay\b/i.test(lowerText))) {
    return 'recovery';
  }

  if (/\b(commit|merge|rebase|push|stage|cherry-pick)\b/i.test(lowerText) && !/\b(implement|build|create|add|develop|write|fix|modify|change|update|refactor|patch)\b/i.test(lowerText)) {
    return 'repository';
  }

  if (/\b(penetration test|pentest)\b/i.test(lowerText)) {
    return 'discovery';
  }

  if (/\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  if (/\b(rollback)\b/i.test(lowerText) && /\b(plan|planning|migration)\b/i.test(lowerText)) {
    return 'planning';
  }

  if (/\b(rollback)\b/i.test(lowerText) && /\b(deploy|production|prod|ops|operations|ci|cd|pipeline|monitor|observability)\b/i.test(lowerText)) {
    return 'operations';
  }

  if (/\b(upgrade|migrate)\b/i.test(lowerText) && !/\b(regression test|add test|write test|add tests|write tests)\b/i.test(lowerText)) {
    return 'implementation';
  }

  const isDeployNegated = /\bno\s+deploy\b/i.test(lowerText) || /\bdon['']?t\s+deploy\b/i.test(lowerText) || /\bwithout\s+deploy\b/i.test(lowerText);

  if (/\b(deploy|deployment)\b/i.test(lowerText) && !isDeployNegated && !/\b(plan|planning|prepare|steps)\b/i.test(lowerText)) {
    return 'operations';
  }

  if (/\b(ci|build)\b/i.test(lowerText) && /\b(fail|failure|error|broken)\b/i.test(lowerText) && /\b(investigate|debug|diagnose|why|intermittent|no confirmed cause)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  if (/\b(intermittent|flaky)\b/i.test(lowerText)) {
    if (/\bcheck\b/i.test(lowerText) && /\bflaky\s+test\b/i.test(lowerText)) {
      return 'implementation';
    }
    return 'diagnosis';
  }

  if (/\b(works?|working|functioning)\b/i.test(lowerText) && /\bbut\b/i.test(lowerText) && /\b(fail|fails|failing|broken|error|doesn't work)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  if (/\b(fails|failing|crash|crashes|error|broken|bug|issue|problem|doesn't work|not working)\b/i.test(lowerText) &&
      /\b(investigate|debug|diagnose|find|root cause|why|reproduce|isolate)\b/i.test(lowerText)) {
    return 'diagnosis';
  }

  return findBestMatch(found, 'implementation');
}

function resolveAction(text, phase) {
  const lowerText = lower(text);
  const found = extractKeywords(text, ACTION_KEYWORDS);

  if (phase === 'verification' && /\b(qa|quality|matrix|scenario|coverage)\b/i.test(lowerText)) return 'test';
  if (phase === 'planning' && /\b(rollback|prepare|plan)\b/i.test(lowerText)) return 'plan';
  if (phase === 'operations' && /\b(rollback)\b/i.test(lowerText)) return 'plan';
  if (phase === 'operations' && /\b(verify|confirm)\b/i.test(lowerText)) return 'assess';
  if (phase === 'delivery' && hasReadinessPattern(lowerText)) return 'assess';
  if (phase === 'discovery' && /\b(penetration test|pentest|threat model|threat-model|security audit|security review|audit security)\b/i.test(lowerText)) return 'assess';
  if (phase === 'verification' && /\b(verify|confirm)\b/i.test(lowerText)) return 'assess';

  if (phase === 'verification' && /\b(write|add|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+)?tests?\b/i.test(lowerText)) return 'test';

  if (phase === 'recovery' && /\breplay\b/i.test(lowerText)) return 'recover';

  if (phase === 'implementation' && /\b(upgrade|migrate)\b/i.test(lowerText) && /\b(add|write|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|migration\s+)?tests?\b/i.test(lowerText)) return 'implement';

  if (phase === 'implementation' && /\b(upgrade|migrate)\b/i.test(lowerText) && !/\b(add|write|create)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|migration\s+)?tests?\b/i.test(lowerText)) return 'upgrade';

  if (/\b(find the root cause|find root cause|determine the (root )?cause|what (caused|is causing)|why (did|does|is))\b/i.test(lowerText)) {
    return 'investigate';
  }
  if (/\b(investigate|debug|diagnose|troubleshoot|reproduce|isolate)\b/i.test(lowerText) &&
      !/\b(implement|build|create|add|develop|write|feature|fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'investigate';

  if (/\b(fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'fix';

  if (/\b(commit|push|merge|rebase|branch|stage|cherry-pick|merge locally)\b/i.test(lowerText)) return 'git';

  if (/\b(fix|repair|resolve|patch|correct)\b/i.test(lowerText)) return 'fix';

  if (/\b(implement|build|create|add|develop|write|feature)\b/i.test(lowerText)) return 'implement';

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

// ============================================================================
// Structural confidence & signals (simplified, conservative)
// ============================================================================

function computeStructuralConfidence(requestFrame, structuralIntent) {
  // Conservative: structural authority never claims 'high' unless governing action is clear
  const hasGoverning = requestFrame.actions.some(a => a.role === 'GOVERNING' && a.commitment === 'AUTHORIZED_NOW');
  if (!hasGoverning) return 'low';
  if (structuralIntent.mutation !== 'read-only') return 'medium';
  return 'medium';
}

function extractStructuralSignals(intent, text) {
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