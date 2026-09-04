---
name: showdar-debug
description: Debug crashes, regressions, build failures, races, networking, memory, and performance issues through evidence-first hypotheses and controlled experiments.
---

# Showdar Debug

## Purpose

- Find and confirm root cause before modifying production behavior.
- Turn logs, stack traces, timing, state, profiler data, and reproduction steps into falsifiable hypotheses.
- Avoid symptom patches that hide defects or create new regressions.
- End with a minimal fix and regression proof when implementation is requested.
- Read `references/hypothesis-driven-debugging.md` for experiment discipline.
- Use `data/failure-patterns.csv` as a hypothesis prompt, never as automatic diagnosis.

## When to use

- Crash, exception, wrong state, intermittent failure, regression, hang, build failure, or unexpected output.
- Performance problem such as jank, latency, memory growth, startup cost, or event-loop/thread blocking.
- Networking/auth/cache bugs where timing or retry behavior is unclear.
- A previous fix did not resolve the symptom and root cause needs re-evaluation.

## When not to use

- Root cause and fix are already proven and only implementation remains.
- The user asks only for architecture understanding or code review.
- A live production incident requires external observability tools unavailable here; use this skill to structure evidence but do not invent telemetry.
- Do not run destructive cleanup commands merely to “see if it helps”.

## Inputs and assumptions

- Exact symptom, expected behavior, environment/platform, and any available error/log/stack trace.
- Reproduction steps or a path to create a deterministic reproducer.
- Repository/build context; `scripts/collect-context.mjs` may collect read-only stack/git/runtime signals.
- Sensitive logs must be redacted before output.
- A hypothesis is not a conclusion until an experiment distinguishes it from alternatives.

## Non-negotiable rules

- Do not edit production code before collecting enough evidence to state at least one falsifiable hypothesis.
- Start from the first causal error/event, not the final cascade message.
- Change one variable per diagnostic experiment when practical.
- Preserve logs/profiler/test evidence that confirms or falsifies each hypothesis.
- Reject contradicted hypotheses instead of adding patches around them.
- Cache deletion, dependency reinstall, clean build, and reboot are experiments only when they test a cache/environment hypothesis.
- Never log or expose credentials/tokens/full sensitive payloads.
- For performance, measure a named path before claiming improvement.

## Workflow

### Phase 1 — reproduce and bound
- Write the shortest reliable reproduction, environment, expected result, and actual result.
- Determine whether failure is deterministic, timing-dependent, data-dependent, platform-specific, or release-only.
- Reduce unrelated variables without changing the failing invariant.

### Phase 2 — gather evidence
- Capture stack/error, relevant logs, request/state timeline, failing build task, profiler/thread/memory evidence as appropriate.
- Inspect recent relevant diff/version/environment changes.
- Collect context with `scripts/collect-context.mjs` when useful.

### Phase 3 — classify
- Classify into state/lifecycle, async/race, network/auth/cache, build/toolchain, memory/resource, performance/thread, persistence/data, or contract/serialization.
- Read the relevant reference file before designing experiments.

### Phase 4 — hypotheses
- List 2–4 ranked hypotheses with supporting and contradicting evidence.
- For each, define a cheap experiment and predicted result.
- Prefer experiments that distinguish multiple hypotheses at once.

### Phase 5 — experiment
- Run one controlled experiment.
- Record result and update hypothesis ranking.
- Repeat until one root cause is confirmed or evidence forces escalation.

### Phase 6 — regression proof
- Create the lowest-level automated test/scenario that fails for the confirmed defect.
- Confirm failure is due to the root cause, not fixture/test error.

### Phase 7 — minimal fix
- Patch the true owner/boundary.
- Avoid unrelated cleanup and symptom-level guards.
- Re-run regression and relevant broader verification.

### Phase 8 — close evidence loop
- For performance/memory, re-measure the original path/scenario.
- For build/platform, rebuild the actual affected target/configuration.
- Summarize evidence, root cause, fix, and verification.

## Decision points

- Intermittent? Focus on ordering, lifecycle, shared mutable state, retries, and environment timing.
- Only after incremental action? Investigate invalidation/cache/state transition.
- Only release build? Inspect optimization/minification/signing/config/runtime differences.
- Build error? Use first failing task and toolchain versions; read `references/build-failures.md`.
- Memory grows per repeated flow? Read `references/memory.md` and inspect retained ownership.
- Jank/latency? Read `references/performance.md` and classify thread/I/O/render/image/query cost.
- Auth/network? Read `references/networking.md`; distinguish transport, HTTP, session refresh, cache, and ordering.
- Async/lifecycle? Read `references/async-races.md`.
- Runtime/state/lifecycle/navigation? Start with the matching `category` row in `data/failure-patterns.csv` and collect its named signals before adding guards.
- Persistence/database/cache? Capture keys, transaction boundaries, query count, and durable state; do not use cache clearing as diagnosis.
- Native crash or platform-only failure? Capture symbolicated device logs, variant/toolchain, native boundary, and release artifact evidence.

## Stack detection

- React Native: `stacks/react-native.md` for JS/UI/native boundaries, lists, images, navigation.
- Flutter: `stacks/flutter.md` for Dart async, rebuild/layout, raster/UI thread, platform channels.
- Node: `stacks/node.md` for event-loop, promise/resource/stream/process boundaries.
- Next.js: `stacks/nextjs.md` for server/client/cache/hydration/build/runtime boundaries.
- iOS: `stacks/ios.md` for crash/build/signing/lifecycle differences.
- Android: `stacks/android.md` for Logcat/Gradle/variant/lifecycle/R8 differences.

## Failure modes

- Optional chaining/null guards added without explaining why value is unexpectedly absent.
- Random package/cache clean succeeds once but root cause remains unknown.
- Multiple changes per experiment make evidence uninterpretable.
- Debug logging changes timing and is mistaken for a fix.
- Mock-based test cannot reproduce the real boundary failure.
- Performance “fix” is judged by feel instead of measurement.
- Last error line is treated as root cause while earlier failure is ignored.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when root cause is confirmed by discriminating evidence and the requested fix/verification is complete.
- Stop earlier if available evidence cannot distinguish remaining hypotheses; report exactly what evidence is missing.

## Escalation conditions

- Ask for device/runtime logs or reproduction data when the failure cannot be observed from repository state.
- Escalate hardware/OS/service incidents that require unavailable telemetry instead of fabricating diagnosis.
- Escalate destructive data recovery or credential changes.
- If the problem expands into independent failures, split them and debug one causal path at a time.

## Verification

- Reproduce original symptom before fix where feasible.
- Confirm regression test/scenario fails without the causal fix and passes with it.
- Run relevant suite/typecheck/build/platform target after the narrow proof.
- Re-measure performance/memory path when that was the symptom.
- Verify diagnostic logs do not leak secrets and remove temporary noisy instrumentation unless intentionally retained.
- State any environment/platform not verified.

## Output contract

- **Symptom and reproduction**.
- **Evidence** — logs/state/timing/build/profiler facts.
- **Hypotheses tested** — prediction and result.
- **Confirmed root cause** — causal explanation, not symptom.
- **Fix** — minimal owning change.
- **Regression proof** — test/scenario.
- **Fresh verification** — commands/measurements and remaining uncertainty.

## Anti-patterns

- “Probably X” immediately followed by code edit.
- Retry/debounce/cache clear as a universal fix.
- Swallowing error to make UI/build appear healthy.
- Reinstalling everything without an environment hypothesis.
- Measuring only after the fix.
- Claiming root cause from correlation with one log line.
- Keeping multiple contradictory hypotheses alive after falsification.

## Example

Observation: query result becomes stale only after incremental sync.
- Evidence: clean index correct; bypass cache correct; cached path stale.
- Hypothesis: sync fails to invalidate affected query key.
- Experiment: instrument key/version and bypass/invalidate only that key.
- Result confirms invalidation path; add regression test that sync updates cached query result.
- Patch invalidation owner and verify broader query suite.
- See `examples/evidence-log.md`.
