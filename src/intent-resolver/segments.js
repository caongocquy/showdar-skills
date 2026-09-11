/**
 * Prompt Segmentation — source-authority tagging
 * 
 * Segments are tagged with authority levels:
 * DIRECT_INSTRUCTION — highest authority for action/mutation
 * QUOTED_TEXT — quoted user speech
 * FENCED_CODE — fenced code blocks (```)
 * INLINE_CODE — backtick inline code
 * LOG_OUTPUT — pasted logs, error traces
 * EXAMPLE_TEXT — example/illustrative content
 */

export const SEGMENT_KINDS = Object.freeze([
  'DIRECT_INSTRUCTION',
  'QUOTED_TEXT',
  'FENCED_CODE',
  'INLINE_CODE',
  'LOG_OUTPUT',
  'EXAMPLE_TEXT',
]);

export const SEGMENT_AUTHORITY = Object.freeze({
  DIRECT_INSTRUCTION: 6,
  QUOTED_TEXT: 4,
  FENCED_CODE: 2,
  INLINE_CODE: 3,
  LOG_OUTPUT: 2,
  EXAMPLE_TEXT: 1,
});

/**
 * Segment a prompt into tagged parts with source authority.
 * 
 * @param {string} text — original prompt text
 * @returns {Array<{kind: string, text: string, authority: number}>}
 */
export function segmentPrompt(text) {
  const segments = [];
  let remaining = text;
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

  // Extract log-like patterns (error:, Error:, stack trace, timestamps)
  const logRegex = /(?:Error:|error:|Exception:|exception:|at\s+\w+.*\n|^\s*\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|^\s*\[\w+\].*\n)/gm;
  const logBlocks = [];
  while ((match = logRegex.exec(text)) !== null) {
    logBlocks.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // Combine all special blocks and sort by position
  const specialBlocks = [
    ...fencedBlocks.map(b => ({ ...b, kind: 'FENCED_CODE' })),
    ...inlineBlocks.map(b => ({ ...b, kind: 'INLINE_CODE' })),
    ...quotedBlocks.map(b => ({ ...b, kind: 'QUOTED_TEXT' })),
    ...logBlocks.map(b => ({ ...b, kind: 'LOG_OUTPUT' })),
  ].sort((a, b) => a.start - b.start);

  // Merge overlapping blocks (prefer higher authority)
  const mergedBlocks = [];
  for (const block of specialBlocks) {
    if (mergedBlocks.length === 0 || block.start >= mergedBlocks[mergedBlocks.length - 1].end) {
      mergedBlocks.push(block);
    } else {
      // Overlapping - keep the one with higher authority
      const last = mergedBlocks[mergedBlocks.length - 1];
      const lastAuth = SEGMENT_AUTHORITY[last.kind] || 0;
      const currAuth = SEGMENT_AUTHORITY[block.kind] || 0;
      if (currAuth > lastAuth) {
        mergedBlocks[mergedBlocks.length - 1] = block;
      }
    }
  }

  // Build segments
  let lastEnd = 0;
  for (const block of mergedBlocks) {
    if (block.start > lastEnd) {
      // Direct instruction segment before this block
      const directText = text.substring(lastEnd, block.start).trim();
      if (directText.length > 0) {
        segments.push({
          kind: 'DIRECT_INSTRUCTION',
          text: directText,
          authority: SEGMENT_AUTHORITY.DIRECT_INSTRUCTION,
        });
      }
    }
    // The special block
    segments.push({
      kind: block.kind,
      text: block.text,
      authority: SEGMENT_AUTHORITY[block.kind] || 1,
    });
    lastEnd = block.end;
  }

  // Remaining text after last special block
  if (lastEnd < text.length) {
    const directText = text.substring(lastEnd).trim();
    if (directText.length > 0) {
      segments.push({
        kind: 'DIRECT_INSTRUCTION',
        text: directText,
        authority: SEGMENT_AUTHORITY.DIRECT_INSTRUCTION,
      });
    }
  }

  // If no segments found, entire text is direct instruction
  if (segments.length === 0) {
    segments.push({
      kind: 'DIRECT_INSTRUCTION',
      text: text.trim(),
      authority: SEGMENT_AUTHORITY.DIRECT_INSTRUCTION,
    });
  }

  // Detect example text patterns in direct instruction segments
  const examplePatterns = [
    /\b(example|for example|e\.g\.|such as|like)\b/i,
    /^\s*(here is|here's|sample|illustration):/i,
  ];

  for (const segment of segments) {
    if (segment.kind === 'DIRECT_INSTRUCTION') {
      for (const pattern of examplePatterns) {
        if (pattern.test(segment.text)) {
          segment.kind = 'EXAMPLE_TEXT';
          segment.authority = SEGMENT_AUTHORITY.EXAMPLE_TEXT;
          break;
        }
      }
    }
  }

  return segments;
}

/**
 * Get the highest-authority DIRECT_INSTRUCTION text for action/mutation resolution.
 * 
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
 * 
 * @param {Array} segments
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
 * 
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