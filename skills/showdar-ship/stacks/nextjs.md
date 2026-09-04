# Next.js shipping

## Choose the runtime

Record Next.js version, router, Node version, output mode, hosting target, and whether each route is static, Node/serverless, or edge. Static export removes server runtime features; Node and edge deployments differ in available APIs, startup, streaming, caching, and environment access. Confirm provider support for the exact output mode before treating `next build` as deployable.

## Build-time and runtime configuration

Classify public `NEXT_PUBLIC_*` values and server-only variables. Public values are commonly embedded during build, so changing them after deployment may require rebuilding; server variables must exist in the runtime environment. Inspect route output, middleware/runtime assignments, image/font assets, base path, redirects/headers, and source-map/secret exposure. For App Router, verify server/client boundaries, server actions, and cache/revalidation behavior in the production build.

## Release and smoke

Run the repository's tests, typecheck/lint, and `next build`; start the production artifact with `next start` or the provider-equivalent command. Smoke direct load and client navigation for critical routes, auth/session, API/route handlers, image assets, error/404 paths, and cache invalidation. Check health/readiness, logs, CDN behavior, and the deployed commit/version using `references/post-deploy.md`.

## Wrong turns and caveats

Do not deploy a development server, assume preview environment variables match production, or add `dynamic`/`no-store` merely to force a passing build. React/Next cache APIs, bundlers, edge support, and provider output rules are version-sensitive; verify migration/release notes and retain the previous artifact plus its referenced static assets for rollback.
