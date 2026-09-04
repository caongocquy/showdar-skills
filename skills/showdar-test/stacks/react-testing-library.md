# React Testing Library

## Boundary and setup

Use React Testing Library for component behavior, accessibility, state transitions, and provider integration that can run in a deterministic DOM environment. Render through the smallest realistic provider boundary: include router/query/auth providers when their behavior is part of the invariant, but do not mount the entire application for every unit case. Use `screen` queries by role, label, or visible text and drive user events, not component instances.

## Async and assertions

Await user interactions and use `findBy*`/`waitFor` for observable state transitions. Assert loading, success, error, focus, accessible name, navigation, and important side effects; also assert that stale/aborted data does not overwrite current UI when that is the risk. Mock only network or external services when their semantics are outside the test, and keep a real cache/data-provider integration path. Do not use arbitrary sleeps or snapshots as the only behavior proof.

## Failure modes and verification

Watch for missing `act`, over-broad providers, leaked query caches, ambiguous queries, fake timers that block transitions, and tests that pass because a mock bypassed validation/cache behavior. Use a deterministic server/fixture boundary, clear state per test, and run the focused component test followed by the affected suite. Read `references/integration.md`, `references/e2e.md`, and `references/test-smells.md` when deciding whether the browser boundary belongs elsewhere.
