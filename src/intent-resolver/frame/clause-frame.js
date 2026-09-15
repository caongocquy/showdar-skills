// Clause frame parser
// Parses segments from src/intent-resolver/segments.js into ClauseFrames
// ClauseFrame: { id, text, provenance, connector, polarity, parentClauseId }

/**
 * Polarity is now inherited from the segment's polarity.
 * This function is kept for backward compatibility but should not be used.
 * Clauses get their polarity from the segment they originate from.
 */
function clausePolarity(text) {
  // Defer to segment-level polarity (handled in parseClauses)
  return "positive";
}

const AUTHORITATIVE_PROVENANCES = new Set(['DIRECT_INSTRUCTION', 'SECONDARY_INSTRUCTION']);

/**
 * Split a raw instruction string into clause fragments based on connectors and sentence boundaries.
 * Returns array of { text, connector } where connector is the word preceding the clause
 * (upper-cased) or 'ROOT' for the first clause.
 */
function splitIntoClauses(raw, initialConnector = "ROOT") {
  // Don't split on "to" when it's part of "ready to", "able to", "going to", "need to", "want to"
  // These are infinitive constructions that should stay together
  const connectorPattern = /\b(and|then|if|unless|because|after|before|while|but|(?<!ready\s)(?<!able\s)(?<!going\s)(?<!need\s)(?<!want\s)\bto\b)/gi;
  // Also split on semicolons (strong clause separators)
  const semicolonPattern = /;\s*/g;

  // Combine all patterns: find all split points
  const splits = [];

  // Find connector splits
  let match;
  while ((match = connectorPattern.exec(raw)) !== null) {
    splits.push({ index: match.index, length: match[0].length, connector: match[0].toUpperCase() });
  }

  // Find semicolon splits
  while ((match = semicolonPattern.exec(raw)) !== null) {
    splits.push({ index: match.index, length: match[0].length, connector: 'ROOT' });
  }

  // Sort splits by index
  splits.sort((a, b) => a.index - b.index);

  const parts = [];
  let lastIndex = 0;
  let currentConnector = initialConnector;

  for (const split of splits) {
    const before = raw.slice(lastIndex, split.index).trim();
    if (before) {
      parts.push({ text: before, connector: currentConnector });
    }
    currentConnector = split.connector === 'BUT' ? 'AND' : split.connector;
    lastIndex = split.index + split.length;
  }

  const tail = raw.slice(lastIndex).trim();
  if (tail) {
    parts.push({ text: tail, connector: currentConnector });
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
 * Polarity is inherited from the originating segment.
 */
export function parseClauses(segments) {
  const { runs } = buildProvenanceRuns(segments);
  const clauses = [];

  // Build segment index to polarity map
  const segmentPolarity = new Map();
  for (let i = 0; i < segments.length; i++) {
    segmentPolarity.set(i, segments[i].polarity);
  }

  // Detect polarity for a clause based on its text
function detectClausePolarity(text) {
  const lower = text.toLowerCase();
  // Negative IMPERATIVE: don't X, do not X, avoid X, skip X, never X, without X
  if (/\b(don't|do not|never|avoid|skip)\b/.test(lower)) return 'negative';
  // "without" as negation only when followed by action verb
  if (/\bwithout\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add|fix|upgrade|migrate|doing|running|executing)\b/.test(lower)) return 'negative';
  // "not" alone with imperative verbs (but not copular "is not/are not/was not/were not")
  if (/\bnot\b/.test(lower)) {
    // Check if it's a copular negation (statement of fact, not instruction)
    if (/\b(is|are|was|were)\s+not\s+(?:known|defined|ready|available|fixed|resolved|confirmed|determined|identified|clear|certain)\b/.test(lower)) {
      return 'positive';
    }
    // "not" before an imperative verb = negative instruction
    if (/\bnot\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add|fix|upgrade|migrate)\b/.test(lower)) {
      return 'negative';
    }
    return 'positive';
  }
  return 'positive';
}

  for (const run of runs) {
    if (AUTHORITATIVE_PROVENANCES.has(run.provenance)) {
      // Authoritative run: split on connectors
      const subClauses = splitIntoClauses(run.text, 'ROOT');
      for (const sc of subClauses) {
        if (!sc.text.trim()) continue;
        const id = `c${clauses.length}`;
        const polarity = detectClausePolarity(sc.text);
        clauses.push({
          id,
          text: sc.text.trim(),
          provenance: run.provenance,
          connector: sc.connector,
          polarity,
          parentClauseId: clauses.length === 0 ? null : clauses[clauses.length - 1].id,
        });
      }
    } else {
      // Non-authoritative run: single clause with true provenance
      const id = `c${clauses.length}`;
      const polarity = detectClausePolarity(run.text);
      clauses.push({
        id,
        text: run.text.trim(),
        provenance: run.provenance,
        connector: 'ROOT',
        polarity,
        parentClauseId: clauses.length === 0 ? null : clauses[clauses.length - 1].id,
      });
    }
  }

  return clauses;
}

function findRunPolarity(run, segments) {
  // Find the segment that best matches this run's text
  // Use the segment's polarity directly
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].text && run.text.includes(segments[i].text.trim())) {
      return segments[i].polarity;
    }
    // Also check if segment text is contained in run text
    if (segments[i].text && segments[i].text.trim() && run.text.startsWith(segments[i].text.trim())) {
      return segments[i].polarity;
    }
  }
  // Fallback: if run came from a single segment, use its polarity
  // Check by matching the start of run text
  for (let i = 0; i < segments.length; i++) {
    const segText = segments[i].text?.trim();
    if (segText && (run.text.startsWith(segText) || segText.startsWith(run.text.trim()))) {
      return segments[i].polarity;
    }
  }
  return 'positive';
}
