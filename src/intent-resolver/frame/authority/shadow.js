import { extractCandidates } from './candidate.js';
import { gatherEvidence } from './evidence.js';
import { adjudicate } from './adjudicator.js';
import { traceCandidate } from './diagnostics.js';
import { assembleRequestFrame } from '../request-frame.js';

/**
 * Authority shadow harness — diagnostic-only comparison between legacy
 * resolution and authority-path candidate extraction.
 * Never alters production behavior; all errors swallowed.
 *
 * @param {string} prompt - Raw user prompt
 * @param {object} [legacyResult] - Pre-computed legacy result (optional, for isolation)
 * @returns {object} Shadow comparison result
 */
export function runAuthorityShadow(prompt, legacyResult) {
  // Authority path: extract candidates from clauses
  let candidates = [];
  let traces = [];
  let agreement = {};
  const issues = [];

  try {
    const requestFrame = assembleRequestFrame(prompt);
    const clauses = requestFrame.clauses;
    candidates = extractCandidates(clauses);

    // Per-candidate pipeline: gather evidence → adjudicate → trace (read-only)
    const textByClauseId = new Map(clauses.map((c) => [c.id, c.text]));
    traces = candidates.map((candidate) => {
      const evidence = gatherEvidence({
        surface: candidate.surface,
        clauseText: textByClauseId.get(candidate.clauseId) ?? '',
      });
      const adjudicated = adjudicate(candidate, evidence);
      return traceCandidate({ candidate, evidence, adjudicated });
    });

    // Agreement placeholder for future adjudication comparison
    const governingAction = requestFrame.actions.find(a => a.role === 'GOVERNING');
    agreement = {
      legacyPhaseMatches: legacyResult?.intent?.phase === (governingAction?.phase ?? 'unknown'),
      candidateCount: candidates.length,
    };
  } catch (e) {
    // Swallow all errors — shadow must never break production
    issues.push({ code: 'SHADOW_EXTRACTION_FAILED', detail: String(e) });
  }

  return {
    legacy: legacyResult
      ? {
          phase: legacyResult.intent?.phase ?? 'unknown',
          action: legacyResult.intent?.action ?? 'unknown',
          mutation: legacyResult.intent?.mutation ?? 'unknown',
          primary: 'legacy',
        }
      : { status: 'not-provided' },
    authority: {
      candidates: candidates.length,
      authorized: traces.filter((t) => t.verdict === 'AUTHORIZED').length,
      status: 'adjudicated',
      traces,
    },
    agreement,
    issues,
  };
}
