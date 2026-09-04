# Jest

## Choose the boundary

Use Jest for unit/module tests and framework integrations already supported by the repository's preset. Select `node`, `jsdom`, or the React Native preset deliberately; the environment changes globals, timers, module resolution, and native shims. Use integration tests for real persistence/HTTP/cache behavior and Detox or another E2E tool for native lifecycle, permissions, and device rendering.

## Doubles and lifecycle

Avoid webs of `jest.mock`; mock only external or nondeterministic boundaries and keep one real path for the contract under test. Reset/restore spies, mocks, fake timers, module registry, and global state in the owning teardown. Await user/data promises and use `act`/library async helpers for React updates. In React Native assert visible behavior and navigation/state effects, not instance methods or private component fields.

## Failure modes and verification

Watch for hoisted module mocks, stale singleton modules, fake timers that leave promises pending, `jsdom` behavior that differs from native, and tests that depend on file/order or worker state. Do not fix flakes with retries or a larger timeout before finding the leaked resource or missing barrier. Run the focused test, affected Jest project/preset, then the normal parallel suite; rerun the failed file in band when diagnosing isolation, not as the final proof. See `references/unit.md`, `references/integration.md`, and `references/test-smells.md`.
