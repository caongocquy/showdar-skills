---
name: showdar-quality
description: Use when planning QA/QC scenarios, risk coverage, regression scope, compatibility checks, or bug-report evidence.
---

# Showdar Quality

## Purpose

- Decide what should be verified, which risks matter, and what evidence supports acceptance confidence.
- Produce compact QA scenarios, manual test cases, risk matrices, compatibility plans, regression scope, release checklists, or complete bug reports.
- Cover behavior beyond automated tests: exploratory, platform, permission, network, data, accessibility, localization, performance, and recovery quality.
- Use `data/quality-patterns.csv` as a searchable prompt and read `references/qa-guide.md` when a broad verification plan is needed.

## When to use

- QA needs scenarios, manual cases, risk-based coverage, acceptance verification, exploratory charters, or a regression scope.
- A release needs a platform/browser/device matrix, smoke/sanity checklist, or evidence review.
- A requirement needs coverage analysis across happy, negative, boundary, state, offline, concurrency, retry, or idempotency behavior.
- A bug report is incomplete and needs reproducible environment, steps, actual/expected result, evidence, and impact.
- The user asks what to verify, not how to implement an automated test.

## When not to use

- Do not use this to implement unit, integration, component, or E2E tests; use `showdar-test` for automated test-level selection and code changes.
- Do not use this as a code/diff defect review; use `showdar-review`.
- Do not use this as the overall delivery-readiness decision; use `showdar-ship`.
- Do not mutate application source, production data, test environments, tickets, or release infrastructure by default.

## Inputs and assumptions

- Prefer the requirement, acceptance criteria, change diff, release scope, supported platforms, test evidence, environment, and known defects.
- Inspect relevant code, schemas, state models, navigation, permissions, existing tests, feature flags, and build metadata when they define observable behavior.
- Record what was supplied, what was observed, what was executed, and what remains unknown.
- Treat missing environment/device/network details as a coverage gap; do not invent a passing result or reproduction rate.
- Use the smallest useful scenario set. Add a case when it covers a distinct risk, boundary, actor, state, platform, or failure mode.

## Non-negotiable rules

- Start from risk and observable behavior, not from a tool or a desired test count.
- Distinguish planned verification from verification actually executed; showdar-quality does not claim tests ran when they were only planned.
- Do not invent evidence, device results, severity, reproduction rate, business impact, or acceptance.
- Cover must-test risks first and label optional/deferred coverage.
- Include negative, boundary, state-transition, permission, retry, idempotency, offline, and data-integrity checks when the behavior makes them relevant.
- Do not require every combination; explain omitted combinations and choose representative partitions.
- Preserve requirement terminology and trace each scenario to a requirement, risk, change surface, or observed defect.
- If a check belongs inside an automated test, state the boundary and hand implementation to `showdar-test`.

## Workflow

### Phase 1 — define the quality question

- Identify the decision: acceptance, regression confidence, release risk, bug reproduction, compatibility, or exploratory discovery.
- Identify changed behavior, affected actors, state transitions, data, integrations, platforms, and rollback/recovery concerns.
- Separate known evidence from assumptions and list missing environment or requirement inputs.

### Phase 2 — map risks and coverage

- Partition behavior into happy, negative, boundary, alternate, state, concurrency, retry/idempotency, and recovery scenarios.
- Choose an appropriate verification boundary: manual, component, API/integration, native/platform, browser/device, or exploratory.
- Build a risk-based matrix using likelihood, impact, detectability/evidence, and priority; do not inflate low-value cases.
- For web/backend/mobile/desktop, identify platform-specific behavior instead of copying a generic checklist.

### Phase 3 — plan and report evidence

- Produce a compact table with preconditions, trigger/steps, expected result, priority, type, and traceability.
- For regression, separate must-test, high-risk targeted, ordinary targeted, and optional/deferred scope.
- For a bug, record the environment and evidence exactly; use `unknown` or an open question when data is absent.
- State what was verified, what was not run, and what evidence is still required for confidence.

## Decision points

- Use smoke testing for a fast build/install/launch/core-path gate; use sanity testing for a narrow change-focused check after a build or fix.
- Use exploratory testing when the risk is poorly specified or emergent; record a charter, observations, and follow-up cases.
- Use manual verification for visual, accessibility, permission, lifecycle, and exploratory behavior where automation would miss the risk.
- Use an automated-test handoff when deterministic regression should live in code; `showdar-test` chooses and implements the level.
- Use a platform matrix when OS, browser, device class, orientation, permission state, network, or app lifecycle changes behavior.
- Use boundary testing for minimum, maximum, missing, duplicate, expired, and just-outside-valid inputs when those values change the outcome.
- Use severity for user/system impact and priority for execution order; do not conflate either with reproduction rate.

## Stack detection

- Web/Next.js: cover browser matrix, responsive breakpoints, keyboard/accessibility, cookies/storage, cache, server/client boundaries, and runtime configuration.
- Backend/API/Node: cover schema validation, auth roles, timeout/retry, idempotency, concurrency, migrations, compatibility, observability, and data integrity.
- React Native: cover iOS/Android devices, permission states, cold/warm launch, foreground/background, deep links, offline transitions, push, orientation, and low-memory behavior.
- Flutter: cover widget states, rebuild/layout/raster risk, isolates, platform channels, plugin behavior, generated files, and Android/iOS integration.
- iOS/Android: cover supported OS/device range, signing/build flavor, permissions, background behavior, upgrade path, native crashes, and store-relevant configuration.
- Tauri/Electron: cover native command/capability permissions, serialization, packaging, updater artifacts, and macOS/Windows/Linux differences where supported.

## Failure modes

- Producing hundreds of permutations without prioritizing distinct risk.
- Calling a test strategy complete because unit tests exist while permissions, data, platform, or recovery paths are unverified.
- Treating a planned scenario as executed evidence.
- Using arbitrary sleeps, unstable environments, or vague “works” expectations.
- Omitting preconditions, data setup, cleanup, account roles, or state reset.
- Marking a bug non-reproducible without recording attempts, environment, and evidence.
- Copying a generic mobile/browser matrix without mapping it to supported behavior.

## Stop conditions

- Stop a readiness verdict when acceptance criteria, environment, required devices, data setup, or evidence are missing.
- Stop before assigning severity when impact or affected users cannot be supported by evidence.
- Stop before destructive data, production, deployment, or publish actions; this skill plans verification and does not authorize them.
- Stop when the requested work is automated test implementation and hand off the boundary to `showdar-test`.

## Escalation conditions

- Escalate high-impact data loss, authorization, payment, privacy, security, or migration risks immediately with the evidence and affected surface.
- Escalate unsupported OS/browser/device combinations rather than treating them as passed.
- Escalate a blocked environment, missing fixture, unavailable native device, or unreliable test signal.
- Escalate contradictory requirements to `showdar-requirements` when QA cannot derive a stable expected result.

## Verification

- Every scenario has a meaningful expected result, priority, type, and traceability source.
- Critical negative, boundary, state, permission, offline, concurrency, retry, and data-integrity risks are either covered or explicitly deferred.
- Matrix entries are limited to supported platforms and representative partitions.
- Bug reports contain only observed evidence; unknown fields are labelled rather than guessed.
- Distinguish “planned”, “executed”, “passed”, “failed”, and “blocked”; attach commands, logs, screenshots, or device details only when available.
- Re-read the plan for duplicate low-value cases and for gaps hidden by happy-path language.

## Output contract

### Test scenarios

| ID | Scenario | Precondition | Steps/trigger | Expected result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- |
| source or analysis ID | distinct risk/behavior | required state/data | concise action | observable result | P0-P3 or must/high/targeted | manual/automated handoff/exploratory |

### Risk-based matrix

| Area | Risk | Likelihood | Impact | Evidence/coverage | Priority |
| --- | --- | --- | --- | --- | --- |
| changed surface | concrete failure | low/medium/high | low/medium/high | scenario, test, or missing evidence | must/high/deferred |

### Regression scope

- **Must test:** acceptance and safety-critical paths.
- **High-risk regression:** changed boundaries, integrations, permissions, data, state, and platform behavior.
- **Targeted regression:** nearby behavior with plausible causal impact.
- **Optional/deferred:** useful coverage blocked by cost or low risk, with reason.

### Bug report

Include `Title`, `Environment`, `Preconditions`, `Steps`, `Actual`, `Expected`, `Repro rate`, `Evidence`, `Impact/severity`, and `Notes`. Preserve unknowns and do not infer missing evidence.

## Anti-patterns

- “Test everything” without partitions, risk, or an execution order.
- Treating showdar-quality as a replacement for automated test implementation.
- A test case with no expected result or no reproducible setup.
- A severity label based only on how often the reporter saw the issue.
- A release checklist that ignores changed behavior and only repeats build commands.
- Reporting “QA passed” when only a plan was written.
- Adding CI/CD, deployment, production data, or release automation to create evidence.

## Example

**Request:** “Create regression scenarios for OTP login.”

- **Must test:** valid OTP within validity window; invalid OTP; expired OTP; wrong account; lockout/rate limit; resend invalidates or supersedes the prior code according to the requirement.
- **High-risk:** duplicate submit, concurrent verification, app background/foreground, offline during submit, clock skew boundary, localization of errors, and masked destination.
- **Platform matrix:** supported iOS/Android versions, cold and warm launch, permission/network state only where OTP delivery depends on it.
- **Expected evidence:** account fixture, timestamps, API response, UI state, logs/correlation ID, and observed device/browser details.
- **Boundary:** these are QA scenarios. If the user asks to implement deterministic API or UI tests, hand the selected boundary to `showdar-test`.
