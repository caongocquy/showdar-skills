import { readFile } from 'node:fs/promises';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag?.startsWith('v') || tag.length === 1) {
  throw new Error('Expected a release tag such as v0.2.0');
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tagVersion = tag.slice(1);
if (tagVersion !== packageJson.version) {
  throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}`);
}

console.log(`Release tag ${tag} matches package version ${packageJson.version}`);
