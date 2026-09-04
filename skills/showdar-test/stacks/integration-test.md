# Flutter integration_test

## Boundary and suitability

Use Flutter `integration_test` for a real app process on a simulator, emulator, or device when correctness depends on platform plugins, channels, navigation, permissions, persistence, lifecycle, or rendering beyond widget tests. Keep pure Dart and widget state at lower levels so device tests remain a small risk-focused set.

## Deterministic setup

Seed isolated accounts/files/databases, launch with explicit test configuration, and reset state at the owner boundary. Use real request/repository/cache/bridge semantics when they are under test; fake only external services whose behavior is not the invariant. Synchronize on app state, frame completion, or an explicit event—not arbitrary sleeps—and control network/clock only when that boundary is the source of nondeterminism. Assert visible outcome plus durable side effect or rollback.

## Failure modes and verification

Watch for permissions left from a previous run, process death/background state, animations and pending timers, device locale/timezone, flaky network fixtures, leaked ports/files, and tests that pass on one platform because a plugin has different native behavior. Run `flutter test integration_test`, capture device logs/screenshots, and repeat failed cases on the supported device/API matrix. Report simulator-only or unavailable physical-device coverage. See `references/integration.md`, `references/e2e.md`, and `references/test-smells.md`.
