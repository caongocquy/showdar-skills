# Web/static web shipping

## Choose the delivery model

Identify whether the artifact is static HTML/assets, a Node server, or an edge runtime. A static export cannot read a new server environment variable after build and has no server health endpoint; a Node/edge deployment has startup, runtime API, and scaling constraints. Record framework version, build command, output directory, hosting target, public base path, and the exact artifact or commit being promoted. Use `stacks/nextjs.md` for Next-specific rendering/cache behavior.

## Build and configuration

Run the production build from a clean dependency install and inspect the output for source maps, routes, asset URLs, redirects, headers, and accidental secret values. Classify every environment variable as build-time public configuration or runtime private configuration. Verify base URL, trailing-slash, locale, image/font handling, CSP, and cache headers against the target CDN; a successful local preview does not prove the deployed path works.

## Release and smoke

Publish the immutable artifact, record its digest/version, then check the deployed URL directly. Smoke the homepage, authenticated/critical route, 404/error path, asset loading, redirect/HTTPS behavior, and API origin if present. Check CDN invalidation or cache freshness only for assets/routes that changed. Read `references/release-readiness.md` and `references/post-deploy.md` for shared evidence and observation requirements.

## Wrong turns and edge cases

Do not call a static upload “healthy” because files exist, bake secrets into client bundles, or rely on a dev server to validate production routing. Watch for SPA fallback differences, stale service workers, immutable asset naming, edge-incompatible Node APIs, preview/prod environment drift, and rollback that requires restoring both HTML and referenced assets.

## Verification

Run the repository's test/typecheck/build commands, inspect the actual artifact, and smoke the deployed URL from a clean browser/session. Record which provider, DNS, CDN, analytics, and monitoring checks were unavailable rather than inferring them from build success.
