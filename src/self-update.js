import path from 'node:path';
import { realpathSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const PACKAGE_NAME = 'showdar-skills';
const BREW_FORMULA = 'caongocquy/showdar/showdar-skills';
const MANAGERS = new Set(['npm', 'pnpm', 'brew']);

function normalized(target) {
  try {
    const resolved = realpathSync(target).replaceAll('\\', '/');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch {
    return null;
  }
}

function globalRoot(command) {
  const executable = process.platform === 'win32' ? command + '.cmd' : command;
  const result = spawnSync(executable, ['root', '-g'], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function detectGlobalRoots() {
  return { pnpm: globalRoot('pnpm'), npm: globalRoot('npm') };
}

export function planSelfUpdate({ packageRoot, manager = null, roots = {} }) {
  if (manager !== null && !MANAGERS.has(manager)) {
    throw new Error('Unsupported update manager. Choose npm, pnpm, or brew.');
  }
  const current = normalized(packageRoot);
  if (!current) throw new Error('Cannot resolve the current Showdar installation.');

  let selected = manager;
  if (!selected) {
    if (/(^|\\/)Cellar\\/showdar-skills\\/[^/]+\\//i.test(current)) {
      selected = 'brew';
    } else {
      for (const candidate of ['pnpm', 'npm']) {
        if (!roots[candidate]) continue;
        const globalPackage = normalized(path.join(roots[candidate], PACKAGE_NAME));
        if (globalPackage && globalPackage === current) {
          selected = candidate;
          break;
        }
      }
    }
  }

  if (!selected) {
    throw new Error(
      'Cannot identify a globally installed Showdar CLI. Local checkouts, npx caches, and skills-only installs cannot self-update. ' +
      'Use npm install -g showdar-skills@latest, pnpm add -g showdar-skills@latest, or brew upgrade ' + BREW_FORMULA +
      '. You can select a known manager explicitly with --manager npm|pnpm|brew.'
    );
  }

  const commands = {
    npm: ['npm', ['install', '-g', 'showdar-skills@latest']],
    pnpm: ['pnpm', ['add', '-g', 'showdar-skills@latest']],
    brew: ['brew', ['upgrade', BREW_FORMULA]],
  };
  const [command, args] = commands[selected];
  return Object.freeze({ manager: selected, command, args: Object.freeze(args) });
}

export async function executeSelfUpdate(plan, { platform = process.platform } = {}) {
  if (!plan || !MANAGERS.has(plan.manager)) throw new Error('Invalid self-update plan.');
  const commands = {
    npm: ['npm', 'install', '-g', 'showdar-skills@latest'],
    pnpm: ['pnpm', 'add', '-g', 'showdar-skills@latest'],
    brew: ['brew', 'upgrade', BREW_FORMULA],
  };
  const [command, ...args] = commands[plan.manager];
  if (plan.command !== command || JSON.stringify(plan.args) !== JSON.stringify(args)) {
    throw new Error('Invalid self-update command.');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: platform === 'win32',
      windowsHide: true,
    });
    child.once('error', error => reject(new Error('Could not start ' + command + ': ' + error.message)));
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(command + ' update failed' + (signal ? ' (signal ' + signal + ')' : ' (exit ' + code + ')')));
    });
  });
}
