# Releasing Showdar Skills

This is maintainer documentation. The package is currently prepared for its
first npm release and is not published yet.

## First npm release

Run these checks from a clean release checkout:

```bash
npm test
npm run validate
npm run check
npm run smoke
npm run eval
npm pack --dry-run
npm pack
```

Install the generated tarball in an isolated prefix/HOME and smoke-test the
CLI before publishing. Confirm the package name and account, then publish the
exact tarball after `npm login`/`npm whoami` succeeds:

```bash
npm view showdar-skills version
npm login
npm whoami
npm publish ./showdar-skills-0.2.0.tgz
npm view showdar-skills version
```

Remove the generated tarball after verification. After the registry confirms
`0.2.0`, configure the npm Trusted Publisher, then create and push the release
tag. The tagged workflow will verify the matching version, see that `0.2.0`
already exists, and skip `npm publish` successfully:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Trusted Publisher setup

Trusted Publishing is **not configured yet**. The package must exist on npm
before its first GitHub Actions trusted publisher can be added.

In the npm package settings, add a GitHub Actions trusted publisher with:

```text
Provider: GitHub Actions
Organization or user: caongocquy
Repository: showdar-skills
Workflow filename: publish.yml
```

The workflow is `.github/workflows/publish.yml`. It runs only for `v*` tags,
uses Node 24, checks npm/Node versions, verifies that the tag matches
`package.json`, checks whether the exact package version already exists, runs
the release checks, and publishes with OIDC provenance only when the version
is absent. A real registry E404 means "absent"; network, auth, and other
registry failures stop the workflow. It has `id-token: write` and contains no
npm token. npm Trusted Publishing requires npm >=11.5.1 and Node >=22.14.0.

Do not claim this relationship is active until it has been configured and a
tagged workflow has completed successfully.

## Subsequent releases

For a subsequent version, bump the package version, verify it, commit the
release, then create and push a matching tag:

```bash
npm test
npm run validate
npm run check
npm run smoke
npm run eval
npm run release:check -- vX.Y.Z
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tagged workflow verifies the tag/package version, confirms that
`showdar-skills@X.Y.Z` is absent from npm, and runs `npm publish --provenance`
through the configured npm Trusted Publisher. It does not bump versions,
create tags, push code, or create GitHub releases.
