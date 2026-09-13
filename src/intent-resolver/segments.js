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
  QUOTED_CONTENT: 4,
  CODE_BLOCK: 4,        // Higher than INLINE_CODE to prevent inline matches inside fenced blocks
  INLINE_CODE: 3,
  LOG_OUTPUT: 2,
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
    if (/\b(not|don't|do not|never|without|avoid|skip)\b/.test(lower)) return 'negative';
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
  // Multi-word verbs first
  const multiVerbs = [
    'threat model', 'threat-model', 'security audit', 'security review',
    'penetration test', 'pentest', 'code review', 'pr review',
    'root cause', 'find root cause', 'find cause', 'determine cause',
    'migration plan', 'rollout plan', 'push to', 'roll out', 'rollout',
    'write test', 'add test', 'create test', 'automated test', 'unit test', 'integration test',
    'regression test', 'e2e test',
    'merge locally', 'merge feature branch',
    'upgrade dependency', 'framework upgrade', 'update dependency',
    'security assessment', 'threat modeling',
    'check whether', 'assess whether', 'ready to', 'confirm release',
    'push to production', 'deploy to prod', 'deploy production',
  ];
  for (const mv of multiVerbs) {
    if (lower.includes(mv)) return mv;
  }
  // Single-word verbs
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
  for (const sv of singleVerbs) {
    const regex = new RegExp(`\\b${sv}\\b`);
    if (regex.test(lower)) return sv;
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
  const logRegex = /(?:Error:|error:|Exception:|exception:|logs?:|Logs?:|at\s+\w+.*\n|^\s*\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|^\s*\[\w+\].*\n)/gm;
  const logBlocks = [];
  while ((match = logRegex.exec(text)) !== null) {
    logBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
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
  const constraintRegex = /\b(?:don't|do not|never|without|avoid|skip|no\s+)\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase)\b/gi;
  // Also match "before we X" as constraint (negated future action)
  const beforeConstraintRegex = /\bbefore\s+we\s+(?:push|commit|deploy|implement|modify|change|write|edit|publish|test|merge|rebase|build|create|add)\b/gi;
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
  const secondaryRegex = /\b(?:and\s+(?:also|then)?\s*|plus\s+|also\s+|additionally\s+)(?:(?:perform|conduct|carry\s+out)\s+(?:a\s+|an\s+|the\s+)?(?:security|compatibility|regression)\s+(?:assessment|review|audit|testing|tests?)|add\s+regression\s+tests?|write\s+regression\s+tests?|add\s+tests?|write\s+tests?|create\s+tests?|add\s+security\s+audit\s+logging|security\s+audit\s+logging|security\s+audit|security\s+review|regression\s+tests?|tests?|write|add|create|implement|test|review|deploy|fix|upgrade|migrate|check|verify|validate|update)\b/gi;
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

  for (const block of allBlocks) {
    // Text before this block = DIRECT_INSTRUCTION or CONTEXT
    if (block.start > lastEnd) {
      const beforeText = text.slice(lastEnd, block.start).trim();
      if (beforeText.length > 0) {
        // Heuristic: if it starts with lowercase and follows a period, it's likely CONTEXT
        const isContext = /^[a-z]/.test(beforeText) && lastEnd > 0 && text[lastEnd - 1] === '.';
        segments.push({
          index: segmentIndex++,
          kind: isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION',
          text: beforeText,
          authority: SEGMENT_AUTHORITY[isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION'],
          polarity: detectPolarity(beforeText, isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION'),
          negated: detectNegation(beforeText, ''),
          verb: extractVerb(beforeText),
          target: extractTarget(beforeText),
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
      segments.push({
        index: segmentIndex++,
        kind: isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION',
        text: remainingText,
        authority: SEGMENT_AUTHORITY[isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION'],
        polarity: detectPolarity(remainingText, isContext ? 'CONTEXT' : 'DIRECT_INSTRUCTION'),
        negated: detectNegation(remainingText, ''),
        verb: extractVerb(remainingText),
        target: extractTarget(remainingText),
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
