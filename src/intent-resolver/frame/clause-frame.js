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

const AUTHORITATIVE_PROVENANCES = new Set(['DIRECT_INSTRUCTION', 'SECONDARY_INSTRUCTION']);

/**
 * Split a raw instruction string into clause fragments based on connectors.
 * Returns array of { text, connector } where connector is the word preceding the clause
 * (upper-cased) or 'ROOT' for the first clause.
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
 * Build full text with provenance tracking.
 * Returns { runs[] } where each run = { text, provenance, start, end }
 * Runs are contiguous spans of the same provenance.
 */
function buildProvenanceRuns(segments) {
  const parts = [];
  const offsets = [];
  let pos = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const txt = seg.text;
    if (!txt) continue;
    if (pos > 0) {
      parts.push(' ');
      offsets.push({ kind: 'SPACE', start: pos, end: pos + 1 });
      pos++;
    }
    const start = pos;
    parts.push(txt);
    pos += txt.length;
    offsets.push({ index: i, start, end: pos, kind: seg.kind });
  }
  const fullText = parts.join('');

  // Merge contiguous offsets of same provenance into runs
  const runs = [];
  for (const o of offsets) {
    if (o.kind === 'SPACE') continue;
    if (runs.length && runs[runs.length - 1].provenance === o.kind) {
      runs[runs.length - 1].end = o.end;
      runs[runs.length - 1].text = fullText.slice(runs[runs.length - 1].start, o.end);
    } else {
      runs.push({
        text: fullText.slice(o.start, o.end),
        provenance: o.kind,
        start: o.start,
        end: o.end,
      });
    }
  }
  return { fullText, runs };
}

/**
 * Parse clauses from segment list.
 * First splits at provenance boundaries (each contiguous same-provenance run).
 * Then sub-splits ONLY authoritative runs on connectors.
 * Non-authoritative runs become single clauses with their true provenance.
 */
export function parseClauses(segments) {
  const { runs } = buildProvenanceRuns(segments);
  const clauses = [];

  for (const run of runs) {
    if (AUTHORITATIVE_PROVENANCES.has(run.provenance)) {
      // Authoritative run: split on connectors
      const subClauses = splitIntoClauses(run.text, 'ROOT');
      for (const sc of subClauses) {
        if (!sc.text.trim()) continue;
        const id = `c${clauses.length}`;
        clauses.push({
          id,
          text: sc.text.trim(),
          provenance: run.provenance,
          connector: sc.connector,
          polarity: clausePolarity(sc.text),
          parentClauseId: clauses.length === 0 ? null : clauses[clauses.length - 1].id,
        });
      }
    } else {
      // Non-authoritative run: single clause with true provenance
      const id = `c${clauses.length}`;
      clauses.push({
        id,
        text: run.text.trim(),
        provenance: run.provenance,
        connector: 'ROOT',
        polarity: clausePolarity(run.text),
        parentClauseId: clauses.length === 0 ? null : clauses[clauses.length - 1].id,
      });
    }
  }

  return clauses;
}