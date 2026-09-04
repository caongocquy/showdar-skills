# Rollback readiness

Use this reference to assess rollback safety; do not execute a rollback during
ordinary delivery verification. Record the previous artifact/version/digest,
schema compatibility, feature-flag state, config changes, secret references,
data irreversibility, traffic assumptions, and trigger conditions. Check that
old code can read current data and that a recovery path does not repeat a
migration.

Only an explicitly requested deployment/release-execution task may exercise the
rollback mechanics. Otherwise list the command or external check as unverified
and leave production state unchanged.
