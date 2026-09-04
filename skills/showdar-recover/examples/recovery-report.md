# Example recovery report

Original goal: add cache invalidation after sync.

Durable evidence: the cache-key helper exists and its unit test passes. The sync
path calls the helper, but the integration test still observes zero invalidations.
`README.md` has an unrelated user edit and must remain untouched. No conflict
markers are present; the previous “done” narration is not proof.

Classification:
- Completed-and-proven: cache-key helper and unit test.
- Partial: sync commit path and integration proof.
- Broken: integration expectation currently fails.
- Protected: unrelated README change.

Next safest action: trace the sync commit path, reproduce the integration test,
and inspect the invalidation event boundary before editing. Do not reset or
replay broad history. Completion requires a fresh integration pass.
