#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`Invalid argument list near ${key ?? "<end>"}`);
    values[key.slice(2)] = value;
  }
  return values;
}

function run(command, args, options = {}) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

function capture(command, args, options = {}) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout;
}

const args = parseArgs(process.argv.slice(2));
const tool = args.tool;
const binName = args["bin-name"];
const packageName = args["package-name"];
const packageDir = path.resolve(args["package-dir"] ?? ".");
const entry = args.entry;
const version = args.version;
const ignoreInstallScripts = args["ignore-install-scripts"] === "true";

for (const [name, value] of Object.entries({ tool, binName, packageName, entry, version })) {
  if (!value) fail(`Missing --${name}`);
}

const platform = process.env.RELEASE_PLATFORM;
const arch = process.env.RELEASE_ARCH;
if (!platform || !arch) fail("RELEASE_PLATFORM and RELEASE_ARCH are required");

const root = process.cwd();
const releaseRoot = path.join(root, ".release");
const tempDir = path.join(releaseRoot, "pack");
const bundleDir = path.join(releaseRoot, "bundle");

fs.rmSync(releaseRoot, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(bundleDir, { recursive: true });

const packOutput = capture("npm", ["pack", "--json", "--pack-destination", tempDir], { cwd: packageDir });
const packMetadata = JSON.parse(packOutput);
if (!Array.isArray(packMetadata) || packMetadata.length !== 1 || !packMetadata[0]?.filename) {
  fail("npm pack did not return exactly one package archive");
}

const packageArchive = path.join(tempDir, packMetadata[0].filename);
fs.writeFileSync(
  path.join(bundleDir, "package.json"),
  JSON.stringify(
    {
      name: `${tool}-portable-runtime`,
      private: true,
      version,
      description: `Portable runtime bundle for ${tool}`,
    },
    null,
    2,
  ) + "\n",
);

const installArgs = [
  "install",
  "--omit=dev",
  "--no-package-lock",
  "--no-save",
  "--no-audit",
  "--no-fund",
];
if (ignoreInstallScripts) installArgs.push("--ignore-scripts");
installArgs.push(packageArchive);
run("npm", installArgs, { cwd: bundleDir });

const packagePath = path.join(bundleDir, "node_modules", ...packageName.split("/"));
const entryPath = path.join(packagePath, ...entry.split("/"));
if (!fs.existsSync(entryPath)) fail(`Packaged CLI entry does not exist: ${entryPath}`);

const binDir = path.join(bundleDir, "bin");
fs.mkdirSync(binDir, { recursive: true });

const unixRelativeEntry = path.relative(binDir, entryPath).split(path.sep).join("/");
const unixLauncher = `#!/bin/sh
set -e
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SCRIPT_DIR/${unixRelativeEntry}" "$@"
`;
const unixLauncherPath = path.join(binDir, binName);
fs.writeFileSync(unixLauncherPath, unixLauncher);
fs.chmodSync(unixLauncherPath, 0o755);

const windowsRelativeEntry = path.relative(binDir, entryPath).split(path.sep).join("\\");
const windowsLauncher = `@echo off\r\nnode "%~dp0${windowsRelativeEntry}" %*\r\n`;
fs.writeFileSync(path.join(binDir, `${binName}.cmd`), windowsLauncher);

const smoke = spawnSync(process.execPath, [entryPath, "--version"], {
  cwd: bundleDir,
  encoding: "utf8",
  env: {
    ...process.env,
    CI: "true",
  },
});
if (smoke.error) throw smoke.error;
if (smoke.status !== 0) {
  process.stderr.write(smoke.stderr ?? "");
  fail(`Portable CLI smoke test failed with exit code ${smoke.status}`);
}
const stdout = (smoke.stdout ?? "").trim();
if (!stdout.includes(version)) {
  fail(`Portable CLI reported unexpected version: ${stdout || "<empty>"}; expected ${version}`);
}

const metadata = {
  schemaVersion: 1,
  tool,
  binName,
  packageName,
  version,
  platform,
  arch,
  node: process.version,
  packageArchive: path.basename(packageArchive),
};
fs.writeFileSync(path.join(bundleDir, "RELEASE.json"), JSON.stringify(metadata, null, 2) + "\n");

const packageJson = fs.readFileSync(path.join(packagePath, "package.json"));
const digest = crypto.createHash("sha256").update(packageJson).digest("hex");
console.log(`Prepared ${tool} ${version} for ${platform}-${arch} (package manifest sha256 ${digest})`);
