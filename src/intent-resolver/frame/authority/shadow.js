import { extractCandidates } from './candidate.js';
import { gatherEvidence } from './evidence.js';
import { adjudicate } from './adjudicator.js';
import { traceCandidate } from './diagnostics.js';
import { assembleRequestFrame } from '../request-frame.js';

/**
 * Authority shadow harness — diagnostic-only read-only evaluation of the
 * authority pipeline. Never alters production behavior; all errors swallowed.
 *
 * @param {string} prompt - Raw user prompt
 * @returns {object} Shadow evaluation result
 */
export function runAuthorityShadow(prompt) {
  let authoritySummary = { candidates: 0, authorized: 0, status: 'error', traces: [] };
  const issues = [];

  try {
    const requestFrame = assembleRequestFrame(prompt);
    const clauses = requestFrame.clauses;
    const candidates = extractCandidates(clauses);

    // Per-candidate pipeline: gather evidence → adjudicate → trace (read-only)
    const textByClauseId = new Map(clauses.map((c) => [c.id, c.text]));
    const traces = candidates.map((candidate) => {
      const evidence = gatherEvidence({
        surface: candidate.surface,
        clauseText: textByClauseId.get(candidate.clauseId) ?? '',
      });
      const adjudicated = adjudicate(candidate, evidence);
      return traceCandidate({ candidate, evidence, adjudicated });
    });

    // Authority pipeline summary
    const governingAction = requestFrame.actions.find(a => a.role === 'GOVERNING');
    authoritySummary = {
      candidates: candidates.length,
      authorized: traces.filter((t) => t.verdict === 'AUTHORIZED').length,
      status: 'adjudicated',
      traces,
    };
  } catch (e) {
    // Swallow all errors — shadow must never break production
    issues.push({ code: 'SHADOW_EXTRACTION_FAILED', detail: String(e) });
  }

  return {
    authority: authoritySummary,
    issues,
  };
}
