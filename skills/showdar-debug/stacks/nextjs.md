# Next.js debugging

## Apply when

Use this guide for App Router or Pages Router failures involving rendering, routing, data fetching, server actions/route handlers, deployment, or hydration. Name the Next.js version and router because cache and server/client APIs are version-sensitive.

## Architecture and evidence

Locate the execution boundary first: server component, client component, route handler, server action, middleware, edge runtime, or browser. Record route, params, headers/cookies class, build mode, runtime, and whether the failure occurs during `next build`, server startup, request handling, or client hydration. For stale data, distinguish the Data Cache, Full Route Cache, client/router cache, and application cache; capture the key, revalidation policy, tag/path invalidation, and response timestamp.

## Investigation

Compare a static/build-time failure with `next build`, a production request with `next start`, and a client navigation against a fresh load. Inspect server logs and browser console separately. For hydration mismatches compare server HTML with the first client render and look for time, locale, random IDs, browser-only APIs, or different data snapshots. For async races, trace request IDs across server action/API and client transitions. Read `references/async-races.md` and `references/build-failures.md` when those boundaries are involved.

## Wrong turns and edge cases

Do not add `use client`, `dynamic(..., { ssr: false })`, `no-store`, or cache invalidation as a blanket fix. These change execution, caching, or SEO semantics. Environment variables exposed to the browser are build-time inputs in many deployments; changing a runtime secret may not change an already-built client bundle. Check redirects, middleware, streaming/Suspense, error boundaries, and edge restrictions before blaming React.

## Verification

Run `next build` and the production server path when the issue is release-only. Smoke the affected route by direct load and client navigation, assert cache freshness after the intended invalidation, and verify the target runtime has the required Node/edge APIs.
