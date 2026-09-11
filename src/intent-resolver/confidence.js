/**
 * Confidence Resolution — signal clarity based
 * 
 * HIGH: clear action + target + mutation/ownership signals
 * MEDIUM: reasonable primary but some ambiguity
 * LOW: generic/underspecified request
 */

import { lower, EVIDENCE_KEYS } from './signals.js';

export const CONFIDENCE_HIGH_PHRASES = Object.freeze([
  'only', 'exactly', 'specifically', 'precisely', 'definitely', 'certainly', 'clearly', 'explicitly',
  'do not', 'don\'t', 'never', 'must not', 'should not', 'requirement', 'accepted', 'approved',
  'known cause', 'confirmed', 'diagnosed',
]);

export const CONFIDENCE_LOW_PHRASES = Object.freeze([
  'can you', 'could you', 'maybe', 'perhaps', 'might', 'possibly', 'look at', 'check out',
  'unsure', 'unclear', 'vague', 'ambiguous', 'not sure', 'don\'t know', 'unknown',
  'what do you think', 'how about', 'any idea', 'any thoughts',
  'take a look', 'have a look',
]);

/**
 * Compute confidence based on signal clarity.
 * 
 * @param {string} text — full prompt text
 * @param {Object} intent — resolved intent
 * @returns {'high'|'medium'|'low'}
 */
export function computeConfidence(text, intent) {
  const lowerText = lower(text);
  let score = 0;

  // High-confidence phrases boost
  for (const phrase of CONFIDENCE_HIGH_PHRASES) {
    if (lowerText.includes(phrase)) score += 2;
  }

  // Low-confidence phrases reduce
  for (const phrase of CONFIDENCE_LOW_PHRASES) {
    if (lowerText.includes(phrase)) score -= 2;
  }

  // Evidence clarity boost
  let evidenceClarity = 0;
  for (const key of EVIDENCE_KEYS) {
    if (intent.evidence[key] !== null) evidenceClarity += 1;
  }
  score += evidenceClarity;

  // Non-generic intent boost
  if (intent.phase !== 'implementation' || intent.action !== 'implement') score += 1;

  // Mutation specificity boost
  if (intent.mutation !== 'read-only') score += 1;

  // Risk specificity boost
  if (intent.risks.length > 0) score += 1;

  // Object specificity boost
  if (intent.object && intent.object !== 'repository') score += 1;

  // Phase/action alignment boost
  if (intent.phase && intent.action) score += 1;

  // Thresholds
  if (score >= 6) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}