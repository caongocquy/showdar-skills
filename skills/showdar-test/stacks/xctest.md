# XCTest

## Choose the boundary

Use XCTest unit tests for pure Swift policy and async transformations, target/integration tests for persistence, networking, dependency injection, and native framework boundaries, and XCUITest for critical user journeys, permissions, deep links, and lifecycle. Keep UI tests small; they are not a substitute for deterministic model tests.

## Async and platform setup

Use structured concurrency, async test methods, expectations, or notification/predicate waits tied to a real event. Do not sleep to wait for a network, animation, or actor. Assert user-visible/accessibility outcomes and durable effects, not private view hierarchy details. Select the affected scheme/target, deployment target, simulator/device, locale, and permissions explicitly; reset keychain/files/database state at the owner boundary.

## Failure modes and verification

Watch for expectations fulfilled twice, main-actor violations, unstructured tasks outliving the test, shared simulator state, animation timing, network dependence, and tests that pass on simulator but fail with device entitlements or hardware. Run the focused XCTest/XCUITest scheme, then the normal test plan; collect diagnostics/screenshots and record simulator/device, OS, and signing limitations. Read `references/integration.md`, `references/e2e.md`, and `references/test-smells.md`.
