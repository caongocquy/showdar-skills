import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

async function exists(target) { try { await access(target); return true; } catch { return false; } }

export async function detectStacks(projectRoot) {
  const found = new Set();
  const packageFile = path.join(projectRoot, 'package.json');
  if (await exists(packageFile)) {
    try {
      const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps.next) found.add('nextjs');
      if (deps.react) found.add('react');
      if (deps['react-native']) found.add('react-native');
      if (deps.vue) found.add('vue');
      if (deps.svelte) found.add('svelte');
      if (deps.fastify) found.add('fastify');
      if (deps['@nestjs/core']) found.add('nestjs');
      if (deps['@tauri-apps/api']) found.add('tauri');
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
  if ((await exists(path.join(projectRoot, 'Package.swift'))) || (await exists(path.join(projectRoot, '*.xcodeproj')))) found.add('swift');
  if (await exists(path.join(projectRoot, 'Cargo.toml'))) found.add('rust');
  if (await exists(path.join(projectRoot, 'go.mod'))) found.add('go');
  if (await exists(path.join(projectRoot, 'pyproject.toml')) || await exists(path.join(projectRoot, 'requirements.txt'))) found.add('python');
  return [...found];
}
