import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { ALL_SKILLS, SKILLS } from './catalog.js';
import { resolveIntentFromPrompt } from './intent-resolver/index.js';
import { assertSafeManagedPath } from './path-safety.js';

async function readJson(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifest must be an object.');
    return value;
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`Cannot read Showdar manifest: ${error.message}`); }
}

async function skillPresent(root, relative) {
  const file = path.resolve(root, relative, 'SKILL.md');
  await assertSafeManagedPath(root, file);
  try { return (await stat(file)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// ponytail: inline JSON trigger arrays only; use a YAML parser if the canonical format changes.
// The canonical map uses JSON-compatible inline trigger arrays. Read only that
// documented subset; this is discovery data, never an authority input.
export async function discoverDomain(prompt, packageRoot) {
  const map = await readFile(path.join(packageRoot, 'router/skill-map.yaml'), 'utf8');
  const specialized = new Set(SKILLS.filter(s => s.id !== `showdar-${s.domain}`).map(s => s.id));
  const text = String(prompt).normalize('NFC').toLowerCase();
  const matches = [];
  for (const entry of map.matchAll(/^  [\w-]+:\n    triggers: (\[[^\n]*\])\n    skill: ([\w-]+)$/gm)) {
    if (!specialized.has(entry[2])) continue;
    const triggers = JSON.parse(entry[1]);
    if (triggers.some(trigger => {
      const phrase = trigger.normalize('NFC').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'u').test(text);
    }) || text.includes(entry[2])) matches.push(entry[2]);
  }
  return [...new Set(matches)].sort();
}

export function projectLifecycle(route) {
  return { primary: route.primary.skill, advisors: [...route.advisors] };
}

export async function routeRequest({ prompt, cwd, packageRoot, home = homedir() }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A non-empty prompt is required. Use --stdin or --prompt.');
  const canonical = resolveIntentFromPrompt(prompt);
  const lifecycle = projectLifecycle(canonical);
  const domain = { matches: await discoverDomain(prompt, packageRoot) };
  await assertSafeManagedPath(cwd, path.join(cwd, '.showdar.json'));
  const manifest = await readJson(path.join(cwd, '.showdar.json'));
  const installed = new Set();
  if (manifest) {
    if (manifest.version !== 2 || !Array.isArray(manifest.skills) || !Array.isArray(manifest.files)) throw new Error('Invalid managed Showdar manifest v2.');
    for (const id of manifest.skills) {
      if (typeof id !== 'string' || !ALL_SKILLS.some(s => s.id === id)) continue;
      for (const entry of manifest.files) {
        if (typeof entry.path === 'string' && path.basename(entry.path) === id && await skillPresent(cwd, entry.path)) installed.add(id);
      }
    }
    if (manifest.satisfiedByGlobal?.length) {
      const globalPath = path.join(home, '.showdar/global.json');
      await assertSafeManagedPath(home, globalPath);
      const global = await readJson(globalPath);
      const owned = new Set((global?.files ?? []).map(e => e.path));
      for (const entry of manifest.satisfiedByGlobal) {
        if (manifest.skills.includes(entry.skill) && typeof entry.path === 'string' && path.basename(entry.path) === entry.skill && owned.has(entry.path) && await skillPresent(home, entry.path)) installed.add(entry.skill);
      }
    }
  }
  return {
    intent: canonical.intent,
    lifecycle,
    domain,
    availability: {
      managed: manifest !== null,
      installed: manifest ? [...installed].sort() : null,
      missingLifecyclePrimary: manifest ? !installed.has(lifecycle.primary) : null,
      missingAdvisors: manifest ? lifecycle.advisors.filter(id => !installed.has(id)) : null,
      missingDomainMatches: manifest ? domain.matches.filter(id => !installed.has(id)) : null,
    },
  };
}

export function formatRoute(data) {
  const { lifecycle, domain, intent, availability: a } = data;
  const lines = [`Lifecycle: ${lifecycle.primary}`, `Domain: ${domain.matches.join(', ') || 'none'}`, `Advisors: ${lifecycle.advisors.join(', ') || 'none'}`, `Mutation: ${intent.mutation}`];
  lines.push(`Availability: ${!a.managed ? 'not-managed / unknown' : a.missingLifecyclePrimary ? 'lifecycle not installed' : 'lifecycle installed'}`);
  if (a.managed) {
    for (const id of [lifecycle.primary, ...lifecycle.advisors, ...domain.matches]) {
      const present = a.installed.includes(id);
      lines.push(`${id}: ${present ? 'installed' : 'not installed'}`);
      if (!present) lines.push(`Suggested command: showdar add ${id.replace(/^showdar-/, '')}`);
    }
  }
  return lines.join('\n');
}
