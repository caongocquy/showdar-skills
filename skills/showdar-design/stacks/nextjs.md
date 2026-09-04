# Next.js design guidance

Next.js UI must make server/client, cache, loading, error, and metadata boundaries visible.

- Keep client components narrow and use server rendering for static or data presentation when appropriate.
- Co-locate fetching with the owner and state freshness or invalidation explicitly.
- Give route segments meaningful loading and error states whose geometry matches final content.
- Treat URL state, metadata, social previews, and accessible route transitions as product behavior.
- Size responsive images and provide meaningful alt text; do not ship decorative payloads as critical content.
- Test a cold route, client navigation, stale data, invalid data, and narrow viewport.

Version note: check the pinned Next.js and React release notes before relying on cache or routing semantics.
