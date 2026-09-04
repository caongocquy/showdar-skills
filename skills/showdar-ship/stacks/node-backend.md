# Node backend delivery verification

Verify the artifact and release-like local runtime by default. Deployment,
traffic changes, and production data operations require an explicit task.

## Artifact and runtime

Record Node version/engine, package-manager lockfile, start command, process model, image/base runtime, port, and environment names. Verify the production artifact contains the intended source/generated files and no development-only dependency or secret. Test with the same module mode, CPU architecture, TLS/CA setup, and resource limits as the target; a passing local dev server is not runtime parity.

## Data compatibility assessment

Classify migrations as additive, backfill, lock-heavy, destructive, or
irreversible. Assess an expand/contract sequence: compatible readers/writers,
observable backfill, then removal after old consumers are gone. Confirm old and
new versions can coexist and that queues, caches, and retries do not duplicate
side effects. Read `references/migrations.md` and `references/rollback.md`
without applying production changes.

## Health and operations

Separate liveness from readiness: readiness must fail when required dependencies are unavailable, while liveness must not restart a process for a temporary downstream outage. Verify graceful shutdown drains requests, stops consumers, closes pools, and respects the termination window. Check structured logs, request IDs, metrics, traces, alert thresholds, secret references by name, and startup config validation.

## Wrong turns and rollback

Do not use a health endpoint that returns 200 while the application cannot
serve its critical path, hide config errors with defaults, or claim rollback
safety without checking schema compatibility. Record prior artifact/config,
feature-flag state, rollback trigger, queued-message handling, and any
execution-only checks as unverified.

## Verification

Run tests, static checks, production build, migration dry-run/validation where
supported, and a release-like local start. Smoke readiness, authentication, one
critical read/write, dependency outage, timeout, and graceful termination.
Observe a deployed version only when explicit deployment verification was
requested.
