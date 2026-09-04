# Web/static web delivery verification

Use this as a local readiness checklist by default. Do not publish the artifact
or change hosting/CDN configuration unless the request explicitly asks for that
execution.

## Choose the delivery model

Identify whether the artifact is static HTML/assets, a Node server, or an edge runtime. A static export cannot read a new server environment variable after build and has no server health endpoint; a Node/edge deployment has startup, runtime API, and scaling constraints. Record framework version, build command, output directory, hosting target, public base path, and the exact artifact or commit being promoted. Use `stacks/nextjs.md` for Next-specific rendering/cache behavior.

## Build and configuration

Run the production build from a clean dependency install and inspect the output for source maps, routes, asset URLs, redirects, headers, and accidental secret values. Classify every environment variable as build-time public configuration or runtime private configuration. Verify base URL, trailing-slash, locale, image/font handling, CSP, and cache headers against the target CDN; a successful local preview does not prove the deployed path works.

## Artifact and local smoke

Inspect the immutable artifact and record its digest/version for handoff; do
not publish it by default. Smoke a local production preview or equivalent:
homepage, authenticated/critical route, 404/error path, assets,
redirect/HTTPS behavior, and API origin if present. Check CDN invalidation or
cache freshness only when the task explicitly concerns delivery execution. Use
`references/release-readiness.md` for local evidence; use
`references/post-deploy.md` only for explicit external verification.

## Wrong turns and edge cases

Do not call a static upload “healthy” because files exist, bake secrets into client bundles, or rely on a dev server to validate production routing. Watch for SPA fallback differences, stale service workers, immutable asset naming, edge-incompatible Node APIs, preview/prod environment drift, and rollback that requires restoring both HTML and referenced assets.

## Verification

Run the repository's test/typecheck/build commands, inspect the actual artifact,
and smoke the local production preview from a clean browser/session. A
deployed URL is not required for ordinary readiness. Record provider, DNS, CDN,
analytics, and monitoring checks as external/unverified unless explicitly
requested.
