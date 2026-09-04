# Migration readiness

Classify migrations as additive/backward-compatible, lock-heavy, backfill,
destructive, or irreversible. For a readiness assessment, inspect the schema
diff, compatibility window, lock/timeout behavior, retry/idempotency, ordering,
rollback compatibility, and abort trigger without mutating production data.

If the task explicitly requests deployment execution, the expand/migrate/contract
sequence may be evaluated: add a compatible shape, run compatible readers and
writers, backfill with observable progress, then contract after old consumers
are gone. Production data mutation still requires explicit approval and
backup/recovery evidence.
