# Flutter test

## Choose the boundary

Use pure Dart tests for deterministic policy/parsing, widget tests for build/layout/interaction and provider/Bloc/Cubit state, and `integration_test` for real platform channels, plugins, navigation, permissions, and device lifecycle. Do not use a widget test to claim native integration works.

## Synchronization and doubles

Pump only the frames required by the invariant: `pump`, `pumpAndSettle`, or an explicit frame/event barrier. `pumpAndSettle` can hang or hide an animation/timer leak, so use a bounded explicit pump when the app intentionally remains busy. Control clocks and async work deterministically; inject repositories/services rather than mocking the widget tree. Assert semantics, visible state, error/recovery, and important side effects rather than private widget fields.

## Failure modes and verification

Watch for `BuildContext` used after disposal, provider scope that differs from production, unconstrained `pumpAndSettle`, golden tests that vary by font/renderer, leaked timers/streams, and platform calls replaced by mocks in a test that claims plugin behavior. Run `flutter test` for focused unit/widget cases and the repository's analyzer; use profile/release-like integration coverage for performance or native risk. Read `references/unit.md`, `references/integration.md`, and `references/test-smells.md`.
