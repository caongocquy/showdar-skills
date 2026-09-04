# Detox

## Boundary and suitability

Use Detox for React Native journeys whose risk is native lifecycle, navigation, permissions, keyboard, deep links, real networking, or release-like packaging. Keep pure reducer/component behavior in Jest/React Native Testing Library; do not turn every JavaScript branch into a device journey.

## Synchronization and setup

Detox relies on app idling/resource synchronization. Drive the app to a known state with deterministic fixtures, launch arguments, deep links, or a test-only reset boundary. Use stable accessibility labels/test IDs only where semantic queries are unavailable or ambiguous. Wait for visible state/idle conditions and explicit native events; never add `sleep` to mask an unsatisfied synchronization contract. Control permissions, animations, network, and clock at the actual nondeterministic boundary.

## Failure modes and verification

Watch for infinite timers, animations, background tasks, image/network requests, native modules, and dev-server dependencies that keep the app busy or make it look idle too soon. Run the same debug/release-like build and architecture relevant to the issue, capture device logs/artifacts, and distinguish app crash from Detox synchronization failure. Keep failed screenshots/logs and rerun the focused journey before the full device suite; use retries only as diagnostic evidence, never as flake removal. See `references/e2e.md` and `references/test-smells.md`.
