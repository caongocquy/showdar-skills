export function parseCsv(text, { strict = true } = {}) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
  }
  if (quoted && strict) throw new Error('unterminated quoted field');
  if (field.length || row.length) pushRow();
  const clean = rows.filter((r) => r.some((value) => value.trim() !== ''));
  if (!clean.length) return [];
  const headers = clean[0].map((value) => value.trim());
  if (strict && headers.some((header) => !header)) throw new Error('blank CSV header');
  if (strict && new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) throw new Error('duplicate CSV header');
  return clean.slice(1).map((values) => {
    if (strict && values.length !== headers.length) throw new Error(`CSV column count ${values.length} does not match header count ${headers.length}`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function stringifyCsv(rows, headers = rows.length ? Object.keys(rows[0]) : []) {
  const escape = (value) => {
    const raw = String(value ?? '');
    if (!/[",\n\r]/.test(raw)) return raw;
    return `"${raw.replaceAll('"', '""')}"`;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n') + '\n';
}
