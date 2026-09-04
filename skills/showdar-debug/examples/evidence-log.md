# Example evidence log

Request: search shows the previous title immediately after an incremental sync.

Observation: the bug reproduces only after sync; a clean process is correct.
Evidence: bypassing the query cache returns the new title, and the database row
has the new version. The stale response has the old cache version.

Hypotheses:
1. The index write is stale.
2. The query cache is not invalidated for the changed document.
3. Two sync workers race and restore the old value.

Experiment: log document ID, cache key, source version, and worker ID; then
invalidate only the affected key after the commit. The stale result disappears,
and reverting invalidation makes the regression test fail again.

Conclusion: cache invalidation is the confirmed root cause. Record the failed
hypotheses and add a regression test before making the minimal production fix.
