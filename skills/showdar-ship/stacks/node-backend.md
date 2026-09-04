# Node backend shipping

## Artifact and runtime

Record Node version/engine, package-manager lockfile, start command, process model, image/base runtime, port, and environment names. Verify the production artifact contains the intended source/generated files and no development-only dependency or secret. Test with the same module mode, CPU architecture, TLS/CA setup, and resource limits as the target; a passing local dev server is not runtime parity.

## Data and rollout sequence

Classify migrations as additive, backfill, lock-heavy, destructive, or irreversible. Prefer an expand/contract sequence: deploy code that can read the old and new shape, migrate/backfill with observable progress, then remove the old path later. Confirm old and new versions can coexist during rolling rollout, and that queues, caches, and retry behavior do not duplicate side effects. Read `references/migrations.md` and `references/rollback.md` before a stateful release.

## Health and operations

Separate liveness from readiness: readiness must fail when required dependencies are unavailable, while liveness must not restart a process for a temporary downstream outage. Verify graceful shutdown drains requests, stops consumers, closes pools, and respects the termination window. Check structured logs, request IDs, metrics, traces, alert thresholds, secret references by name, and startup config validation.

## Wrong turns and rollback

Do not use a health endpoint that returns 200 while the application cannot serve its critical path, apply a destructive migration before compatible code is live, or hide config errors with defaults. Keep the previous image/artifact, config, feature-flag state, and rollback trigger. Confirm whether rollback can read the current schema and whether queued messages or cache entries need handling.

## Verification

Run tests, static checks, production build, migration dry-run/validation where supported, and a release-like start. Smoke readiness, authentication, one critical read/write, dependency outage, timeout, and graceful termination; then observe logs/metrics on the deployed version.
