/**
 * Prompt Segmentation with Provenance
 *
 * Segments a prompt into tagged parts with source authority and semantic provenance.
 * Each segment retains enough information to answer:
 * - where did this signal come from?
 * - is it directly requested?
 * - is it negated?
 * - what target does its verb govern?
 * - should it affect ownership?
 * - should it affect mutation?
 * - should it only affect risk/context?
 */

// Extended segment kinds for provenance tracking
export const SEGMENT_KINDS = Object.freeze([
  'DIRECT_INSTRUCTION',    // Primary request text
  'SECONDARY_INSTRUCTION', // Explicit additional requests (conjunctions with verbs)
  'CONSTRAINT',            // Negated/prohibited operations
  'CONTEXT',               // Background/contextual information
  'QUOTED_CONTENT',        // Quoted strings
  'CODE_BLOCK',            // Fenced code blocks (```)
  'INLINE_CODE',           // Backtick code (`)
  'LOG_OUTPUT',            // Error logs, stack traces, timestamps
  'EXAMPLE',               // Example/illustrative content markers
  'MENTION',               // Referenced commands/tools/names
]);

// Authority hierarchy (higher = more authoritative for action/mutation)
export const SEGMENT_AUTHORITY = Object.freeze({
  DIRECT_INSTRUCTION: 6,
  SECONDARY_INSTRUCTION: 5,
  CONSTRAINT: 4,
  LOG_OUTPUT: 5,        // Higher than QUOTED_CONTENT to capture failure descriptions over quoted content
  QUOTED_CONTENT: 4,
  CODE_BLOCK: 6,        // Fences are unambiguous delimiters: code wins over quotes/logs/constraints whose patterns match inside code spans
  INLINE_CODE: 3,
  EXAMPLE: 1,
  MENTION: 1,
  CONTEXT: 0,
});

/**
 * Detect negation in a text span around a keyword.
 * @param {string} text - Text to check
 * @param {string} keyword - Keyword to check negation for
 * @param {number} window - Characters before keyword to check (default 50)
 * @returns {boolean}
 */
function detectNegation(text, keyword, window = 50) {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const idx = lowerText.indexOf(lowerKeyword);
  if (idx === -1) return false;
  const start = Math.max(0, idx - window);
  const context = lowerText.slice(start, idx);
  // Common negation patterns
  return /\b(not|don't|do not|never|without|no\s|avoid|skip|exclude|prevent|prohibit)\b/.test(context);
}

/**
 * Detect polarity of a segment.
 * @param {string} text - Segment text
 * @param {string} kind - Segment kind
 * @returns {'positive' | 'negative' | 'neutral'}
 */
function detectPolarity(text, kind) {
  if (kind === 'CONSTRAINT') return 'negative';
  if (kind === 'DIRECT_INSTRUCTION' || kind === 'SECONDARY_INSTRUCTION') {
    const lower = text.toLowerCase();
    // Negative IMPERATIVE: don't X, do not X, avoid X, skip X, never X, without X
    // These are actual constraints/negative instructions
    // But NOT when "without" is part of a symptom description (e.g., "grow without bound")
    if (/\b(don't|do not|never|avoid|skip)\b/.test(lower)) return 'negative';
    // "without" as negation only when followed by action verb (without X-ing, without doing X)
    if (/\bwithout\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add|fix|upgrade|migrate|doing|running|executing)\b/.test(lower)) return 'negative';
    // "not" alone with imperative verbs (but not copular "is not/are not/was not/were not")
    if (/\bnot\b/.test(lower)) {
      // Check if it's a copular negation (statement of fact, not instruction)
      // Copular pattern: is/are/was/were not + adjective/past participle
      if (/\b(is|are|was|were)\s+not\s+(?:known|defined|ready|available|fixed|resolved|confirmed|determined|identified|clear|certain)\b/.test(lower)) {
        return 'positive'; // factual statement, not negative instruction
      }
      // "not" before an imperative verb = negative instruction
      if (/\bnot\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add|fix|upgrade|migrate)\b/.test(lower)) {
        return 'negative';
      }
      // Default: treat as positive (covers "can you not" type requests which are positive intent)
      return 'positive';
    }
    return 'positive';
  }
  return 'neutral';
}

/**
 * Extract primary verb from a text span (simple heuristic).
 * @param {string} text - Text to extract verb from
 * @returns {string | null}
 */
function extractVerb(text) {
  const lower = text.toLowerCase();
  // Multi-word verbs first (earliest match wins)
  const multiVerbs = [
    'threat model', 'threat-model', 'security audit',
    'penetration test', 'pentest', 'code review', 'pr review',
    'write test', 'add test', 'create test',
    'write unit test', 'add unit test', 'create unit test',
    'write integration test', 'add integration test', 'create integration test',
    'write automated test', 'add automated test', 'create automated test',
    'regression test', 'e2e test',
    'migration plan', 'rollout plan', 'push to', 'roll out', 'rollout',
    'merge locally', 'merge feature branch',
    'upgrade dependency', 'framework upgrade', 'update dependency',
    'security assessment', 'threat modeling',
    'check whether', 'assess whether', 'ready to', 'confirm release',
    'push to production', 'deploy to prod', 'deploy production',
    'fix bug', 'fix issue', 'fix error', 'fix crash', 'fix leak',
    'fix null', 'fix token', 'fix login', 'fix auth', 'fix mapper',
    'implement feature', 'implement api', 'implement endpoint',
    'build feature', 'build api', 'build endpoint',
    'find root cause', 'find cause', 'determine cause',
    'figure out', 'work out', 'workout',
    'determine why', 'work out what',
    'trace what is causing',
  ];
  let bestMulti = null;
  let bestMultiPos = Infinity;
  for (const mv of multiVerbs) {
    const idx = lower.indexOf(mv);
    if (idx !== -1 && idx < bestMultiPos) {
      bestMultiPos = idx;
      bestMulti = mv;
    }
  }
  if (bestMulti) return bestMulti;

  // Single-word verbs: match ALL and pick earliest in text
  const singleVerbs = [
    'upgrade', 'migrate', 'implement', 'build', 'create', 'add', 'develop', 'write',
    'modify', 'change', 'update', 'refactor', 'fix', 'repair', 'resolve', 'patch', 'correct',
    'investigate', 'debug', 'diagnose', 'troubleshoot', 'reproduce', 'isolate',
    'review', 'audit', 'inspect', 'evaluate', 'check',
    'test', 'verify', 'validate',
    'deploy', 'rollback',
    'recover', 'reconstruct', 'resume', 'replay',
    'commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'cherry-pick',
    'plan', 'planning', 'strategy', 'approach', 'roadmap', 'scope', 'breakdown', 'estimate', 'prepare',
    'design', 'redesign', 'layout', 'visual', 'responsive', 'accessibility', 'mockup', 'wireframe', 'prototype',
    'define', 'specify', 'clarify', 'gather', 'capture', 'document', 'identify',
    'explain', 'understand', 'explore', 'map', 'trace', 'analyze', 'inspect', 'examine', 'survey', 'discover', 'learn',
    'release', 'ship', 'publish', 'deliver', 'handoff',
    'monitor', 'operate', 'run',
    'determine', 'find', 'locate', 'trace',
    'known',
  ];
  let bestSingle = null;
  let bestSinglePos = Infinity;
  for (const sv of singleVerbs) {
    const regex = new RegExp(`\\b${sv}\\b`);
    const match = lower.match(regex);
    if (match && match.index < bestSinglePos) {
      bestSinglePos = match.index;
      bestSingle = sv;
    }
  }
  if (bestSingle) return bestSingle;

  // Check for "confirm" separately (not in singleVerbs to avoid matching "confirmed" etc)
  const confirmMatch = lower.match(/\bconfirm\b/);
  if (confirmMatch) return 'confirm';
  // Check for "rerun" separately
  const rerunMatch = lower.match(/\brerun\b/);
  if (rerunMatch) return 'rerun';

  // Then try suffix stripping for gerunds (ing) and past tense (ed)
  // This matches extractSurfaceOperation behavior to keep segment verbs consistent with action frames
  const words = lower.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-zA-Z-]/g, '');
    if (!cleaned) continue;
    // Try gerund stripping: fixing -> fix, deploying -> deploy
    if (cleaned.endsWith('ing') && cleaned.length > 5) {
      const stem = cleaned.slice(0, -3);
      if (singleVerbs.includes(stem)) return stem;
      // Handle doubled consonant: running -> run
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        const stem2 = stem.slice(0, -1);
        if (singleVerbs.includes(stem2)) return stem2;
      }
    }
    // Try past tense stripping: fixed -> fix, deployed -> deploy
    if (cleaned.endsWith('ed') && cleaned.length > 4) {
      const stem = cleaned.slice(0, -2);
      if (singleVerbs.includes(stem)) return stem;
      if (stem.endsWith('e')) {
        const stem2 = stem.slice(0, -1);
        if (singleVerbs.includes(stem2)) return stem2;
      }
    }
  }
  return null;
}

/**
 * Extract governed target from a text span (simple heuristic).
 * @param {string} text - Text to extract target from
 * @returns {string | null}
 */
function extractTarget(text) {
  const lower = text.toLowerCase();
  const targetPatterns = [
    // Documentation (before general patterns)
    /\b(developer\s+docs?|dev\s+docs?|api\s+docs?|technical\s+docs?|documentation)\b/i,
    /\b(webhook|api|endpoint|backend|service|database|schema|migration)\b/i,
    /\b(ui|frontend|interface|component|screen|page|checkout)\b/i,
    /\b(runtime|application|app|process|memory|performance|crash|leak|hang|worker|gateway)\b/i,
    /\b(build|compile|bundle|ci|pipeline|artifact|dependency)\b/i,
    /\b(network|http|request|response|connection|timeout)\b/i,
    /\b(auth|authentication|authorization|login|token|oauth|jwt|session|permission)\b/i,
    /\b(dependency|package|library|framework|version|react native|database driver)\b/i,
    /\b(release|package|artifact|version|changelog|publish)\b/i,
    /\b(deployment|container|docker|kubernetes|environment|infrastructure|staging|canary)\b/i,
    /\b(data|business rule|business rules|business logic|schema|model|entity)\b/i,
    /\b(implementation|feature|code|changes|work|task)\b/i,
    /\b(commit|file|staging|config changes)\b/i,
    /\b(branch|feature branch|develop|main|master)\b/i,
    /\b(architecture|system design|approved feature)\b/i,
    /\b(regression matrix|qa matrix|quality matrix|risk matrix|scenario|coverage matrix)\b/i,
    /\b(test|automated test|unit test|integration test|e2e|regression test)\b/i,
    /\b(security|vulnerability|threat|exploit|encryption|oauth callback|penetration)\b/i,
  ];
  for (const pattern of targetPatterns) {
    const match = lower.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Segment a prompt into tagged parts with source authority and provenance.
 *
 * @param {string} text — original prompt text
 * @returns {Array<{index: number, kind: string, text: string, authority: number, polarity: string, negated: boolean, verb: string|null, target: string|null}>}
 */
export function segmentPrompt(text) {
  const segments = [];
  const originalText = text;
  let pos = 0;

  // First, extract fenced code blocks
  const fencedRegex = /```[\s\S]*?```/g;
  let match;
  const fencedBlocks = [];
  while ((match = fencedRegex.exec(text)) !== null) {
    fencedBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // Extract inline code (backticks)
  const inlineRegex = /`[^`]+`/g;
  const inlineBlocks = [];
  while ((match = inlineRegex.exec(text)) !== null) {
    inlineBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // Extract quoted text (double quotes, single quotes, smart quotes)
  const quotedRegex = /(?:"[^"]*"|'[^']*'|"[^"]*"|'[^']*')/g;
  const quotedBlocks = [];
  while ((match = quotedRegex.exec(text)) !== null) {
    quotedBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // Extract log-like patterns (error:, Error:, stack trace, timestamps, "logs:", "log:")
  // Also extract exit codes, worker exits, and failure descriptions
  const logRegex = /(?:Error:|error:|Exception:|exception:|logs?:|Logs?:|at\s+\w+.*\n|^\s*\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|^\s*\[\w+\].*\n|Exit\s+\d+|exited\s+with\s+status\s+\d+|worker\s+exited\s+with\s+status\s+\d+)/gmi;
  const logBlocks = [];
  while ((match = logRegex.exec(text)) !== null) {
    logBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

// Extract failure/error description patterns (LOG_OUTPUT)
  // Matches: "The test suite fails...", "X crashes...", "X errors...", "Connection refused", etc.
  // We match the full sentence including the terminal punctuation to avoid splitting it from the instruction
  const failureDescRegex = /\b(?:the\s+(?:test\s+suite|test|suite|build|ci|pipeline|app|application|server|service)\s+(?:fails?|crashes?|errors?|is\s+failing|is\s+broken|is\s+down)|(?:\w+\s+)?(?:fails?|crashes?|errors?|is\s+failing|is\s+broken|is\s+down)\s+(?:intermittently|occasionally|sometimes|randomly|with)|connection\s+refused|out\s+of\s+memory|segmentation\s+fault|stack\s+overflow|null\s+pointer|the\s+(?:unit\s+suite|test\s+execution|build|deployment)\s+failed\b)/gi;
  const failureDescBlocks = [];
  while ((match = failureDescRegex.exec(text)) !== null) {
    // Extend to capture the full sentence up to terminal punctuation
    const start = match.index;
    const end = Math.min(text.length, start + 200);
    const snippet = text.slice(start, end);
    const sentenceEnd = snippet.search(/[.!?]\s+[A-Z]/);
    const actualEnd = sentenceEnd > 0 ? start + sentenceEnd + 1 : end;
    const fullSentence = text.slice(start, actualEnd);
    // Only add if this is a failure description (not an instruction like "fix it")
    if (!/\b(find|fix|investigate|debug|determine|resolve|repair)\b/i.test(fullSentence)) {
      failureDescBlocks.push({ start, end: actualEnd, text: fullSentence });
    }
  }

  // Extract example markers ("for example", "e.g.", "example:", "for instance")
  const exampleRegex = /\b(?:for example|for instance|e\.g\.|example:)\b/gi;
  const exampleBlocks = [];
  while ((match = exampleRegex.exec(text)) !== null) {
    // Extend to capture the example content (up to next sentence or 200 chars)
    const start = match.index;
    const end = Math.min(text.length, start + 300);
    const snippet = text.slice(start, end);
    // Find sentence boundary
    const sentenceEnd = snippet.search(/[.!?]\s+[A-Z]/);
    const actualEnd = sentenceEnd > 0 ? start + sentenceEnd + 1 : end;
    exampleBlocks.push({ start, end: actualEnd, text: text.slice(start, actualEnd) });
  }

  // Extract mention patterns (command/tool references like `kubectl`, `git`, `terraform`, `docker`)
  const mentionRegex = /\b(kubectl|git|terraform|docker|kubernetes|helm|ansible|aws|gcloud|az|npm|yarn|pnpm|make|cmake|gradle|maven)\b/gi;
  const mentionBlocks = [];
  while ((match = mentionRegex.exec(text)) !== null) {
    mentionBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // Combine all special blocks and sort by position
  const specialBlocks = [
    ...fencedBlocks.map(b => ({ ...b, kind: 'CODE_BLOCK' })),
    ...inlineBlocks.map(b => ({ ...b, kind: 'INLINE_CODE' })),
    ...quotedBlocks.map(b => ({ ...b, kind: 'QUOTED_CONTENT' })),
    ...logBlocks.map(b => ({ ...b, kind: 'LOG_OUTPUT' })),
    ...failureDescBlocks.map(b => ({ ...b, kind: 'LOG_OUTPUT' })),
    ...exampleBlocks.map(b => ({ ...b, kind: 'EXAMPLE' })),
    ...mentionBlocks.map(b => ({ ...b, kind: 'MENTION' })),
  ].sort((a, b) => a.start - b.start);

  // Merge overlapping blocks (prefer higher authority)
  const mergedBlocks = [];
  for (const block of specialBlocks) {
    const last = mergedBlocks[mergedBlocks.length - 1];
    if (last && block.start < last.end) {
      // Overlap - keep the one with higher authority
      const lastAuth = SEGMENT_AUTHORITY[last.kind] || 0;
      const thisAuth = SEGMENT_AUTHORITY[block.kind] || 0;
      if (thisAuth > lastAuth) {
        mergedBlocks[mergedBlocks.length - 1] = block;
      }
    } else {
      mergedBlocks.push(block);
    }
  }

  // Now extract constraint patterns (negated operations) from the remaining text
  // These are explicit "don't X", "do not X", "without X" patterns
  const constraintRegex = /\b(?:don't|do not|never|without|avoid|skip|no\s+)\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|patch|fix|repair|resolve)\b/gi;
  // Also match "before we X" as constraint (negated future action)
  const beforeConstraintRegex = /\bbefore\s+we\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add|patch|fix|repair)\b/gi;
  const constraintBlocks = [];
  while ((match = constraintRegex.exec(text)) !== null) {
    constraintBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0], kind: 'CONSTRAINT' });
  }
  while ((match = beforeConstraintRegex.exec(text)) !== null) {
    constraintBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0], kind: 'CONSTRAINT' });
  }

  // Extract secondary instruction patterns (explicit additional verbs after conjunctions)
  // "and X", "and also X", "and then X", "plus X", "also X", "additionally X"
  // Covers: update, add, write, create, implement, test, review, deploy, fix, upgrade, migrate, check, verify, validate, security review, security audit
  // Also covers compound patterns: add tests, write tests, create tests, add regression tests
  // NOTE: Longer patterns MUST come before shorter ones in alternation (regex tries left-to-right)
  // Extended to capture full compound verbs like "security audit logging", "security review", "add tests"
  // Also captures bare "and regression tests", "and tests", "and test" as explicit requests
  // Weak execution verbs (perform/conduct/carry out) split only with a governed
  // capability target; bare weak verbs never split.
  // IMPORTANT: Only split on "and" when followed by a verb at START of a clause (not mid-sentence like "find and fix")
  const secondaryRegex = /\b(?:and\s+(?:also|then)?\s+|and\s+|plus\s+|also\s+|additionally\s+)(?:(?:perform|conduct|carry\s+out)\s+(?:a\s+|an\s+|the\s+)?(?:security|compatibility|regression)\s+(?:assessment|review|audit|testing|tests?)|add\s+regression\s+tests?|write\s+regression\s+tests?|add\s+tests?|write\s+tests?|create\s+tests?|add\s+security\s+audit\s+logging|security\s+audit\s+logging|security\s+audit|security\s+review|regression\s+tests?|tests?|write|add|create|implement|test|review|deploy|fix|upgrade|migrate|check|verify|validate|update)\b/gi;
  const secondaryBlocks = [];
  while ((match = secondaryRegex.exec(text)) !== null) {
    secondaryBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0], kind: 'SECONDARY_INSTRUCTION' });
  }

  // Combine all blocks including constraints and secondary instructions
  const allBlocks = [
    ...mergedBlocks,
    ...constraintBlocks,
    ...secondaryBlocks,
  ].sort((a, b) => a.start - b.start);

  // Build segments by walking through text
  let lastEnd = 0;
  let segmentIndex = 0;

  function isFactualStatement(text) {
    // Detect copular statements (statements of fact, not instructions)
    // "The X is/are/was/were ..." patterns
    const lower = text.toLowerCase();
    // If text contains semicolon followed by imperative, it's mixed - not purely factual
    if (/;\s*(?:fix|patch|implement|add|create|write|modify|update|refactor|deploy|upgrade|migrate|investigate|debug|determine|find|trace|check|verify|review|audit|analyze|examine)\b/i.test(text)) {
      return false;
    }
    // Exclude sentences that start with imperative verbs (check, verify, determine, etc.)
    const imperativeVerbs = /^(check|verify|determine|confirm|validate|assess|inspect|evaluate|review|audit|analyze|examine|test|debug|investigate|find|locate|trace|understand|explain|map|survey|discover|learn)\b/;
    if (imperativeVerbs.test(lower)) return false;
    // Copular patterns: "the X is/are/was/were [adjective/noun]"
    // Allow multi-word noun phrases (e.g., "staged build output")
    // Match: "the [noun phrase] is/are/was/were [too/very/not] [adjective]"
    if (/^the\s+.+\s+(?:is|are|was|were)\s+(?:too\s+|very\s+|not\s+)?(?:large|small|ready|available|fixed|resolved|confirmed|determined|clear|certain|complete|finished|done|working|broken|failing|slow|fast)\b/.test(lower)) {
      return true;
    }
    // "X is/are/was/were [adjective/noun]" at start (allow multi-word subject)
    if (/^\w+(?:\s+\w+)*\s+(?:is|are|was|were)\s+(?:too\s+|very\s+|not\s+)?(?:large|small|ready|available|fixed|resolved|confirmed|determined|clear|certain|complete|finished|done|working|broken|failing|slow|fast)\b/.test(lower)) {
      return true;
    }
    // "This/that/it is/are/was/were ..."
    if (/^(?:this|that|it)\s+(?:is|are|was|were)\s+(?:too\s+|very\s+|not\s+)?(?:large|small|ready|available|fixed|resolved|confirmed|determined|clear|certain|complete|finished|done|working|broken|failing|slow|fast)\b/.test(lower)) {
      return true;
    }
    return false;
  }

  for (const block of allBlocks) {
    // Text before this block = DIRECT_INSTRUCTION or CONTEXT
    if (block.start > lastEnd) {
      const beforeText = text.slice(lastEnd, block.start).trim();
      if (beforeText.length > 0) {
        // Heuristic: if it starts with lowercase and follows a period, it's likely CONTEXT
        const isContext = /^[a-z]/.test(beforeText) && lastEnd > 0 && text[lastEnd - 1] === '.';
        // Also treat factual statements (copular) as CONTEXT
        const isFactual = isFactualStatement(beforeText);
        const kind = isContext || isFactual ? 'CONTEXT' : 'DIRECT_INSTRUCTION';
        segments.push({
          index: segmentIndex++,
          kind,
          text: beforeText,
          authority: SEGMENT_AUTHORITY[kind],
          polarity: detectPolarity(beforeText, kind),
          negated: detectNegation(beforeText, ''),
          verb: kind === 'DIRECT_INSTRUCTION' ? extractVerb(beforeText) : null,
          target: kind === 'DIRECT_INSTRUCTION' ? extractTarget(beforeText) : null,
        });
      }
    }

    // The special block itself
    const negated = block.kind === 'CONSTRAINT' || detectNegation(block.text, '');
    segments.push({
      index: segmentIndex++,
      kind: block.kind,
      text: block.text,
      authority: SEGMENT_AUTHORITY[block.kind] || 0,
      polarity: detectPolarity(block.text, block.kind),
      negated,
      verb: block.kind === 'CONSTRAINT' || block.kind === 'SECONDARY_INSTRUCTION' ? extractVerb(block.text) : null,
      target: block.kind === 'CONSTRAINT' || block.kind === 'SECONDARY_INSTRUCTION' ? extractTarget(block.text) : null,
    });

    lastEnd = block.end;
  }

  // Remaining text after last block
  if (lastEnd < text.length) {
    const remainingText = text.slice(lastEnd).trim();
    if (remainingText.length > 0) {
      const isContext = /^[a-z]/.test(remainingText) && lastEnd > 0 && text[lastEnd - 1] === '.';
      // Also treat factual statements (copular) as CONTEXT
      const isFactual = isFactualStatement(remainingText);
      const kind = isContext || isFactual ? 'CONTEXT' : 'DIRECT_INSTRUCTION';
      segments.push({
        index: segmentIndex++,
        kind,
        text: remainingText,
        authority: SEGMENT_AUTHORITY[kind],
        polarity: detectPolarity(remainingText, kind),
        negated: detectNegation(remainingText, ''),
        verb: kind === 'DIRECT_INSTRUCTION' ? extractVerb(remainingText) : null,
        target: kind === 'DIRECT_INSTRUCTION' ? extractTarget(remainingText) : null,
      });
    }
  }

  // If no segments at all, treat entire text as DIRECT_INSTRUCTION
  if (segments.length === 0) {
    segments.push({
      index: 0,
      kind: 'DIRECT_INSTRUCTION',
      text: text,
      authority: SEGMENT_AUTHORITY.DIRECT_INSTRUCTION,
      polarity: 'positive',
      negated: false,
      verb: extractVerb(text),
      target: extractTarget(text),
    });
  }

  return segments;
}

/**
 * Get all text from segments of a specific kind.
 * @param {Array} segments — from segmentPrompt
 * @param {string} kind — segment kind to filter
 * @returns {string}
 */
export function getSegmentsByKind(segments, kind) {
  return segments
    .filter(s => s.kind === kind)
    .map(s => s.text)
    .join(' ');
}

/**
 * Get all text from segments matching any of the given kinds.
 * @param {Array} segments — from segmentPrompt
 * @param {string[]} kinds — segment kinds to include
 * @returns {string}
 */
export function getSegmentsByKinds(segments, kinds) {
  const kindSet = new Set(kinds);
  return segments
    .filter(s => kindSet.has(s.kind))
    .map(s => s.text)
    .join(' ');
}

/**
 * Get signals from specific segment kinds with provenance.
 * @param {Array} segments — from segmentPrompt
 * @param {string[]} kinds — segment kinds to extract from
 * @returns {Array<{text: string, segmentIndex: number, kind: string, authority: number, polarity: string, negated: boolean}>}
 */
export function getSignalsFromSegments(segments, kinds) {
  const kindSet = new Set(kinds);
  return segments
    .filter(s => kindSet.has(s.kind))
    .map(s => ({
      text: s.text,
      segmentIndex: s.index,
      kind: s.kind,
      authority: s.authority,
      polarity: s.polarity,
      negated: s.negated,
    }));
}

/**
 * Get direct instruction text (backward compatibility).
 * @param {Array} segments — from segmentPrompt
 * @returns {string}
 */
export function getDirectInstructionText(segments) {
  return segments
    .filter(s => s.kind === 'DIRECT_INSTRUCTION')
    .map(s => s.text)
    .join(' ');
}

/**
 * Get all text from segments with minimum authority for domain/object extraction.
 * @param {Array} segments — from segmentPrompt
 * @param {number} minAuthority — minimum authority (default 2 for INLINE_CODE)
 * @returns {string}
 */
export function getContextText(segments, minAuthority = 2) {
  return segments
    .filter(s => s.authority >= minAuthority)
    .map(s => s.text)
    .join(' ');
}

/**
 * Sanitize prompt by removing code blocks (for backward compatibility).
 * @param {string} text
 * @returns {string}
 */
export function sanitizePrompt(text) {
  // Remove fenced code blocks
  let result = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code blocks (backticks)
  result = result.replace(/`[^`]+`/g, '');
  return result;
}
