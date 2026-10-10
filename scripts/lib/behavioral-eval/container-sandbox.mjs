import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
export const SANDBOX_IMAGE = 'node:24-alpine';
export const SANDBOX_PROBES = Object.freeze(['identity', 'network', 'root-write', 'outside-read']);
const EXECUTABLES = Object.freeze(['/usr/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker']);
const MAX_BUFFER = 16 * 1024;
const RUN_TIMEOUT_MS = 15_000;
const GUEST_SCRIPT = "\nconst fs = require('node:fs');\nconst net = require('node:net');\nconst probe = process.argv[1];\nconst finish = data => { process.stdout.write(JSON.stringify(data)); };\nif (probe === 'identity') {\n  let capabilities = '', noNewPrivs = '';\n  try {\n    const status = fs.readFileSync('/proc/self/status', 'utf8');\n    capabilities = status.match(/^CapEff:\\s*(\\S+)/m)?.[1] ?? '';\n    noNewPrivs = status.match(/^NoNewPrivs:\\s*(\\S+)/m)?.[1] ?? '';\n  } catch {}\n  const fixtureRead = fs.readFileSync('/workspace/fixture.txt', 'utf8') === 'showdar-fixture';\n  fs.writeFileSync('/workspace/probe-written.txt', 'showdar-written');\n  finish({ probe, pass: process.getuid() !== 0 &&\n    /^0+$/.test(capabilities) && noNewPrivs === '1' &&\n    fixtureRead && fs.readFileSync('/workspace/probe-written.txt', 'utf8') === 'showdar-written' &&\n    !process.env.OPENAI_API_KEY && !process.env.CODEX_API_KEY &&\n    !fs.existsSync('/var/run/docker.sock') && !fs.existsSync('/workspace/evidence') });\n} else if (probe === 'root-write') {\n  let denied = false;\n  try { fs.writeFileSync('/showdar-must-not-write', 'unsafe'); }\n  catch (error) { denied = ['EROFS','EACCES','EPERM'].includes(error.code); }\n  finish({ probe, pass: denied });\n} else if (probe === 'outside-read') {\n  let denied = false;\n  try { fs.readFileSync('/workspace/../outside-secret.txt', 'utf8'); }\n  catch (error) { denied = ['ENOENT','EACCES','EPERM'].includes(error.code); }\n  finish({ probe, pass: denied });\n} else if (probe === 'network') {\n  const socket = net.connect({ host:'1.1.1.1', port:443 });\n  let done = false;\n  const complete = pass => {\n    if (done) return;\n    done = true;\n    socket.destroy();\n    finish({ probe, pass });\n  };\n  socket.once('connect', () => complete(false));\n  socket.once('error', error => complete(['ENETUNREACH','EHOSTUNREACH','EACCES','EPERM'].includes(error.code)));\n  socket.setTimeout(2500, () => complete(false));\n} else {\n  process.stderr.write('Unknown probe');\n  process.exitCode = 2;\n}\n";

function deny(reason, extras = {}) {
  return { available: false, verified: false, trustedRunnerSupported: false, reason, checks: [], ...extras };
}

function dockerArgs({ imageDigest, workspace, name, probe }) {
  if (!SANDBOX_PROBES.includes(probe)) throw new Error('Unknown sandbox probe');
  if (!/^node@sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error('Pinned image digest required');
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace) ||
      workspace.includes(',') || workspace.includes('\n') || workspace.includes('\r')) {
    throw new Error('Invalid fixture mount path');
  }
  return [
    'run', '--rm', '--pull=never', '--name', name,
    '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=64',
    '--memory=256m', '--cpus=1', '--user=65534:65534',
    '--workdir=/workspace', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=16m',
    '--mount', 'type=bind,src=' + workspace + ',dst=/workspace,rw',
    '--entrypoint=node', imageDigest, '-e', GUEST_SCRIPT, probe,
  ];
}

export function buildSandboxProbeArgs(options) {
  return dockerArgs(options);
}

async function findDockerBinary() {
  for (const binary of EXECUTABLES) {
    try { await access(binary); return binary; } catch {}
  }
  return null;
}

/**
 * Executes only fixed, model-free capability probes. An injected runner NEVER
 * attests a verified sandbox. No image download, API call or live agent launch.
 */
export async function verifyDockerIsolation({
  runCommand = exec, image = SANDBOX_IMAGE,
} = {}) {
  if (image !== SANDBOX_IMAGE) return deny('Unapproved sandbox image');
  const docker = await findDockerBinary();
  if (!docker) return deny('Docker CLI unavailable on this host');
  const simulated = runCommand !== exec;
  const env = { PATH: '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin' };
  const command = (args, timeout = RUN_TIMEOUT_MS) =>
    runCommand(docker, args, { env, timeout, maxBuffer: MAX_BUFFER, windowsHide: true });
  let root;
  let available = false;
  const checks = [];
  try {
    const version = await command(['version', '--format', '{{.Server.Version}}'], 5_000);
    if (!/^\d+\.\d+/.test(String(version.stdout).trim())) return deny('Docker daemon version unavailable');
    available = true;

    // Deliberately do not pull images. The caller must provision a trusted image.
    const inspected = await command(['image', 'inspect', '--format', '{{json .RepoDigests}}', image], 5_000);
    const digests = JSON.parse(String(inspected.stdout).trim());
    const digest = digests.find(value => /^node@sha256:[a-f0-9]{64}$/.test(value));
    if (!digest) return deny('Locally provisioned image has no pinned RepoDigest', { available: true });

    root = await mkdtemp(path.join(os.tmpdir(), 'showdar-sandbox-preflight-'));
    const workspace = path.join(root, 'fixture');
    await mkdir(workspace, { mode: 0o700 });
    await chmod(workspace, 0o777); // Disposable fixture only; no secrets or evidence inside.
    await writeFile(path.join(workspace, 'fixture.txt'), 'showdar-fixture', { mode: 0o644, flag: 'wx' });
    await writeFile(path.join(root, 'outside-secret.txt'), randomUUID(), { mode: 0o600, flag: 'wx' });

    for (const probe of SANDBOX_PROBES) {
      const name = 'showdar-isolation-' + randomUUID();
      const args = dockerArgs({ imageDigest: digest, workspace: await realpath(workspace), name, probe });
      try {
        const result = await command(args);
        const output = JSON.parse(String(result.stdout).trim());
        const passed = output.probe === probe && output.pass === true;
        checks.push({ probe, status: passed ? 'PASS' : 'FAIL' });
        if (!passed) break;
      } catch (error) {
        checks.push({ probe, status: 'BLOCKED', reason: String(error?.message ?? 'Container probe failed').slice(0, 300) });
        break;
      } finally {
        // A timed-out Docker client may leave a running container behind.
        try { await command(['rm', '--force', name], 3_000); } catch {}
      }
    }

    const complete = checks.length === SANDBOX_PROBES.length && checks.every(check => check.status === 'PASS');
    return {
      available, verified: complete && !simulated, trustedRunnerSupported: false,
      imageDigest: digest, checks,
      reason: simulated ? 'Injected probe transport is not a real sandbox attestation'
        : complete ? 'Tool container isolation probes passed; trusted live runner still unsupported'
          : 'Container isolation probes incomplete or failed',
    };
  } catch (error) {
    return deny('Container preflight blocked: ' + String(error?.message ?? 'unknown failure').slice(0, 300), { available, checks });
  } finally {
    if (root) await rm(root, { recursive: true, force: true });
  }
}
