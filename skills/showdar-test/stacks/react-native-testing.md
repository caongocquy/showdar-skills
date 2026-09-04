# React Native testing

## Choose the boundary

Use React Native Testing Library/Jest for JavaScript behavior, rendered semantics, navigation state, and provider integration. Use Detox for native lifecycle, permissions, deep links, keyboard, real layout, native modules, and release-like packaging. A component test cannot prove Hermes, JSI/TurboModule, Fabric, Android/iOS configuration, or process-death behavior.

## Rendering and async

Render through the smallest realistic provider/navigation boundary and query by role, label, text, or test ID only when semantics are unavailable. Use `act`, `findBy*`, and explicit event/state barriers for updates; do not sleep or call private component methods. Wait for navigation focus/blur, async data, and animations through the library/native synchronization that represents the contract. Test loading, error, cancellation, stale-response, unmount, and retry paths when lifecycle is involved.

## Doubles and native edges

Mock only external services or native APIs whose semantics are outside the current test, and keep a real integration path for caches, serializers, and native bridge wrappers. Watch for fake timers blocking promises, Reanimated/gesture mocks hiding UI-thread behavior, Metro transform differences, leaked subscriptions, and platform-specific accessibility/permission behavior. Keep fixtures deterministic and reset storage/query caches per test.

## Verification

Run the focused Jest/RN Testing Library test, affected JS suite, and Detox journey for native risk. Repeat with the repository's normal Metro/Hermes configuration and capture device logs for native failures; report platform/architecture coverage that was not run. See `references/integration.md`, `references/e2e.md`, and `references/test-smells.md`.
