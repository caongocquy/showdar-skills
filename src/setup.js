import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertSafeManagedPath } from './path-safety.js';
import { guardMutation } from './git-guard.js';

const DOC_ROOT = 'docs/agents';
const DOCS = ['project.md', 'issue-tracker.md', 'verification.md', 'domain.md'];
const codeQuote = text => String.fromCharCode(96) + text + String.fromCharCode(96);

async function exists(file) {
  try { await access(file); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
function git(cwd, ...args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd, encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}
async function readJson(file) {
  if (!(await exists(file))) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return null; }
}
export function validateDocsDir(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Document directory must be a relative path.');
  if (value.includes('\0') || value.includes('\\') || path.isAbsolute(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..') ||
      value === '.git' || value.startsWith('.git/')) {
    throw new Error('Invalid document directory: use a safe project-relative path.');
  }
  return value;
}
export async function inspectSetupProject(cwd) {
  const pkg = await readJson(path.join(cwd, 'package.json'));
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const remote = git(cwd, 'remote', 'get-url', 'origin');
  const tracker = /github\.com[:/]/i.test(remote) ? 'github'
    : /gitlab/i.test(remote) ? 'gitlab' : 'local';
  const workspace = await exists(path.join(cwd, 'pnpm-workspace.yaml')) || !!pkg?.workspaces;
  const technologies = [
    ['next', 'Next.js'], ['react', 'React'], ['react-native', 'React Native'],
    ['vue', 'Vue'], ['vite', 'Vite'], ['typescript', 'TypeScript'],
    ['vitest', 'Vitest'], ['jest', 'Jest'],
  ].filter(([key]) => pkg?.dependencies?.[key] || pkg?.devDependencies?.[key]).map(([, label]) => label);
  const docs = {
    glossary: await exists(path.join(cwd, 'GLOSSARY.md')),
    glossaryMap: await exists(path.join(cwd, 'GLOSSARY-MAP.md')),
    adr: await exists(path.join(cwd, 'docs', 'adr')),
    agents: await exists(path.join(cwd, 'AGENTS.md')),
    claude: await exists(path.join(cwd, 'CLAUDE.md')),
  };
  return {
    root: cwd, remote: remote || null, tracker,
    workspace: workspace ? 'monorepo' : 'single-context',
    packageName: pkg?.name || path.basename(cwd),
    technologies, scripts: Object.fromEntries(Object.entries(scripts).filter(
      ([name, script]) => ['test', 'typecheck', 'type-check', 'lint', 'build', 'check', 'validate'].includes(name)
        && typeof script === 'string')),
    docs,
  };
}
function docText(name, details, tracker, docsDir) {
  const { technologies, packageName, scripts, workspace, docs } = details;
  if (name === 'project.md') return [
    '# Project context', '', 'Project: ' + packageName, 'Layout: ' + workspace,
    'Detected stack: ' + (technologies.join(', ') || 'not detected'), '',
    'Project-specific context for all installed Showdar skills. Review detected values.',
    'Detection does not authorize changes to code or configuration.', '',
  ].join('\n');
  if (name === 'issue-tracker.md') return [
    '# Issue tracker', '', 'Provider: ' + tracker,
    'Remote: ' + (details.remote || 'not configured'), '',
    tracker === 'github' ? 'Use repository GitHub Issues and PR conventions.'
      : tracker === 'gitlab' ? 'Use repository GitLab Issues and MR conventions.'
        : 'Use local files or replace this section with your tracker convention.',
    'Do not modify remote issues without explicit task authorization.', '',
  ].join('\n');
  if (name === 'verification.md') {
    const lines = Object.entries(scripts).map(([name, script]) =>
      '- ' + name + ': ' + codeQuote(script.replaceAll('\n', ' ')));
    return ['# Verification', '', 'Detected package scripts (inspect before running):',
      ...(lines.length ? lines : ['- No standard verification scripts detected']),
      '', 'Run narrow checks first and full checks before handoff.',
      'Never execute untrusted project scripts without reviewing their content.', ''].join('\n');
  }
  return ['# Domain context', '', 'Layout: ' + workspace,
    'Glossary: ' + (docs.glossary ? 'GLOSSARY.md' : docs.glossaryMap ? 'GLOSSARY-MAP.md' : 'not yet present'),
    'Architecture decisions: ' + (docs.adr ? 'docs/adr/' : 'not yet present'), '',
    'Read an existing glossary and relevant ADRs before changing domain names.',
    'Create glossary entries and ADRs lazily when actual decisions are resolved.',
    'Shared context directory: ' + docsDir, ''].join('\n');
}
export async function planProjectSetup({ cwd, docsDir = DOC_ROOT, tracker = null } = {}) {
  if (!cwd) throw new Error('Project directory is required.');
  const root = path.resolve(cwd);
  const folder = validateDocsDir(docsDir);
  const details = await inspectSetupProject(root);
  const selected = tracker || details.tracker;
  if (!['github', 'gitlab', 'local'].includes(selected)) throw new Error('Tracker must be github, gitlab or local.');
  const files = [];
  for (const name of DOCS) {
    const rel = folder + '/' + name;
    const dest = path.resolve(root, rel);
    await assertSafeManagedPath(root, dest);
    const present = await exists(dest);
    files.push({ path: rel, action: present ? 'preserve' : 'create',
      content: present ? null : docText(name, details, selected, folder) });
  }
  return { schemaVersion: 1, tracker: selected, docsDir: folder, inspection: details, files };
}
export async function applyProjectSetup({ cwd, plan }) {
  if (!plan || plan.schemaVersion !== 1) throw new Error('Invalid setup plan.');
  const root = path.resolve(cwd);
  const gate = guardMutation({ cwd: root, mutation: 'local-write' });
  if (!gate.allowed) throw new Error('Setup blocked by Git preflight: ' + gate.code + '. Run showdar git-start first.');
  const folder = validateDocsDir(plan.docsDir);
  const fresh = await planProjectSetup({ cwd: root, docsDir: folder, tracker: plan.tracker });
  const created = [], preserved = [];
  for (const file of fresh.files) {
    const dest = path.resolve(root, file.path);
    await assertSafeManagedPath(root, dest);
    if (file.action === 'preserve') { preserved.push(file.path); continue; }
    await mkdir(path.dirname(dest), { recursive: true });
    try {
      await writeFile(dest, file.content, { flag: 'wx' });
      created.push(file.path);
    } catch (e) {
      if (e.code === 'EEXIST') { preserved.push(file.path); continue; }
      throw e;
    }
  }
  return { created, preserved, docsDir: folder, tracker: fresh.tracker };
}
