# React upgrades

## Compatibility surface

Record current/target React and React DOM, renderer/test packages, Node, bundler/framework, TypeScript types, peer dependencies, and lockfile. Keep React/React DOM/types paired according to the target release and check libraries that depend on renderer internals or legacy context. A successful resolver does not prove that concurrent rendering, server components, or the chosen framework remains supported.

## Breaking and migration work

Read the target React release/migration notes, then search for deprecated lifecycle APIs, string refs, legacy context, unsafe effects, `findDOMNode`, event assumptions, hydration behavior, and library-specific peer warnings. Separate codemods from manual state/effect changes and from framework/server-client migration. Test Strict Mode and production behavior when development-only double invocation or scheduling exposes a lifecycle defect.

## Sequence and rollback

Upgrade React pairing and types first when supported, apply codemods only to owned code, then update renderer/framework integrations and remove deprecated usage. Keep the previous manifest/lockfile and buildable artifact; do not silence peer warnings or force resolution without identifying the owner. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

## Verification

Run clean install, typecheck/lint, component/integration tests, production build, and browser smoke. Verify render/state/effect behavior, hydration if applicable, accessibility, error boundaries, Suspense/async paths, and the supported browser/runtime matrix.
