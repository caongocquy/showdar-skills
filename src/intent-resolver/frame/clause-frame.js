// Clause frame parser
// Parses segments from src/intent-resolver/segments.js into ClauseFrames
// ClauseFrame: { id, text, provenance, connector, polarity, parentClauseId }

/**
 * Simple polarity detection for a clause.
 * Returns 'negative' if clause contains common negation words, else 'positive'.
 */
function clausePolarity(text) {
  const lower = text.toLowerCase();
  if (/\b(do not|don't|not|never|without|avoid|skip|prevent|prohibit)\b/.test(lower)) {
    return "negative";
  }
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
function splitIntoClauses(raw, initialConnector = "ROOT") {
  const connectorPattern = /\b(and|then|if|unless|to|because|after|before|while|but)\b/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = connectorPattern.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({ text: before, connector: initialConnector });
    }
    const word = match[0].toLowerCase();
    initialConnector = word === "but" ? "AND" : match[0].toUpperCase();
    lastIndex = match.index + match[0].length;
  }
  const tail = raw.slice(lastIndex).trim();
  if (tail) {
    parts.push({ text: tail, connector: initialConnector });
  }
  return parts;
}

/**
 * Build a single string from segments and record each segment's start/end offsets.
 * Returns { fullText, segmentOffsets[] } where segmentOffsets maps segment index -> {start, end, kind }.
 */
function buildFullTextAndOffsets(segments) {
  const parts = [];
  const maskedParts = [];
  const offsets = [];
  let pos = 0;
  const nonSplitKinds = ['QUOTED_CONTENT', 'CODE_BLOCK', 'INLINE_CODE', 'EXAMPLE'];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const txt = seg.text;
    if (!txt) continue;
    const start = pos;
    if (pos > 0) {
      parts.push(' ');
      maskedParts.push(' ');
      pos++;
    }
    parts.push(txt);
    if (nonSplitKinds.includes(seg.kind)) {
      // mask content with spaces so connectors inside are ignored
      maskedParts.push(' '.repeat(txt.length));
    } else {
      maskedParts.push(txt);
    }
    pos += txt.length;
    offsets.push({ index: i, start, end: pos, kind: seg.kind });
  }
  return { fullText: parts.join(''), maskedText: maskedParts.join(''), offsets };
}

function splitIntoClausesWithMask(fullText, maskedText, initialConnector = "ROOT") {
  const connectorPattern = /\b(and|then|if|unless|to|because|after|before|while|but)\b/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = connectorPattern.exec(maskedText)) !== null) {
    const before = fullText.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({ text: before, connector: initialConnector });
    }
    const word = match[0].toLowerCase();
    initialConnector = word === "but" ? "AND" : match[0].toUpperCase();
    lastIndex = match.index + match[0].length;
  }
  const tail = fullText.slice(lastIndex).trim();
  if (tail) {
    parts.push({ text: tail, connector: initialConnector });
  }
  return parts;
}

/**
 * Given a clause start position in fullText, find the segment kind that covers it.
 */
function provenanceForPosition(pos, offsets) {
  for (const o of offsets) {
    if (pos >= o.start && pos <= o.end) return o.kind;
  }
  return 'DIRECT_INSTRUCTION';
}

/**
 * Parse clauses from segment list.
 * Concatenates all segment texts, splits on connectors globally, assigns provenance
 * based on which segment covers the clause start.
 */
export function parseClauses(segments) {
  const { fullText, maskedText, offsets } = buildFullTextAndOffsets(segments);
  const rawClauses = splitIntoClausesWithMask(fullText, maskedText);
  const clauses = [];
  let cursor = 0;
  for (let i = 0; i < rawClauses.length; i++) {
    const rc = rawClauses[i];
    const idx = fullText.indexOf(rc.text, cursor);
    if (idx === -1) throw new Error('Clause text not found in fullText');
    const prov = provenanceForPosition(idx, offsets);
    clauses.push({
      id: `c${i}`,
      text: rc.text,
      provenance: prov,
      connector: rc.connector,
      polarity: clausePolarity(rc.text),
      parentClauseId: i === 0 ? null : `c${i - 1}`,
    });
    cursor = idx + rc.text.length;
  }
  return clauses;
}