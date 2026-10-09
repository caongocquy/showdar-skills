# Responses runner offline slice

This is an offline Responses API function-call contract, not a verified live runner.
The loop follows the official [function calling guide](https://developers.openai.com/api/docs/guides/function-calling): strict custom function schemas, `function_call` arguments and `function_call_output` items, accumulated response items, `store:false`, and serial tool dispatch. No shell, web, MCP, browser, package installer or arbitrary executable is exposed. `runOfflineResponses` accepts only explicitly named fake transports. The live entry point unconditionally blocks; it does not perform API requests or credential handoff.

## Minimum typed boundary

| Tool | Arguments | Preventive mediation |
| --- | --- | --- |
| `git_status` | Empty object | Existing broker maps to exact `/usr/bin/git status --short --branch`; shell false |
| `git_diff_check` | Empty object | Existing broker maps to exact `/usr/bin/git diff --check`; shell false |
| `fixture_read` | `path` | Exact named seed file only; no arbitrary path, environment or executable |
| `artifact_write` | `path`, `content` | Exact scenario rubric artifact path only; 64 KiB maximum; no source writes |

These capabilities cover the first offline tool loop; they do **not** make any scenario fully executable. Skill/reference reads, source edits, test execution, guard responses and human interaction need separately mediated capabilities. They remain unsupported rather than being simulated as successful real actions.

## Audit of the frozen 18 cases

All original definitions, fixtures and independent oracles are unchanged. The machine-readable inventory is `auditCapabilities(suite)` in `scripts/lib/behavioral-eval/scenario-capabilities.mjs`. Each required event identity remains unsupported for real observation in this slice, even where a tool event has the same broad kind. A model declaration is a claim, not proof that a skill, approval, test, subagent or review actually ran.

| Case | Required oracle events | Remaining capability / independent proof |
| --- | --- | --- |
| BRAIN-001 | route: skill_selected, skip: decision_recorded | Skill selection, material question/decision/approval interaction and whole-brief review |
| BRAIN-002 | question: question_asked, approval: approval_requested | Skill selection, material question/decision/approval interaction and whole-brief review |
| BRAIN-003 | partial: decision_recorded, request: approval_requested | Skill selection, material question/decision/approval interaction and whole-brief review |
| PLAN-001 | task: task_created, seam: test_boundary_selected, handoff: handoff_recorded | Task/dependency/strategy/handoff extraction and independent plan review |
| PLAN-002 | blocked: status_reported, fix: decision_recorded | Task/dependency/strategy/handoff extraction and independent plan review |
| PLAN-003 | strategy: decision_recorded, expand: task_created, migrate: task_created, contract: task_created | Task/dependency/strategy/handoff extraction and independent plan review |
| BUILD-001 | inline: executor_selected, verify: verification_observed | Executor capability, source editing and fixed test checks; independent implementation review |
| BUILD-002 | fallback: executor_selected, limitation: status_reported | Executor capability, source editing and fixed test checks; independent implementation review |
| BUILD-003 | serial: executor_selected, overlap: decision_recorded | Executor capability, source editing and fixed test checks; independent implementation review |
| TDD-001 | seam: test_boundary_selected, red: verification_observed, green: verification_observed, refactor: verification_observed | Public seam, assertion-vs-loader classification, test execution/order and revision-bound proof |
| TDD-002 | invalid: status_reported, stop: stop_reported | Public seam, assertion-vs-loader classification, test execution/order and revision-bound proof |
| TDD-003 | stale: status_reported, rerun: tool_invoked | Public seam, assertion-vs-loader classification, test execution/order and revision-bound proof |
| REVIEW-001 | spec: review_verdict, quality: review_verdict | Separate verdict extraction plus independent acceptance/code evidence review |
| REVIEW-002 | spec: review_verdict, quality: review_verdict | Separate verdict extraction plus independent acceptance/code evidence review |
| REVIEW-003 | blocked: review_verdict, quality: review_verdict | Separate verdict extraction plus independent acceptance/code evidence review |
| SAFE-001 | guard: tool_invoked, stop: stop_reported | Observed guard/refusal, authority boundaries and recovery/revision evidence |
| SAFE-002 | unverified: status_reported, handoff: handoff_recorded | Observed guard/refusal, authority boundaries and recovery/revision evidence |
| SAFE-003 | untrusted: decision_recorded, report: status_reported | Observed guard/refusal, authority boundaries and recovery/revision evidence |

## Event and evidence contract

- Model messages remain a separate untrusted transcript. No event-emission tool accepts an agent-authored oracle event, provenance flag or rubric grade.
- After mediation and the fake runtime response, the orchestrator records `tool_invoked` and (for captured artifact bytes) `file_written`, labeled `simulated-runtime`. `MATCH` is deterministic event comparison only. The four tools do not establish stage RED/GREEN, approval, skill selection or quality verdicts.
- The host supplies an existing fixture and a separate evidence directory. Both paths are resolved through `realpath`; nested/identical/symlink aliases are refused before callbacks. Per-run private directories and exclusive files store source/scenario metadata, redacted transcript and captured artifact snapshots outside the fixture.
- Artifact integrity compares independently reread snapshot bytes with their in-memory capture hash. Missing and modified snapshots are explicit. This is offline engineering evidence, not authenticated real execution or independent qualitative rubric PASS.
- All existing rubrics require independent review. Their result remains BLOCKED; agent/runtime-provided scores are ignored. Imported evidence JSON remains untrusted and cannot enable behavioral PASS through the existing grader.
- Credentials are never put in tool schemas, arguments, environment or invocation. Known credentials echoed in arguments are denied before dispatch; function-call arguments are withheld from the transcript, decoded credential values are checked before runtime, and captured transcript/tool outputs are redacted. Docker capability probes receive only PATH. Offline transport callbacks are trusted test code, not a production sandbox.
- Bounds: one serial loop, 1–32 turns, total deadline up to 5 minutes, 64 KiB response/tool-output/artifact limit and bounded response generation. Timeouts stop dispatch; fake callbacks are not an OS process kill boundary. Cancellation/process termination needs verification in the future sandbox runtime.

## Capability detection and pilot boundary

`node scripts/behavioral-eval-responses.mjs --preflight` performs a model-free, credential-free Docker daemon probe. It always reports `verified:false`: a Docker version is not proof of network isolation, restricted mounts, non-root execution, read-only root filesystem, credential exclusion or runtime tool constraints. A missing daemon fails closed. No container is launched or image pulled in this slice.

The future one-case entry command is:

```bash
node scripts/behavioral-eval-responses.mjs --case BRAIN-001 --model "$MODEL" --source-sha 3969d4eb62497a203beaa25fce41ecf8b3c9735a --allow-model
```

**Today this command always returns BLOCKED before any API or tool execution**, even with opt-in or supplied trust/sandbox flags. Do not execute a paid pilot until a separately verified Linux container runtime (network disabled, fixture-only mount, no evidence or credential mount), real Responses transport, runner-owned capture, all required observable events and independent rubric review are implemented and verified, and model spend is explicitly authorized.

TASK-002 remains implemented-incomplete; TASK-003/011 remain BLOCKED with 18 NOT_RUN, 0 PASS. Deterministic fake runs are NOT_RUN (BLOCKED on harness failure) and never behavioral PASS. No measurable skill improvement is claimed.
