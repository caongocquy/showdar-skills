# Vitest

## Choose the boundary

Use Vitest for fast deterministic unit tests, pure utilities, and module-level integration when the Vite/ESM transform is part of the contract. Move to a browser/component or E2E tool when DOM layout, real navigation, browser APIs, or cross-process behavior is the risk. Keep one test focused on the invariant rather than mirroring every implementation branch.

## Doubles and async

Prefer real modules and in-memory deterministic inputs. Mock only external, nondeterministic, expensive, or unavailable boundaries; do not mock the parser, cache, or adapter whose semantics the test claims to prove. Use `await` on the real promise, fake timers only when time is the boundary, and flush the specific event/barrier rather than sleeping. Reset modules/globals/timers in teardown so environment-dependent imports do not leak across tests.

## Failure modes and verification

Watch for ESM/CJS transform differences, shared singleton state, tests that pass in isolation but fail in parallel, unhandled promise rejections, and fake timers that prevent promise/microtask progress. Run the focused file first, then the affected project command; repeat with the repository's normal worker/concurrency setting when isolation or flake is suspected. Read `references/unit.md`, `references/integration.md`, and `references/test-smells.md` for boundary decisions.
