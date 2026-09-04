# Nuxt design guidance

Nuxt designs must account for SSR hydration, route middleware, server handlers, and data freshness.

- Keep browser-only APIs in client boundaries and make the first render deterministic.
- Key data fetching by route/resource identity and define invalidation instead of duplicate fetches.
- Enforce authorization in server handlers; client middleware is navigation UX, not policy.
- Produce route-specific metadata and verify canonical/social output.
- Give server and route failures actionable error states with retry or safe navigation.

Version note: verify rendering, data, and cache behavior against the pinned Nuxt/Nitro version.
