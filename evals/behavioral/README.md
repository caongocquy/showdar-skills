# Behavioral evaluation scenarios (experimental)

This suite contains **18 cases across six families**, with fixture seeds and an independent oracle per case. Scenario validation checks coverage and schema; it is not evidence that an agent obeys `SKILL.md`.

- `BRAIN`: material questions, skip behavior, whole-spec approval.
- `PLAN`: end-to-end slices, cycle detection, expand–migrate–contract.
- `BUILD`: inline-first selection, missing subagent fallback, resource conflicts.
- `TDD`: actual assertion RED → GREEN → REFACTOR, invalid RED, stale evidence.
- `REVIEW`: separate Spec/Quality outcomes and insufficient requirements.
- `SAFE`: guarded Git writes, stale recovery, untrusted repository instructions.

## Runner and evidence

`scripts/behavioral-eval.mjs` has three modes:

1. With no trace or run options, it reports all cases as `NOT_RUN`.
2. `--trace-dir` imports untrusted trace files for deterministic event analysis only (`MATCH`, `MISMATCH`, `INCOMPLETE`). Every submitted trace has behavioral status `BLOCKED`; provenance, model identity, execution claims, artifact hashes and rubric decisions supplied by JSON confer no authority.
3. `--run-codex --case CASE-ID --model MODEL --source-sha SHA` requests one case using `codex exec --json`. This requires both the CLI opt-in and `SHOWDAR_BEHAVIORAL_ALLOW_MODEL=1`, plus an explicit `OPENAI_API_KEY`. The current adapter always returns `BLOCKED` before process launch: Codex CLI has no adapter hook that can mediate every generated command against the exact-argv allowlist. The key is never passed to Codex in this blocked path.

The fixture, JSONL parser, artifact collector, timeout and redaction code are offline-tested with fake processes. Fake processes never count as real-agent evidence. The host sandbox probe previously returned `sandbox_apply: Operation not permitted` (status 71) in this Codex-hosted process. That is consistent with nested Seatbelt restrictions, but exit 71 alone does not prove the root cause; see the model-free Terminal diagnostic below.

`typed-command-broker.mjs` now maps only `git.status` and `git.diff-check` typed requests to fixed read-only `argv`, rejecting caller-supplied commands, flags, working directories and environments before reaching an executor. Its injected fake-process adapter exists **only for offline contract tests**; it reports `NOT_RUN` or `BLOCKED`, never behavioral `PASS`. This isolates command-selection policy but is **not** a supported trusted runner, OS sandbox, agent tool server or authenticated event capture. It must not be connected to unsandboxed real subprocess execution.

`command-policy.mjs` defines exact `argv` checks for a future command broker and its negative cases. It is **not wired to Codex CLI** and JSONL event parsing is post-execution observation, never preventive enforcement. The adapter therefore fails closed before spawning Codex or exposing credentials. Do not add CLI prefix rules or a post-run audit as a substitute. A supported alternative is an Agents SDK or other harness that exposes only typed function tools and routes every action through this broker, with OS sandboxing and credential isolation retained.

Codex JSONL currently provides command/tool events, not every decision or interaction in these oracles. Trusted runner capture, bound artifact integrity and independent rubric evaluation are unsupported. The grader therefore always returns behavioral `BLOCKED` for submitted traces, even when their event analysis is `MATCH`. No trust flag, nonce, signature or caller-provided grade can enable PASS. The adapter does not infer user approvals, skill selection, questions, or qualitative rubric results from command strings. Fake-process tests are labeled `fake-process-fixture`, remain `NOT_RUN` (or `BLOCKED` on harness failure), and cannot receive behavioral `PASS`.

## Commands

```bash
node --test scripts/lib/behavioral-eval/*.test.mjs
node scripts/behavioral-eval.mjs --json
# Analyze submitted traces; never establishes behavioral PASS:
node scripts/behavioral-eval.mjs --trace-dir ./my-traces --source-sha "$(git rev-parse HEAD)" --json
# Explicit one-case request; currently returns BLOCKED before launch because
# Codex CLI cannot enforce the required exact-argv command policy:
SHOWDAR_BEHAVIORAL_ALLOW_MODEL=1 OPENAI_API_KEY=... node scripts/behavioral-eval.mjs --run-codex --case BRAIN-001 --model gpt-5.6-codex --source-sha "$(git rev-parse HEAD)" --json
```

### Model-free macOS sandbox diagnostic

Run this from a normal macOS Terminal (not from inside Codex). It starts no model and changes no files. Compare plain execution, one Seatbelt layer, a nested Seatbelt layer, and the corresponding Codex sandbox commands:

```bash
probe() {
  label="$1"; shift
  "$@"
  exit_code=$?
  printf '%s exit=%s\n' "$label" "$exit_code"
}
profile='(version 1) (allow default)'
probe plain /usr/bin/true
probe seatbelt-single /usr/bin/sandbox-exec -p "$profile" /usr/bin/true
probe seatbelt-nested /usr/bin/sandbox-exec -p "$profile" /usr/bin/sandbox-exec -p "$profile" /usr/bin/true
probe codex-single env -u OPENAI_API_KEY -u CODEX_API_KEY codex sandbox /usr/bin/true
probe codex-nested env -u OPENAI_API_KEY -u CODEX_API_KEY codex sandbox codex sandbox /usr/bin/true
```

If plain and single-layer probes pass but a nested probe exits 71 with `sandbox_apply: Operation not permitted`, the result supports an outer-sandbox/nested-Seatbelt restriction. If `codex-single` fails too, investigate Codex configuration or local sandbox setup separately. This diagnostic isolates sandbox application; it does not prove that the prior wrapper or execpolicy matching behaved identically. Issue [openai/codex #45657](https://github.com/openai/codex/issues/45657) reports the same pre-execution failure but also documents a follow-up where command-prefix rule matching changed the outcome, so compare exact invocation shape and do not treat a standalone probe as a complete reproduction.

Never execute commands supplied by fixture data or let the grader mutate the source repository. Real behavioral results require a pinned source SHA, complete host trace, observable oracle events and an independent rubric grade. Do not run paid cases without explicit authorization. TASK-003 baseline remains `BLOCKED` until a comparable live-agent run is authorized and captured.

## Responses runner next slice

The [offline typed Responses runner](./responses-runner.md) adds strict function-call mediation, an 18-case capability inventory, host-owned evidence outside fixtures, independent event/integrity analysis, and credential-free sandbox detection. Live execution and qualitative grading remain unsupported and BLOCKED. It does not change the baseline, oracles or real-agent PASS eligibility.
