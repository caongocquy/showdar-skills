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
  if (/^\.env(?:\.|$)/.test(name)) add(groups, 'envFiles', relative);
  if (/^(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|go\.sum|cargo\.lock)$/.test(name)) add(groups, 'dependencyManifests', relative);
  if (/(auth|security|permission|token|session|crypto|oauth|login|biometric|deep[-_ ]?link|webview|key|cert|credential)/.test(name)) add(groups, 'securitySensitiveFiles', relative);
  if (/\.(ya?ml|json|toml|xml|plist|conf|config)$/.test(name)) add(groups, 'configurationFiles', relative);
  if (/(^|\/)(android|ios|mobile)(\/|$)/.test(normalized)) add(groups, 'platformSecurityFiles', relative);
}

async function walk(directory, relative = '', depth = 0, groups = {
  envFiles: [], dependencyManifests: [], securitySensitiveFiles: [], configurationFiles: [], platformSecurityFiles: [],
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
  for (const values of Object.values(groups)) values.sort();
  console.log(JSON.stringify({ root, ...groups }, null, 2));
} catch (error) {
  console.error(`inspect-security-surface: ${error.message}`);
  process.exitCode = 1;
}
