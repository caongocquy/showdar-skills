import { lookupSurfaceOperation } from '../surface-map.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'by', 'from',
  'as', 'is', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they',
  'them', 'their', 'we', 'our', 'us', 'you', 'your', 'my', 'me', 'i',
  'he', 'she', 'him', 'her'
]);

const TARGET_PATTERNS = [
  /\b(staging container)\b/i,
  /\b(webhook handler)\b/i,
  /\b(webhook endpoint)\b/i,
  /\b(stripe webhook)\b/i,
  /\b(react native)\b/i,
  /\b(oauth login)\b/i,
  /\b(ci pipeline)\b/i,
  /\b(qa regression matrix)\b/i,
  /\b(interrupted implementation)\b/i,
  /\b(current repo state)\b/i,
  /\b(current changes)\b/i,
  /\b(deployment steps)\b/i,
  /\b(deployment configuration)\b/i,
  /\b(migration plan)\b/i,
  /\b(deployment)\b/i,
  /\b(container)\b/i,
  /\b(health)\b/i,
  /\b(rollback)\b/i,
  /\b(security issues)\b/i,
  /\b(test suite)\b/i,
  /\b(auth code)\b/i,
  /\b(login crash)\b/i,
  /\b(completed task files)\b/i,
  /\b(infrastructure)\b/i,
  /\b(duplicate payment)\b/i,
  /\b(branch)\b/i,
  /\b(feature branch)\b/i,
  /\b(develop)\b/i,
  /\b(commit)\b/i,
  /\b(config changes)\b/i,
  /\b(repository|codebase|code base|code)\b/i,
  /\b(api|service|database|schema|migration|config|configuration)\b/i,
  /\b(ui|frontend|interface|component|screen|page|checkout)\b/i,
  /\b(runtime|application|app|process|memory|performance|crash|leak|hang|worker|gateway)\b/i,
  /\b(compile|bundle|pipeline|artifact|dependency)\b/i,
  /\b(network|http|request|response|connection|timeout)\b/i,
  /\b(auth|authentication|authorization|login|token|oauth|jwt|session|permission)\b/i,
  /\b(docker|kubernetes|environment|staging|canary)\b/i,
  /\b(architecture|system design|approved feature)\b/i,
  /\b(backend|server)\b/i,
  /\b(main|master)\b/i,
  /\b(file)\b/i,
  /\b(data|business rule|business rules|business logic|schema|model|entity)\b/i,
  /\b(implementation|feature|code|changes|work|task)\b/i,
  /\b(package|library|framework|version|release|artifact|changelog|publish)\b/i,
  /\b(regression matrix|qa matrix|quality matrix|risk matrix|scenario|coverage matrix)\b/i,
  /\b(test|automated test|unit test|integration test|e2e|regression test)\b/i,
  /\b(security|vulnerability|threat|exploit|encryption|oauth callback|penetration)\b/i,
];

function extractEnvironment(text) {
  const lower = text.toLowerCase();
  if (/\bproduction\b/.test(lower)) return 'production';
  if (/\blocal\b|\blocally\b/.test(lower)) return 'local';
  if (/\bstaging\b|\btest\s+environment\b|\bcanary\b/.test(lower)) return 'staging';
  if (/\b(remote|deploy|push)\b/.test(lower)) return 'remote';
  return 'unspecified';
}

function extractTarget(text) {
  for (const pattern of TARGET_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractSurfaceOperation(clauseText) {
  const text = clauseText.trim().toLowerCase();
  const normalized = text.replace(/[^a-zA-Z\s-]/g, ' ').replace(/\s+/g, ' ');
  const allWords = normalized.split(/\s+/).filter(w => w.length > 0);

  const contentWords = [];
  for (let i = 0; i < allWords.length; i++) {
    if (!STOP_WORDS.has(allWords[i])) {
      contentWords.push({ word: allWords[i], origPos: i });
    }
  }

  const matches = [];

  for (let n = Math.min(4, contentWords.length); n >= 1; n--) {
    for (let i = 0; i <= contentWords.length - n; i++) {
      const phrase = contentWords.slice(i, i + n).map(c => c.word).join('-');
      const result = lookupSurfaceOperation(phrase);
      if (result) {
        matches.push({ position: contentWords[i].origPos, length: n, result, source: 'ngram', phrase });
      }
    }
  }

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const cleaned = word.replace(/[^a-zA-Z-]/g, '').toLowerCase();
    if (!cleaned) continue;

    let result = lookupSurfaceOperation(cleaned);
    if (result) {
      matches.push({ position: i, length: 1, result, source: 'word', phrase: cleaned });
    }

    if (cleaned.endsWith('ing') && cleaned.length > 5) {
      const stem = cleaned.slice(0, -3);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-ing', phrase: stem });
      }
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        const stem2 = stem.slice(0, -1);
        result = lookupSurfaceOperation(stem2);
        if (result) {
          matches.push({ position: i, length: 1, result, source: 'stem-ing-doubled', phrase: stem2 });
        }
      }
    }
    if (cleaned.endsWith('ed') && cleaned.length > 4) {
      const stem = cleaned.slice(0, -2);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-ed', phrase: stem });
      }
      if (stem.endsWith('e')) {
        const stem2 = stem.slice(0, -1);
        result = lookupSurfaceOperation(stem2);
        if (result) {
          matches.push({ position: i, length: 1, result, source: 'stem-ed-e', phrase: stem2 });
        }
      }
    }
    if (cleaned.endsWith('s') && cleaned.length > 3) {
      const stem = cleaned.slice(0, -1);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-s', phrase: stem });
      }
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.length !== b.length) return b.length - a.length;
    const sourceOrder = { ngram: 0, word: 1, 'stem-ing': 2, 'stem-ing-doubled': 3, 'stem-ed': 4, 'stem-ed-e': 5, 'stem-s': 6 };
    return (sourceOrder[a.source] ?? 99) - (sourceOrder[b.source] ?? 99);
  });

  return matches[0];
}

function isBareNounClause(clauseText, matchPosition) {
  if (matchPosition <= 0) return false;
  return /^(the|a|an|this|that)\b/i.test(clauseText.trim());
}

export function extractCandidates(clauses) {
  const candidates = [];

  for (const clause of clauses) {
    const surfaceMatch = extractSurfaceOperation(clause.text);

    let capability = 'unknown';
    let canonicalAction = 'unknown';
    let surface = 'unknown';

    if (surfaceMatch && !isBareNounClause(clause.text, surfaceMatch.position)) {
      capability = surfaceMatch.result.semanticCapability;
      canonicalAction = surfaceMatch.result.canonicalAction;
      surface = surfaceMatch.result.surfaceVerb;
    }

    const target = extractTarget(clause.text);
    const environment = extractEnvironment(clause.text);

    const candidate = Object.freeze({
      kind: 'ActionCandidate',
      capability,
      target,
      clauseId: clause.id,
      surface,
      environment,
    });

    candidates.push(candidate);
  }

  return candidates;
}