const STOP = new Set(['a','an','and','are','as','at','be','by','for','from','in','is','it','of','on','or','the','to','use','with']);

export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token));
}

export function rankRows(rows, query, fieldsOrOptions = []) {
  const options = Array.isArray(fieldsOrOptions) ? { fields: fieldsOrOptions } : (fieldsOrOptions ?? {});
  const fields = options.fields ?? [];
  const weights = options.weights ?? {};
  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);
  return rows.map((row, index) => {
    const selected = fields.length ? fields : Object.keys(row);
    const fieldTokens = selected.flatMap((field) => tokenize(row[field]));
    const fieldSet = new Set(fieldTokens);
    let score = 0;
    const matchedTokens = [];
    for (const token of querySet) {
      const exactField = selected.find((field) => tokenize(row[field]).includes(token));
      if (exactField) { score += 4 * Number(weights[exactField] ?? 1); matchedTokens.push(token); }
      else if ([...fieldSet].some((candidate) => candidate.includes(token) || token.includes(candidate))) { score += 1; matchedTokens.push(token); }
    }
    const phrase = query.trim().toLowerCase();
    const phraseField = selected.find((field) => String(row[field] ?? '').toLowerCase().includes(phrase));
    if (phrase && phraseField) score += 8 * Number(weights[phraseField] ?? 1);
    return { row, score, index, matchedTokens: [...new Set(matchedTokens)] };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}
