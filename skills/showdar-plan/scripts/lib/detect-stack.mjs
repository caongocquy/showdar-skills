import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function exists(target) { try { await access(target); return true; } catch { return false; } }

export async function detectStacks(projectRoot) {
  const found = new Set();
  try {
    const names = await readdir(projectRoot);
    if (names.some((name) => ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].includes(name))) found.add('package-manager');
    if (names.some((name) => ['pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json'].includes(name))) found.add('workspace');
    if (names.some((name) => name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace'))) found.add('ios');
  } catch { /* inaccessible repository is reported by the caller */ }
  const packageFile = path.join(projectRoot, 'package.json');
  if (await exists(packageFile)) {
    try {
      const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
      if (pkg.packageManager) found.add('package-manager');
      if (pkg.workspaces) found.add('workspace');
      if (deps.next) found.add('nextjs');
      if (deps.react) found.add('react');
      if (deps['react-native']) found.add('react-native');
      if (deps.vue) found.add('vue');
      if (deps.svelte) found.add('svelte');
      if (deps.tailwindcss) found.add('html-tailwind');
      if (deps.fastify || deps['@fastify/core']) found.add('fastify');
      if (deps['@nestjs/core']) found.add('nestjs');
      if (deps['@tauri-apps/api']) found.add('tauri');
      if (deps.electron) found.add('electron');
      if (deps.expo || deps['expo-router']) found.add('expo');
      found.add('node');
    } catch { /* malformed package is reported by higher-level skills */ }
  }
  if (await exists(path.join(projectRoot, 'pubspec.yaml'))) {
    const pubspec = await readFile(path.join(projectRoot, 'pubspec.yaml'), 'utf8');
    if (/\bflutter\s*:/m.test(pubspec)) found.add('flutter');
    found.add('dart');
  }
  if (await exists(path.join(projectRoot, 'ios'))) found.add('ios');
  if (await exists(path.join(projectRoot, 'android'))) found.add('android');
  if (await exists(path.join(projectRoot, 'Package.swift'))) { found.add('swift'); found.add('spm'); }
  if (await exists(path.join(projectRoot, 'Cargo.toml'))) found.add('rust');
  if (await exists(path.join(projectRoot, 'go.mod'))) found.add('go');
  if (await exists(path.join(projectRoot, 'pyproject.toml')) || await exists(path.join(projectRoot, 'requirements.txt'))) found.add('python');
  if (await exists(path.join(projectRoot, '.github', 'workflows')) || await exists(path.join(projectRoot, '.gitlab-ci.yml')) || await exists(path.join(projectRoot, 'Jenkinsfile'))) found.add('ci');
  return [...found].sort();
}
