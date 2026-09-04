import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function classifyNpmViewResult(result) {
  if (result.status === 0) return 'published';

  const output = `${result.stdout}\n${result.stderr}`;
  if (/\bE404\b/.test(output) && /404 Not Found|status code 404/i.test(output)) return 'missing';

  const error = new Error(`npm view failed:\n${output}`);
  error.exitCode = result.status ?? 1;
  throw error;
}

function setPublishOutput(value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) appendFileSync(outputFile, `publish=${value}\n`);
  else console.log(`publish=${value}`);
}

async function main() {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const specifier = `${packageJson.name}@${packageJson.version}`;
  const result = spawnSync('npm', [
    'view',
    specifier,
    'version',
    '--json',
    '--registry=https://registry.npmjs.org',
  ], { encoding: 'utf8' });
  const state = classifyNpmViewResult(result);

  if (state === 'published') {
    setPublishOutput('false');
    console.log(`${specifier} already exists on npm; skipping publish.`);
    return;
  }

  setPublishOutput('true');
  console.log(`${specifier} is not on npm; continuing to publish.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
