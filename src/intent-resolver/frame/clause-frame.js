// Clause frame parser
// Parses segments from src/intent-resolver/segments.js into ClauseFrames
// ClauseFrame: { id, text, provenance, connector, polarity, parentClauseId }



/**
 * Simple polarity detection for a clause.
 * Returns 'negative' if clause contains common negation words, else 'positive'.
 */
function clausePolarity(text) {
  const lower = text.toLowerCase();
  // simple detection of negation words
  if (/\b(do not|don't|not|never|without|avoid|skip|prevent|prohibit)\b/.test(lower)) {
    return "negative";
  }
  // also catch "no" followed by a verb
  if (/\bno\s+\w+/.test(lower)) {
    return "negative";
  }
  return "positive";
}

/**
 * Split a raw instruction string into clause fragments based on connectors.
 * Returns array of { text, connector } where connector is the word preceding the clause
 * (upper‑cased) or 'ROOT' for the first clause.
 */
function splitIntoClauses(raw) {
  const connectorPattern = /\b(and|then|because|after|but)\b/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = connectorPattern.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({ text: before, connector: "ROOT" });
    }
    // start new clause after connector
    lastIndex = match.index + match[0].length;
    // store connector for next clause via a placeholder
    parts.push({ connector: match[0].toUpperCase() });
  }
  const tail = raw.slice(lastIndex).trim();
  if (tail) {
    parts.push({ text: tail, connector: "ROOT" });
  }
  // Merge connector placeholders with following text
  const clauses = [];
  let pendingConnector = "ROOT";
  for (const p of parts) {
    if (p.text !== undefined) {
      clauses.push({ text: p.text, connector: pendingConnector });
      pendingConnector = "ROOT";
    } else if (p.connector) {
      pendingConnector = p.connector;
    }
  }
  return clauses;
}

/**
 * Parse clauses from segment list.
 * Only DIRECT_INSTRUCTION and SECONDARY_INSTRUCTION segments are considered for clause text.
 * Other segment kinds are ignored for clause boundaries (they are still part of the instruction text).
 */
export function parseClauses(segments) {
  // concatenate relevant segment texts preserving spaces
  const instructionText = segments
    .filter(s => s.kind === "DIRECT_INSTRUCTION" || s.kind === "SECONDARY_INSTRUCTION" || s.kind === "CONSTRAINT")
    .map(s => s.text)
    .join(" ");

  const rawClauses = splitIntoClauses(instructionText);
  const result = [];
  for (let i = 0; i < rawClauses.length; i++) {
    const raw = rawClauses[i];
    const id = `c${i}`;
    const parentClauseId = i === 0 ? null : `c${i - 1}`;
    result.push({
      id,
      text: raw.text,
      provenance: "DIRECT_INSTRUCTION", // simplified – provenance derives from segment kind
      connector: raw.connector,
      polarity: clausePolarity(raw.text),
      parentClauseId,
    });
  }
  return result;
}
