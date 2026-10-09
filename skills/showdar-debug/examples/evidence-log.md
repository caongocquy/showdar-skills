# Example evidence log (illustrative only; NOT_RUN)

TASK-008: search shows the previous title immediately after incremental sync.

WHEN: reported symptom occurs after a committed title update, not on a clean query.
DO: discover the repository's existing test command for a fixture that warms the query cache, changes one title, syncs, then queries again. Record that exact command and source revision before running it.

| Experiment | Expected if hypothesis holds | Observed receipt |
| --- | --- | --- |
| Read persisted row/version after sync | Stale row supports write failure | NOT_RUN — no repository fixture attached to this example |
| Bypass only the query cache | New title supports invalidation defect | NOT_RUN |
| Replay with controlled worker ordering | Failure changes with ordering if workers race | NOT_RUN |

PROVE: if executed observations show a new persisted row and old cached response, test invalidating only that key. The original reproducer must pass with the correction and fail without it before claiming confirmed root cause.
FAIL: absent those receipts, cause remains provisional. Do not report “cache invalidation confirmed” from this narrative or install/clear dependencies to mask the symptom.
HANDOFF: actual command/results, revision, sanitized key/version evidence, discarded hypotheses, remaining gaps and owning invalidation surface; no fabricated regression PASS.
