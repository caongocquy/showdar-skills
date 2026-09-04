#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());

function add(groups, group, relative) {
  groups[group].push(relative || '.');
}

function classify(relative, groups) {
  const name = path.basename(relative).toLowerCase();
  const normalized = relative.toLowerCase().replaceAll(path.sep, '/');
  if (normalized.includes('.github/workflows/') || /(^|\/)(\.gitlab-ci\.yml|jenkinsfile|buildkite\.ya?ml)$/.test(normalized)) add(groups, 'ciFiles', relative);
  if (/^(dockerfile|dockerfile\..*|compose\.ya?ml|docker-compose\.ya?ml)$/.test(name) || name.includes('compose')) add(groups, 'containerFiles', relative);
  if (/(deploy|k8s|kubernetes|helm|rollout|migration)/.test(name) || /(^|\/)(manifests|charts)(\/|$)/.test(normalized)) add(groups, 'deploymentFiles', relative);
  if (/^\.env(?:\.|$)/.test(name) || /(config|environment|settings)/.test(name)) add(groups, 'environmentFiles', relative);
  if (/(health|readiness|liveness|probe|status)/.test(name)) add(groups, 'healthCheckFiles', relative);
}

async function walk(directory, relative = '', depth = 0, groups = {
  ciFiles: [], containerFiles: [], deploymentFiles: [], environmentFiles: [], healthCheckFiles: [],
}) {
  if (depth > 4) return groups;
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return groups; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(child, childRelative, depth + 1, groups);
    else classify(childRelative, groups);
  }
  return groups;
}

try {
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error('target must be a directory');
  const groups = await walk(root);
  let packageScripts = [];
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    packageScripts = Object.keys(packageJson.scripts ?? {}).sort();
  } catch {
    packageScripts = [];
  }
  for (const values of Object.values(groups)) values.sort();
  console.log(JSON.stringify({ root, ...groups, packageScripts }, null, 2));
} catch (error) {
  console.error(`inspect-ops-state: ${error.message}`);
  process.exitCode = 1;
}
