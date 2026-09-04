# Node upgrades

## Compatibility surface

Record current/target Node, package manager, lockfile owner, engine ranges, module mode, native addons, container base image, OS/architecture, and deployment runtime. Check direct/peer dependencies and duplicated transitive packages that depend on Node internals. Resolve the target graph without deleting the lockfile; explain overrides and native rebuilds.

## Breaking surfaces

Read Node release notes for ESM/CJS loader, built-in APIs, permissions, OpenSSL/TLS, Web APIs, diagnostics, and default error behavior. Search the repository for deprecated APIs, conditional exports, dynamic `require`, native addon ABI assumptions, test/build tool compatibility, and environment parsing. Separate source changes from generated lockfile, container, and process-manager changes.

## Sequence and rollback

Upgrade the runtime in a reproducible dev/container environment, then migrate source/tooling and native addons; do not combine unrelated dependency churn. Preserve the previous Node image, lockfile, artifact, and process configuration. A rollback must account for data written by the new runtime and any changed TLS/protocol behavior. Read `references/dependency-resolution.md`, `references/breaking-changes.md`, and `references/rollback.md`.

## Verification

Run clean install, typecheck/lint/tests, build, native-addon load checks, production-equivalent start, timeout/shutdown/error paths, and container smoke. Verify ESM/CJS entry points, OpenSSL/TLS connections, worker/process behavior, and runtime version parity in the deployed artifact.
