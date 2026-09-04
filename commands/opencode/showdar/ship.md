---
description: Verify delivery readiness with Showdar without creating CI or taking unapproved external actions
---
Load and follow `showdar-ship` in delivery verification mode. Inspect the diff, run relevant local checks, and report readiness. Existing CI is read-only; do not create or modify `.github/workflows/**`, deploy, publish, submit to a store, or mutate production unless the user explicitly requests that execution scope.

Request: $ARGUMENTS
