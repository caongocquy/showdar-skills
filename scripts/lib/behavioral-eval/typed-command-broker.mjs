import path from 'node:path';
import { authorizeBrokerCommand } from './command-policy.mjs';

const TYPED_GIT_TOOLS = Object.freeze({
  'git.status': Object.freeze(['status', '--short', '--branch']),
  'git.diff-check': Object.freeze(['diff', '--check']),
});

export class BrokerPolicyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BrokerPolicyError';
    this.code = 'BROKER_DENIED';
  }
}

/**
 * Convert a model-requested typed tool into a fixed, read-only argv.
 * The caller supplies the fixture workspace; the model cannot supply
 * an executable, arguments, cwd, or environment.
 *
 * This is a preventive command-selection boundary, NOT an OS sandbox
 * or a trusted agent runner. Never execute the result without separate
 * sandbox and credential-isolation verification.
 */
export function prepareBrokerCommand(request, { workspace } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.getPrototypeOf(request) !== Object.prototype ||
      Object.keys(request).length !== 1 ||
      !Object.hasOwn(request, 'tool') || typeof request.tool !== 'string') {
    throw new BrokerPolicyError('Tool denied: expected only a typed tool identifier');
  }

  const args = Object.hasOwn(TYPED_GIT_TOOLS, request.tool)
    ? TYPED_GIT_TOOLS[request.tool]
    : undefined;
  if (!args) throw new BrokerPolicyError('Tool denied: unrecognized or unauthorized tool');

  if (typeof workspace !== 'string' || !path.isAbsolute(workspace) ||
      workspace === path.parse(workspace).root ||
      path.normalize(workspace) !== workspace ||
      workspace.includes('\0')) {
    throw new BrokerPolicyError('Tool denied: expected a normalized absolute fixture workspace');
  }

  const command = '/usr/bin/git';
  const denied = authorizeBrokerCommand({ command, args: [...args], cwd: workspace, workspace });
  if (denied) throw new BrokerPolicyError(denied);

  return Object.freeze({
    tool: request.tool,
    command,
    args: Object.freeze([...args]),
    cwd: workspace,
    shell: false,
  });
}

/**
 * Offline contract fixture only. The supplied executor is a fake process;
 * this function never establishes trusted agent provenance or behavioral PASS.
 * Real execution needs a separately verified OS-sandboxed host boundary.
 */
export function createOfflineBroker({ workspace, fakeExec } = {}) {
  return Object.freeze({
    async execute(request) {
      const invocation = prepareBrokerCommand(request, { workspace });
      if (typeof fakeExec !== 'function') {
        return { status: 'BLOCKED', reason: 'No fake-process fixture available; trusted runner unsupported' };
      }

      try {
        const result = await fakeExec(invocation);
        if (!result || typeof result !== 'object' ||
            !Number.isInteger(result.exitCode) ||
            result.exitCode < 0 || result.exitCode > 255) {
          return { status: 'BLOCKED', reason: 'Invalid fake-process fixture response' };
        }
        return Object.freeze({
          status: 'NOT_RUN',
          provenance: 'fake-process-fixture',
          command: invocation.tool,
          exitCode: result.exitCode,
          observed: result.exitCode === 0,
          reason: 'Deterministic tool-contract fixture; no real agent executed',
        });
      } catch (error) {
        return {
          status: 'BLOCKED',
          reason: `Fake-process fixture failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    },
  });
}
