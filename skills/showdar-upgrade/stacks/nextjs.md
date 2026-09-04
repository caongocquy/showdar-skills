# Next.js upgrades

## Compatibility surface

Record current and target Next.js, React/React DOM, Node, package manager, router, output mode, bundler, and deployment runtime. Check peer ranges and provider support as one tuple; a package install does not prove that App Router/Pages Router, Node, serverless, or edge behavior remains supported. Preserve the lockfile and inspect direct/transitive framework packages.

## Breaking and generated surfaces

Read the target release/migration notes, then search for changed routing/data APIs, server/client boundaries, middleware/runtime config, image/font handling, cache/revalidation semantics, server actions, and deprecated config keys. Separate source edits from codemods, generated route/build output, and deployment configuration. For App Router, audit client components and cache invalidation; for Pages Router, audit data functions and fallback/rewrites.

## Migration and rollback

Upgrade React pairing and Next.js in a controlled step when supported; split the change if the target requires a Node/toolchain change or a large template diff. Keep the previous manifest/lockfile and deployable artifact. Do not overwrite custom config or native/provider settings with a template blindly. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/migration-strategy.md`.

## Verification

Run install/lockfile validation, typecheck/lint/tests, `next build`, and `next start` or the provider-equivalent output. Smoke direct load/client navigation, auth, route handlers/server actions, static assets, cache invalidation, error paths, and the supported Node/edge deployment target.
