# Svelte design guidance

Svelte interfaces should make reactive ownership, lifecycle cleanup, and server/client boundaries explicit.

- Derive display values rather than mutating shared module state from unrelated components.
- Use effects for external synchronization and clean up timers, listeners, and subscriptions.
- Use keyed each blocks by domain identity and virtualize genuinely large collections.
- Preserve semantic HTML and verify compiler accessibility warnings with user behavior tests.
- Represent pending, failure, cancellation, and stale-result states instead of relying on a spinner.

Version note: check the pinned Svelte and SvelteKit version for runes, SSR, and routing behavior.
