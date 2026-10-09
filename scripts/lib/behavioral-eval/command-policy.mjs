import path from 'node:path';

const ALLOWED_ARGV = new Set([
  JSON.stringify(['/usr/bin/git', ['status', '--short', '--branch']]),
  JSON.stringify(['/usr/bin/git', ['diff', '--check']]),
]);
const SHELL_SYNTAX = /[;&|<>$`\n\r]/;

export function authorizeBrokerCommand({ command, args, cwd, workspace } = {}) {
  if (typeof command !== 'string' || !path.isAbsolute(command) || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    return 'Command denied: executable and argv must use the broker contract';
  }
  if (typeof workspace !== 'string' || cwd !== workspace) return 'Command denied: cwd must be the isolated fixture';
  if ([...args].some(token => SHELL_SYNTAX.test(token) || /(^|[\\/])\.\.?([\\/]|$)/.test(token) || token.startsWith('~') || token.startsWith('/'))) {
    return 'Command denied: shell syntax and path escapes are not permitted';
  }
  if (!ALLOWED_ARGV.has(JSON.stringify([command, args]))) return 'Command denied: argv is not in the positive allowlist';
  return null;
}
