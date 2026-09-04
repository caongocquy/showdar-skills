# Rollback

A rollback is an executable path, not “redeploy previous”. Record previous artifact/version/digest, schema compatibility, feature-flag state, config changes, secret references, data irreversibility, traffic state, and trigger conditions. Check that old code can read current data and that rollback does not repeat a migration. Exercise the mechanics for high-risk releases when feasible; otherwise list the unverified step.
