# Playwright

## Boundary and suitability

Use Playwright for critical browser journeys, cross-page/session behavior, real routing, browser APIs, and integration risk that lower-level tests cannot prove. Keep business-rule matrices in unit/component tests. Choose the target browsers/projects intentionally and record whether the risk is Chromium-only, cross-browser, mobile viewport, or server/runtime behavior.

## Deterministic flow

Seed isolated data and authenticate through a supported fixture/API boundary rather than clicking a long setup path in every test. Prefer role/label/test-id locators with stable semantics, user-visible assertions, and explicit `expect` retries. Use `waitForResponse`/network assertions only when the protocol is the contract; otherwise wait for the rendered state. Capture trace/video/screenshot on failure and isolate accounts, files, and storage per worker.

## Failure modes and verification

Avoid arbitrary sleeps, CSS selectors tied to styling, shared mutable users, blanket retries, and tests that pass against mocked responses while the real app wiring is broken. Watch for service-worker/cache pollution, missing web-server readiness, timezone/locale drift, popup/download cleanup, and parallel port collisions. Run the focused project with its normal web server, then the affected browser matrix; use trace evidence to classify product failure versus test/environment flake. See `references/e2e.md` and `references/test-smells.md`.
