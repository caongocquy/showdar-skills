# Tight hypothesis-driven feedback loop

## WHEN

Use when the reported symptom lacks a confirmed cause, especially after a failed fix. Read the request, environment and recent relevant diff. Start with one command/fixture/script that repeats the actual symptom safely; minimize latency and unrelated setup without changing the failing invariant.

## DO

| Available observation | First effective seam | Required signal |
| --- | --- | --- |
| Existing unit/integration failure | Narrow existing test or minimal fixture | Actual reported assertion/state, not only a test-loader failure |
| HTTP/API defect | Repository-supported HTTP CLI against authorized local fixture | Request, status and redacted response/state |
| UI/device defect | Existing browser automation or device harness | User action and visible state; unavailable device is a gap |
| Recorded event failure | Replay sanitized trace through the real boundary | Same ordering/state and symptom |
| Input-dependent rule | Reduced input, then existing property/fuzz tooling when useful | Reproducible input/seed and invariant |
| Known regression window | Safe regression bisection in isolated revisions when authorized | Same command/environment across revisions; preserve dirty checkout |
| Production-only or unsafe action | Available read-only logs/context | Attempted checks and missing access; provisional diagnosis |

Record expected versus observed output, command, source revision, fixture/seed and environment. Name 2–4 competing hypotheses only as evidence warrants; each predicts: if H is true, change X and Y should change while Z stays constant. Run the cheapest discriminating experiment, change one variable where practical, and retain supporting/contradicting observations. Discard falsified hypotheses.

## PROVE

Confirm cause when controlled change at the owning boundary restores the original invariant and regression proof fails without the causal correction. Re-run the original reproducer after the minimal fix; a different green test is insufficient. For performance, compare the same path/workload and metric before/after. Redact credentials, tokens and sensitive payloads in traces/reports.

## FAIL

Syntax, dependency, sandbox, device or network failures are environment/harness evidence, not the application's assertion failure. If the symptom cannot be reproduced, report what ran and what access/input is missing; do not assert certainty. After two experiments without new signal, reduce the case or switch the observation seam. Budget/safety exhaustion stops with a provisional diagnosis and a specific next experiment. Cache deletion/reinstall is permitted only as an authorized bounded test of a stated environment hypothesis, not a universal fix.

## HANDOFF

Send Debug/Build the task/spec/plan revision, reproducer and expected/observed output, tested predictions, confirmed versus provisional cause, minimal owning surface, regression command/results and missing evidence. Build owns implementation receipts; product/architecture changes return to Plan/Brainstorm. No evidence grants extra mutation authority.
