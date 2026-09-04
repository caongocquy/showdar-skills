# Production migrations

Classify migrations as additive/backward-compatible, lock-heavy, backfill, destructive, or irreversible. Prefer expand/migrate/contract for rolling systems: add compatible shape, deploy readers/writers, backfill with observable progress, then contract after the old version is gone. Define lock/timeout, retry, idempotency, ordering, rollback compatibility, and abort trigger. Production data mutation requires explicit approval and backup/recovery evidence.
