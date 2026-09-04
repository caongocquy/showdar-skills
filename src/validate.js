import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILLS, PROFILES } from './catalog.js';
import { CANONICAL_RUNTIME_FILE, VENDORED_RUNTIME_FILES } from './runtime.js';
import { parseCsv } from '../engine/csv.mjs';

export const STACK_IDS = new Set([
  'android', 'android-testing', 'ci', 'cocoapods', 'compose', 'dart', 'detox', 'docker', 'electron',
  'expo', 'fastify', 'flutter', 'flutter-test', 'gradle', 'html-tailwind', 'integration_test', 'ios',
  'jest', 'kotlin', 'kubernetes', 'nestjs', 'nextjs', 'node', 'node-fastify', 'nuxt', 'package-manager',
  'playwright', 'react', 'react-native', 'react-testing-library', 'rust', 'svelte', 'spm', 'swift',
  'swiftui', 'tauri', 'typescript', 'vitest', 'vue', 'workspace', 'xctest',
]);

export const REQUIRED_SECTIONS = [
  'Purpose',
  'When to use',
  'When not to use',
  'Inputs and assumptions',
  'Non-negotiable rules',
  'Workflow',
  'Decision points',
  'Stack detection',
  'Failure modes',
  'Stop conditions',
  'Escalation conditions',
  'Verification',
  'Output contract',
  'Anti-patterns',
  'Example',
];

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return {};
  const out = {};
  for (const line of text.slice(4, end).split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function meaningfulLines(text) {
  return text.split(/\r?\n/).filter((line) => {
    const value = line.trim();
    return value && value !== '---' && !value.startsWith('#') && !/^[\-*]?$/.test(value);
  }).length;
}

function referencedLocalAssets(text) {
  const code = [...text.matchAll(/`((?:references|data|stacks|scripts|examples)\/[^`\n]+)`/g)].map((match) => match[1]);
  const links = [...text.matchAll(/\]\(((?:references|data|stacks|scripts|examples)\/[^)#\s]+)(?:#[^)\s]+)?\)/g)].map((match) => match[1]);
  return [...new Set([...code, ...links])];
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

export async function validateSkillDirectory(skillDir, { minMeaningfulLines = 60 } = {}) {
  const errors = [];
  const warnings = [];
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!(await exists(skillFile))) return { ok: false, errors: ['missing SKILL.md'], warnings };

  const text = await readFile(skillFile, 'utf8');
  const frontmatter = parseFrontmatter(text);
  const basename = path.basename(skillDir);

  if (!frontmatter.name) errors.push('frontmatter is missing name');
  else if (frontmatter.name !== basename) errors.push(`frontmatter name "${frontmatter.name}" does not match directory "${basename}"`);
  if (!frontmatter.description || frontmatter.description.length < 30) errors.push('frontmatter description must be at least 30 characters');

  for (const section of REQUIRED_SECTIONS) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^##\\s+${escaped}\\s*$`, 'mi').test(text)) errors.push(`missing section: ${section}`);
  }

  const lines = meaningfulLines(text);
  if (lines < minMeaningfulLines) errors.push(`SKILL.md has ${lines} meaningful lines; expected at least ${minMeaningfulLines}`);

  const placeholder = text.match(/\b(TODO|TBD|FIXME)\b|fill\s+(?:this\s+)?later|lorem ipsum|placeholder content/i);
  if (placeholder) errors.push(`placeholder marker found: ${placeholder[0]}`);

  for (const relative of referencedLocalAssets(text)) {
    if (!(await exists(path.join(skillDir, relative)))) errors.push(`referenced asset does not exist: ${relative}`);
  }

  async function validateScripts(dir) {
    if (!(await exists(dir))) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await validateScripts(target);
        continue;
      }
      if (!entry.name.endsWith('.mjs') && !entry.name.endsWith('.js')) continue;
      const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
      if (syntax.status !== 0) errors.push(`script ${path.relative(skillDir, target)} is not runnable JavaScript: ${(syntax.stderr || syntax.stdout).trim()}`);
      const source = await readFile(target, 'utf8');
      const imports = [
        ...source.matchAll(/(?:from\s+|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g),
      ].map((match) => match[1]);
      for (const specifier of imports) {
        const resolved = path.resolve(path.dirname(target), specifier);
        if (!(await exists(resolved))) {
          errors.push(`script ${path.relative(skillDir, target)} has missing relative import: ${specifier}`);
        }
      }
    }
  }
  await validateScripts(path.join(skillDir, 'scripts'));
  await validateCsvFiles(skillDir, errors);

  return { ok: errors.length === 0, errors, warnings };
}

async function validateCsvFiles(skillDir, errors) {
  const dataDir = path.join(skillDir, 'data');
  const csvFiles = [];
  async function walk(dir) {
    if (!(await exists(dir))) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name.endsWith('.csv')) csvFiles.push(target);
    }
  }
  await walk(dataDir);
  if (!csvFiles.length) return;

  const indexFile = path.join(dataDir, 'index.json');
  if (!(await exists(indexFile))) {
    errors.push('data contains CSV datasets but is missing data/index.json');
    return;
  }

  let index;
  try { index = JSON.parse(await readFile(indexFile, 'utf8')); }
  catch (error) { errors.push(`data/index.json is invalid JSON: ${error.message}`); return; }
  if (index.version !== 1) errors.push('data/index.json must declare version 1');
  if (index.skill !== path.basename(skillDir)) errors.push('data/index.json skill does not match directory');
  if (!Array.isArray(index.datasets) || !index.datasets.length) { errors.push('data/index.json must list at least one dataset'); return; }

  const indexed = new Set();
  for (const dataset of index.datasets) {
    if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
      errors.push('data/index.json contains a dataset that is not an object');
      continue;
    }
    const listFields = (name) => {
      const value = dataset[name];
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.some((field) => typeof field !== 'string' || !field.trim())) {
        errors.push(`data/index.json ${name} must be an array of non-empty strings`);
        return [];
      }
      const unique = new Set(value);
      if (unique.size !== value.length) errors.push(`data/index.json ${name} contains duplicates`);
      return value;
    };
    const requiredColumns = listFields('requiredColumns');
    const searchableFields = listFields('searchableFields');
    const filterFields = listFields('filterFields');
    if (dataset.idField !== undefined && (typeof dataset.idField !== 'string' || !dataset.idField.trim())) {
      errors.push('data/index.json idField must be a non-empty string');
    }
    const relative = dataset?.file;
    if (!safeRelativePath(relative) || !relative.endsWith('.csv')) { errors.push(`invalid indexed dataset path: ${relative ?? '<missing>'}`); continue; }
    if (indexed.has(relative)) errors.push(`duplicate indexed dataset: ${relative}`);
    indexed.add(relative);
    const target = path.join(skillDir, relative);
    if (!(await exists(target))) { errors.push(`indexed dataset does not exist: ${relative}`); continue; }
    let rows;
    try { rows = parseCsv(await readFile(target, 'utf8')); }
    catch (error) { errors.push(`${relative} is malformed CSV: ${error.message}`); continue; }
    if (!rows.length) { errors.push(`${relative} is an empty dataset`); continue; }
    const columns = Object.keys(rows[0]);
    const required = [...new Set([...requiredColumns, dataset.idField].filter(Boolean))];
    for (const column of required) if (!columns.includes(column)) errors.push(`${relative} is missing required column: ${column}`);
    for (const column of [...searchableFields, ...filterFields]) {
      if (!columns.includes(column)) errors.push(`${relative} indexes missing column: ${column}`);
    }
    const rowKeys = new Set();
    const idKeys = new Set();
    for (const row of rows) {
      const rowKey = JSON.stringify(columns.map((column) => row[column] ?? ''));
      if (rowKeys.has(rowKey)) errors.push(`${relative} contains duplicate row`);
      rowKeys.add(rowKey);
      if (dataset.idField) {
        const id = String(row[dataset.idField] ?? '').trim();
        if (!id) errors.push(`${relative} contains an empty ${dataset.idField}`);
        else if (idKeys.has(id)) errors.push(`${relative} contains duplicate id: ${id}`);
        idKeys.add(id);
      }
      for (const column of ['stack', 'stacks']) {
        for (const stack of String(row[column] ?? '').split(/[,;|]/).map((value) => value.trim()).filter(Boolean)) {
          if (stack !== '*' && !STACK_IDS.has(stack)) errors.push(`${relative} has invalid stack: ${stack}`);
        }
      }
      if (row.reference && (!safeRelativePath(row.reference) || !(await exists(path.join(skillDir, row.reference))))) {
        errors.push(`${relative} references missing asset: ${row.reference}`);
      }
    }
    if (dataset.reference && (!safeRelativePath(dataset.reference) || !(await exists(path.join(skillDir, dataset.reference))))) {
      errors.push(`${relative} references missing asset: ${dataset.reference}`);
    }
  }
  for (const target of csvFiles) {
    const relative = path.relative(skillDir, target).replaceAll(path.sep, '/');
    if (!indexed.has(relative)) errors.push(`${relative} is not listed in data/index.json`);
  }
}

export async function validateRepository(packageRoot) {
  const errors = [];
  const warnings = [];
  const known = new Set(SKILLS.map((skill) => skill.id));
  const skillsRoot = path.join(packageRoot, 'skills');

  for (const skill of SKILLS) {
    const dir = path.join(skillsRoot, skill.id);
    const result = await validateSkillDirectory(dir);
    for (const error of result.errors) errors.push(`${skill.id}: ${error}`);
    warnings.push(...result.warnings.map((warning) => `${skill.id}: ${warning}`));
  }

  let canonicalRuntime;
  try {
    canonicalRuntime = await readFile(path.join(packageRoot, CANONICAL_RUNTIME_FILE));
  } catch (error) {
    errors.push(`missing canonical runtime detector: ${CANONICAL_RUNTIME_FILE} (${error.message})`);
  }
  if (canonicalRuntime) {
    for (const relative of VENDORED_RUNTIME_FILES) {
      try {
        const vendoredRuntime = await readFile(path.join(packageRoot, relative));
        if (!vendoredRuntime.equals(canonicalRuntime)) errors.push(`vendored runtime detector drift: ${relative} differs from ${CANONICAL_RUNTIME_FILE}`);
      } catch (error) {
        errors.push(`missing vendored runtime detector: ${relative} (${error.message})`);
      }
    }
  }

  if (await exists(skillsRoot)) {
    for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('showdar-') && !known.has(entry.name)) errors.push(`unexpected skill directory: ${entry.name}`);
    }
  }

  for (const [profile, ids] of Object.entries(PROFILES)) {
    const seen = new Set();
    for (const id of ids) {
      if (!known.has(id)) errors.push(`profile ${profile} references unknown skill ${id}`);
      if (seen.has(id)) errors.push(`profile ${profile} duplicates skill ${id}`);
      seen.add(id);
    }
    const profileFile = path.join(packageRoot, 'profiles', `${profile}.json`);
    if (!(await exists(profileFile))) errors.push(`missing profile file: profiles/${profile}.json`);
    else {
      try {
        const disk = JSON.parse(await readFile(profileFile, 'utf8'));
        if (JSON.stringify(disk.skills ?? []) !== JSON.stringify(ids)) errors.push(`profile file ${profile}.json does not match catalog`);
      } catch (error) { errors.push(`invalid profile file ${profile}.json: ${error.message}`); }
    }
  }

  const relationshipFiles = [
    'router/skill-map.yaml', 'router/triggers.yaml', 'router/conflicts.yaml',
    'bundles/bugfix.yaml', 'bundles/feature.yaml', 'bundles/design.yaml', 'bundles/upgrade.yaml', 'bundles/release.yaml',
  ];
  for (const relative of relationshipFiles) {
    const file = path.join(packageRoot, relative);
    if (!(await exists(file))) { errors.push(`missing routing asset: ${relative}`); continue; }
    const text = await readFile(file, 'utf8');
    for (const id of text.match(/showdar-[a-z-]+/g) ?? []) if (!known.has(id)) errors.push(`${relative} references unknown skill ${id}`);
  }

  const commandMap = {
    understand: 'showdar-understand', plan: 'showdar-plan', design: 'showdar-design', build: 'showdar-build',
    debug: 'showdar-debug', test: 'showdar-test', review: 'showdar-review', upgrade: 'showdar-upgrade',
    ship: 'showdar-ship', recover: 'showdar-recover',
  };
  for (const [command, skill] of Object.entries(commandMap)) {
    const relative = `commands/opencode/showdar/${command}.md`;
    const file = path.join(packageRoot, relative);
    if (!(await exists(file))) { errors.push(`missing OpenCode command: ${relative}`); continue; }
    const text = await readFile(file, 'utf8');
    if (!text.includes('$ARGUMENTS')) errors.push(`${relative} does not accept $ARGUMENTS`);
    if (!text.includes(skill)) errors.push(`${relative} does not route to ${skill}`);
  }
  const skillCommand = path.join(packageRoot, 'commands', 'opencode', 'showdar', 'skill.md');
  if (!(await exists(skillCommand))) errors.push('missing OpenCode command: commands/opencode/showdar/skill.md');
  else {
    const text = await readFile(skillCommand, 'utf8');
    if (!text.includes('$ARGUMENTS')) errors.push('commands/opencode/showdar/skill.md does not accept $ARGUMENTS');
    for (const id of known) if (!text.includes(id)) errors.push(`commands/opencode/showdar/skill.md does not list ${id}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
