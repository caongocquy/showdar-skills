// ActionFrame / ContextFrame construction with hard provenance boundary
// L2: only DIRECT_INSTRUCTION and SECONDARY_INSTRUCTION produce ActionFrames

import { lookupSurfaceOperation } from './surface-map.js';

const AUTHORITATIVE_PROVENANCES = Object.freeze(new Set([
  'DIRECT_INSTRUCTION',
  'SECONDARY_INSTRUCTION',
]));

const NON_AUTHORITATIVE_PROVENANCES = Object.freeze(new Set([
  'LOG_OUTPUT',
  'QUOTED_CONTENT',
  'CODE_BLOCK',
  'INLINE_CODE',
  'EXAMPLE',
  'MENTION',
  'CONTEXT',
]));

const COMMITMENT_MARKERS = Object.freeze({
  CONDITIONAL: /\b(if|when|unless|provided|assuming|in case)\b/i,
  HYPOTHETICAL: /\b(would|could|should|might|may|suppose|imagine|hypothetical)\b/i,
});

function detectCommitment(clause) {
  const text = clause.text;
  if (COMMITMENT_MARKERS.CONDITIONAL.test(text)) return 'CONDITIONAL';
  // Check connector for conditional gating
  if (clause.connector === 'IF' || clause.connector === 'UNLESS') return 'CONDITIONAL';
  if (COMMITMENT_MARKERS.HYPOTHETICAL.test(text)) return 'HYPOTHETICAL';
  return 'AUTHORIZED_NOW';
}

function detectEnvironment(clause, clauses = [], index = -1) {
  // Check own text plus adjacent sibling clauses (clause splitting may isolate
  // the target/environments phrase, e.g. "Deploy the api" + "production.")
  let text = clause.text.toLowerCase();
  if (index >= 0 && Array.isArray(clauses)) {
    const neighbors = [];
    if (index + 1 < clauses.length) neighbors.push(clauses[index + 1].text);
    if (index - 1 >= 0) neighbors.push(clauses[index - 1].text);
    text += ' ' + neighbors.join(' ').toLowerCase();
  }
  if (/\bproduction\b/.test(text)) return 'production';
  if (/\b(remote|staging|deploy|push)\b/.test(text) && !/\blocal\b/.test(text)) return 'remote';
  if (/\blocal\b/.test(text)) return 'local';
  return 'unspecified';
}

function extractTargetFromClause(clause) {
  // Use the segment's pre-extracted target if available
  // For now, use a simple heuristic from the clause text
  const text = clause.text;
  // Look for target patterns
  const patterns = [
    /\b(api|service|database|schema|migration|config|configuration)\b/i,
    /\b(ui|frontend|interface|component|screen|page)\b/i,
    /\b(runtime|application|app|process|memory|performance)\b/i,
    /\b(build|compile|bundle|ci|pipeline|artifact|dependency)\b/i,
    /\b(network|http|request|response|connection|timeout)\b/i,
    /\b(auth|authentication|authorization|login|token|oauth|jwt|session)\b/i,
    /\b(deployment|container|docker|kubernetes|environment|infrastructure|staging|canary)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function authorizeSpan(span) {
  const prov = span?.provenance;
  if (!prov || !AUTHORITATIVE_PROVENANCES.has(prov)) {
    throw new Error(`provenance '${prov}' cannot authorize action frame`);
  }
  // Authoritative - no throw
  return true;
}

function extractSurfaceOperation(clause) {
  const words = clause.text.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-zA-Z-]/g, '').toLowerCase();
    // Try exact match first
    let result = lookupSurfaceOperation(cleaned);
    if (result) return result;
    // Try stripping common suffixes (gerund, past tense)
    if (cleaned.endsWith('ing') && cleaned.length > 5) {
      // deploy-ing -> deploy, audit-ing -> audit
      const stem = cleaned.slice(0, -3);
      result = lookupSurfaceOperation(stem);
      if (result) return result;
      // Handle doubled consonant (running -> run)
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        result = lookupSurfaceOperation(stem.slice(0, -1));
        if (result) return result;
      }
    }
    if (cleaned.endsWith('ed') && cleaned.length > 4) {
      const stem = cleaned.slice(0, -2);
      result = lookupSurfaceOperation(stem);
      if (result) return result;
      if (stem.endsWith('e')) {
        result = lookupSurfaceOperation(stem.slice(0, -1));
        if (result) return result;
      }
    }
    if (cleaned.endsWith('s') && cleaned.length > 3) {
      const stem = cleaned.slice(0, -1);
      result = lookupSurfaceOperation(stem);
      if (result) return result;
    }
  }
  return null;
}

export function buildActionFrames(clauses) {
  const frames = [];
  let actionIndex = 0;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    // Hard provenance wall: only authoritative provenances produce ActionFrames
    if (!AUTHORITATIVE_PROVENANCES.has(clause.provenance)) {
      // Non-authoritative provenance: do not create ActionFrame
      // The caller should use buildContextFrames for these
      continue;
    }

    // Find verb in clause text
    const surfaceOp = extractSurfaceOperation(clause);
    if (!surfaceOp) {
      // Unknown surface operation - no action frame
      continue;
    }

    // Determine commitment, considering sibling conditional clauses
    let commitment = detectCommitment(clause);
    if (commitment === 'AUTHORIZED_NOW') {
      // If the next clause has IF/UNLESS connector, this clause is conditionally gated
      const next = clauses[i + 1];
      if (next && (next.connector === 'IF' || next.connector === 'UNLESS')) {
        commitment = 'CONDITIONAL';
      }
    }

    const frame = {
      id: `a${actionIndex++}`,
      surfaceVerb: surfaceOp.surfaceVerb,
      semanticCapability: surfaceOp.semanticCapability,
      canonicalAction: surfaceOp.canonicalAction,
      target: extractTargetFromClause(clause),
      provenance: clause.provenance,
      polarity: clause.polarity,
      role: 'GOVERNING', // default; resolved later by relations.js
      commitment,
      environment: detectEnvironment(clause, clauses, i),
      clauseId: clause.id,
    };

    frames.push(frame);
  }

  return frames;
}

export function buildContextFrames(clauses) {
  const frames = [];

  for (const clause of clauses) {
    // Only non-authoritative provenances produce ContextFrames
    if (AUTHORITATIVE_PROVENANCES.has(clause.provenance)) {
      continue;
    }

    // Determine what this context contributes to
    const contributesTo = [];
    const kind = clause.provenance;

    if (kind === 'LOG_OUTPUT') {
      contributesTo.push('evidence', 'risks');
    } else if (kind === 'QUOTED_CONTENT' || kind === 'CODE_BLOCK' || kind === 'INLINE_CODE') {
      contributesTo.push('evidence', 'object');
    } else if (kind === 'EXAMPLE') {
      contributesTo.push('evidence');
    } else if (kind === 'MENTION') {
      contributesTo.push('object');
    } else if (kind === 'CONTEXT') {
      contributesTo.push('risks', 'object');
    }

    frames.push({
      id: `ctx${frames.length}`,
      kind,
      text: clause.text,
      contributesTo,
    });
  }

  return frames;
}

export { authorizeSpan };