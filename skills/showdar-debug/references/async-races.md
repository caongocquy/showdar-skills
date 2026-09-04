# Async and race failures

Look for stale closures/state, cancellation gaps, duplicate requests, out-of-order responses, lifecycle disposal, shared mutable caches, retry duplication, and missing idempotency. Draw an event timeline with operation ID, owner, start, cancellation, completion, and state write. Reproduce with controlled timing barriers or a fake clock rather than random sleeps. Decide whether correctness requires cancellation, sequence/version checks, serialization, a transaction, or idempotency; debounce is only an input-rate policy, not a general race fix.
