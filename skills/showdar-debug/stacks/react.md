# React debugging

## Apply when

Use this guide for browser React components, shared hooks, and client-side state. First classify the failure as render churn, state ownership, effect synchronization, an event boundary, an async race, or an external system. A similar symptom in a server-rendered app also needs `showdar-debug`'s Next.js guide.

## Architecture and evidence

Capture the component tree, props/state identity, effect dependencies, render count, browser console, network timeline, and the exact user action. A render loop is not the same as a state synchronization loop: record which setter runs, which value changes identity, and whether Strict Mode is exposing a non-idempotent effect in development. For context or external stores, inspect provider scope, selector granularity, subscription cleanup, and cache keys rather than only the final value.

## Investigation

Reproduce a fresh mount, prop update, navigation/unmount, and retry path. Use React DevTools Profiler to compare commits and highlight the owner of avoidable renders; use browser performance/network traces for work outside React. For async data, assign an operation ID and test slow, cancelled, and out-of-order responses. Read `references/async-races.md` when completion ordering is relevant.

## Wrong turns and edge cases

Do not silence an effect dependency warning, add broad memoization, or move state upward until the synchronization invariant is explicit. `useMemo`/`useCallback` can hide identity churn without fixing an unstable external input. Watch for stale closures, controlled/uncontrolled transitions, portal ownership, Suspense fallback remounts, and dev-only Strict Mode double invocation.

## Verification

Run the repository's lint/typecheck/test command, then reproduce the original interaction with Profiler/console clean. Verify mount, update, unmount, error, and slow-network paths; compare production mode when the symptom may depend on development-only behavior.
