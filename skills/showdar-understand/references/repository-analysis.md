# Repository analysis

## Entry sequence
1. Read repository-level instructions before source code.
2. Identify package/workspace manifests, lockfiles, build files, CI definitions, and native project files.
3. Find runtime entrypoints and public interfaces before leaf utilities.
4. Trace one representative user or request flow end-to-end.
5. Confirm architecture by evidence from imports, routing, dependency injection, tests, and build configuration.

## Inventory questions

- What starts in development, production, CI, background work, and native hosts?
- Which manifest and lockfile owns each dependency graph?
- Which scripts are authoritative for build, test, lint, code generation, migration, and release?
- Which directories are generated, vendored, ignored, or platform-owned?
- Where are environment variables loaded, validated, and redacted?

## Evidence hierarchy
Prefer executable configuration and source imports over directory names. Prefer current code over README claims when they disagree. Treat generated files as evidence of tooling, not ownership boundaries. Treat tests as behavior evidence, not always as architecture truth.

## Output discipline
Separate observed facts from inferred architecture. Mark uncertain claims and name the file or symbol that would resolve them.

Do not inventory every file. Stop once the task-relevant entrypoint, owner, side-effect boundary, failure path, and verification command are evidenced.
