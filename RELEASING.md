# Releasing Showdar Skills

Release preparation and publication are separate approvals. v0.18.0 is a candidate until its Draft PR is reviewed, merged and separately approved for tagging/publication. Do not publish from a preparation branch.

## Preparation checklist

- Audit the diff from the preceding tag and verify the exact main baseline.
- Use a dedicated release branch; bump package.json and any existing lock/version references together. This repository currently has no tracked package lock.
- Verify the 18 primitive / four companion / four workflow catalog, setup visibility, ownership protections and upgrade from the previous package.
- Run `npm test`, `npm run validate`, `npm run check`, `npm run smoke`, `npm run eval`, `npm pack --dry-run` and `npm run release:check -- v0.18.0` on the final source.
- Inspect actual packaged SKILL.md files and referenced assets; prove fresh setup and previous-version additive upgrade with isolated projects/prefixes. Protect modified and user-owned files.
- Record exact source SHA, command results, tarball digest and platform coverage. Open a Draft PR into main; no merge, tag, npm publish, Homebrew update or GitHub Release at this stage.

`npm run validate` uses `showdar validate --source` so source-only workflow coverage remains mandatory during release verification. Installed CLI `showdar validate` checks all shipped skill/catalog/runtime assets without requiring unshipped benchmark tooling.

Experimental TASK-002 inputs, runtimes, trusted runner and signed evidence are outside the stable package/release diff. Keep their accepted pins and behavioral verdicts separate; do not introduce new behavioral gates into this checklist. Existing repository security CI remains unchanged.

## Publication after separate approval

The tag must equal package.json version. `.github/workflows/publish.yml` runs only for v* tags, checks Node/npm compatibility, matching version, package tests/smoke and deterministic retrieval/workflow evaluation. It uses npm OIDC provenance when the exact version is absent; genuine registry E404 means absent, while network/auth/other failures stop publication. Its release job creates a GitHub Release only after npm publication succeeds (or the version is already present).

Trusted publisher configuration must point to caongocquy/showdar-skills and publish.yml. Node >=22.14.0 and npm >=11.5.1 are checked by the existing workflow. Preparation does not configure credentials or prove external publisher settings; verify the current relationship before authorizing a tag. Do not manually publish a competing tarball or move an existing tag.

`.github/workflows/release-artifacts.yml` builds portable runtime assets at the exact tag:

| Runner | Artifact |
| --- | --- |
| macos-15 / arm64 | showdar-skills-darwin-arm64.tar.gz |
| macos-15-intel / x64 | showdar-skills-darwin-x64.tar.gz |
| ubuntu-22.04 / x64 | showdar-skills-linux-x64.tar.gz |
| windows-2022 / x64 | showdar-skills-windows-x64.zip |

Each bundle includes the matching package, Node runtime and launcher, and receives a SHA-256 sidecar. The asset workflow waits for the GitHub Release then uploads archives/checksums. Local macOS proof is not Linux/Windows execution proof; confirm all tagged matrix jobs and artifact identities before announcing cross-platform release availability.

Homebrew publication belongs to the separate tap and is not performed by these workflows. After approved publication, update only the verified platform URLs/checksums/version in that tap, then test installation. Do not update Homebrew during Draft PR preparation.

## Rollback and verification

Preserve immutable tags and published versions. Check npm version/provenance, GitHub Release asset checksums and supported-platform installation after publication. A broken published version needs a separately approved follow-up version; do not republish or silently replace acceptance evidence.
