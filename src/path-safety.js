import { lstat } from 'node:fs/promises';
import path from 'node:path';

export function safeOwnedPath(baseRoot, relative, allowedRoots = []) {
  if (typeof relative !== 'string' || !relative) return null;
  const roots = [baseRoot, ...allowedRoots].map((root) => path.resolve(root));
  const target = path.resolve(relative.startsWith(path.sep) ? relative : path.join(roots[0], relative));
  return roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`)) ? target : null;
}

export async function lstatWithoutSymlink(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new Error(`Refusing managed path through symlink: ${target}`);
  return info;
}

export async function assertSafeManagedPath(baseRoot, target, allowedRoots = []) {
  const root = path.resolve(baseRoot);
  const resolved = safeOwnedPath(root, target, allowedRoots);
  if (!resolved) throw new Error(`Invalid managed path: ${target}`);

  try {
    await lstatWithoutSymlink(root);
  } catch (error) {
    if (error?.code === 'ENOENT') return resolved;
    throw error;
  }
  let current = root;
  for (const component of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      await lstatWithoutSymlink(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return resolved;
}
