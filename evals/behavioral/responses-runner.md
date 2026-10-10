# Responses runner and TASK-002 trust gates

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

## Offline container-backed tool transport (model-free)

The typed broker is now connected to `sandbox-tool-runtime.mjs` for **real tool subprocesses inside Docker**, but **not to a real model**. All requests are authorized again at the host boundary: exact `git.status` / `git.diff-check` argv, scenario-allowed fixture reads, or scenario-allowed rubric artifact writes. The fixed guest dispatcher runs under the hardened Docker profile already used by the isolation probes, with an immutable built-image ID, non-root UID, no network, read-only container root, dropped capabilities and a single writable fixture bind mount. No API key or other host environment is passed into Docker.

The Docker tool image uses `evals/behavioral/Dockerfile.tool-runtime` (pinned Node base, Git installed at CI build time). Its resulting local image ID is checked before invocation; however the added Git package is **not yet reproducibly version-locked or signed**, and an arbitrary supplied image ID is not sufficient to establish release/supply-chain trust. The CI integration test builds this image, runs actual read-only Git commands, fixture reads and artifact writes, and drives the existing offline Responses function-call loop with a deterministic fake model. It also verifies that fake model transcripts remain `NOT_RUN`.

Model-authored JSON flows through a **bounded stdin pipe**, not Docker CLI argv, and cannot specify executables, flags, environment or working directory. The container's artifact path is checked against the scenario's exact whitelist; symlink, traversal, overwrite and oversize attempts are denied. The host requires `sourceSha` to match a separate, clean source checkout before and after each tool call; the source checkout, fixture and evidence directory must be disjoint. It binds that revision into each host receipt. The scenario fixture is independently materialized and is not used as proof of source identity. The host checks resulting artifact bytes, snapshots them under the separate evidence directory (`0600` permissions), and records a host-owned SHA-256 receipt. Agent-writable artifacts are **not** by themselves grading evidence. The disposable fixture may contain host-readable artifact files so the host can capture them across the isolated container UID; evidence files remain host-only.

## Trusted CI provenance and human rubric gate

`.github/workflows/behavioral-evidence-attestation.yml` runs only after the PR verification workflow succeeds. Because it uses `workflow_run`, GitHub loads this attester from the default branch; it creates a model-free evidence envelope bound to the PR head SHA, PR number, completed run ID and payload SHA-256, then attests both files with GitHub Artifact Attestations. The payload explicitly says `behavioralStatus: BLOCKED`; it certifies CI provenance only and is not a model execution trace or behavioral result.

`trusted-evidence.mjs` verifies the output and trace bytes against their SHA-256 values, requires `gh attestation verify` to validate the evidence envelope, output and trace for the pinned repository and signer workflow, checks that the trace matches the frozen scenario oracle, and independently checks the GitHub Actions run and PR head metadata. It then requires an APPROVED GitHub PR review by a human with repository write association. The reviewer must differ from the CI actor and PR author. The review body starts with `SHOWDAR-RUBRIC/1` followed by JSON binding the evidence digest, output and trace digests, source SHA, scenario, model identity, run ID and every rubric criterion with a PASS/FAIL grade. A replayed, stale, malformed, self-authored, bot-authored or mismatched review is BLOCKED. Any unavailable GitHub API, CLI, token, attestation or artifact also returns BLOCKED.

These gates check artifact provenance and separate human approval. A matching authenticated review now produces `rubricStatus: APPROVED` or `REJECTED` while behavioral `status` remains `BLOCKED`. A review cannot enable the undeployed live capture producer. Simulated capture, CI-only envelopes and caller-substituted signer workflows are rejected before review. GitHub's `workflow_run` attester must exist on `main` before it can produce attestations. The minimal bootstrap is PR #24; it must not be merged without Leo's approval.

## Phase A bootstrap security and real attestation acceptance

The bootstrap contains only the workflow and the self-contained generator/security tests. Privileged jobs check out `github.sha` on `refs/heads/main`, with credentials not persisted and action revisions pinned. They never check out or execute PR code, install PR dependencies, use PR caches, or consume upstream PR artifacts. Fork runs are denied. Before evidence is minted, authenticated GitHub API lookups check repository identity, workflow ID/path, run ID/attempt, current PR SHA, same-repository head, open PR and target `main`. A failed lookup, ambiguous association, replayed attempt or stale source fails closed.

Only the attester job has OIDC/attestation write permissions. The independent verify job has read permissions and downloads the artifact from its own attester workflow run, verifies both JSON files with GitHub CLI at the exact source/signer SHA and `refs/heads/main`, denies self-hosted runners, and checks payload/envelope integrity plus upstream/attester run-attempt binding. All event inputs used by shell steps are environment variables in quoted arguments; numeric trigger IDs are validated by the trusted generator.

Model-free E2E acceptance after an approved bootstrap merge:

1. Complete or re-run `Verify PR` on an open same-repository PR at its current HEAD.
2. Require the `Attest behavioral evaluation CI evidence` workflow's separate `attest` and `verify` jobs to succeed.
3. Independently download `behavioral-evaluation-evidence` from that attester run; verify both files with `gh attestation verify`, the exact repository/workflow, `--source-ref refs/heads/main`, exact `--source-digest` and `--signer-digest`, and `--deny-self-hosted-runners`.
4. Require exact source, trigger run/attempt, attester run/attempt and payload SHA-256. Modified bytes or changed run-attempt bindings must fail. Fork, failed and stale-source events must not mint evidence.
5. Confirm valid evidence still says `TASK-002-CI`, model `none (model-free CI)` and `BLOCKED`. No model key is needed.

Before bootstrap is on `main`, PR CI verifies the code and security regressions; real attestation creation and verification remain **BLOCKED**.

## Phase B transport and runner capture

`responses-transport.mjs` implements the non-streaming POST contract at the fixed HTTPS Responses endpoint: `store:false`, serial strict functions, bounded request and streamed response bodies, exact requested model identity, cancellation, no redirects and no automatic retries. HTTP error bodies and exception text are withheld. The explicit live opt-in is additionally blocked by a private deployment gate; no caller flag, fake transport or environment variable can enable it. Tests use only fake HTTP responses. No real API request was made.

`runner-capture.mjs` captures response IDs, returned model identity, request IDs, redacted transcript, ordered tool/file events and SHA-256 bindings outside the fixture. A process-private random HMAC key seals each host session; it is never persisted or passed to the model/tool. This authenticates local session integrity and rejects tampering/replay across captures; it is not durable GitHub origin authentication. The Docker runtime brands its actual returned objects in a private WeakMap and detects mutated result bytes. Caller-authored JSON cannot forge that brand. Only those objects yield actual host tool receipts; injected runtime results stay simulated. Host file paths and receipt metadata are removed from function-call outputs.

`node scripts/behavioral-eval-verify-evidence.mjs --evidence evidence.json --artifact artifact.bin --trace trace.json --expected expected.json` independently invokes the pinned attestation verifier and authenticated GitHub review lookup. The operator supplies expected source/scenario/model, upstream run/attempt, attester run/attempt/source SHA and artifact/trace digests; frozen rubric/event IDs are loaded internally. GitHub credentials come only from the host `GITHUB_TOKEN`. The review must bind every field and its reviewer must differ from both run actors and the PR author. A valid human approval is reported separately while the CLI still exits nonzero for behavioral `BLOCKED`.

The model-free HTTP-to-broker-to-Docker-to-capture integration now exercises those seams on CI. Its model transport and execution remain permanently simulated even when the tool subprocesses are real. Runner-owned tool/file/verification observations cannot establish skill selection, lifecycle decisions, permission interactions or qualitative behavior. Those semantic hooks and the trusted live producer are still missing. `BRAIN-001` specifically requires actual `skill_selected(showdar-build)` and `decision_recorded(skip-refinement)` observations; selecting events from the frozen oracle or interpreting a model claim as an observation is forbidden.

## Exact pilot readiness criteria (all required)

- Approved bootstrap deployment on `main`, followed by the real model-free attestation E2E above. PR CI success alone does not satisfy it.
- A reviewed trusted live capture producer installed on `main`, using trusted runner code only. Evaluated source SHA, scenario hash/ID, exact model identity, execution/response IDs, workflow run/attempt, runner revision, transcript/trace/artifact SHA-256 and tool-image identity must be bound into authenticated evidence. It must distinguish live, simulated and CI-only origins internally; submitted JSON cannot set origin.
- Independent provenance/integrity verification at the pinned signer/source SHA and exact run/attempt. Tamper, replay, source mismatch, unknown signer, unavailable API and incomplete metadata must return `BLOCKED`.
- Source binding before the first model request and after capture, plus current-SHA Docker isolation, credential-leakage, traversal/symlink, timeout and artifact-integrity regressions. The tool image must have a reviewed immutable build provenance; arbitrary local image IDs are insufficient.
- Actual runner hooks for every required/forbidden pilot event, including the two `BRAIN-001` semantic events and permission/interaction observation. No `emit_event` tool, oracle-generated event or simulated transport may satisfy these gates.
- A separate human reviewer authenticated through GitHub reviews, distinct from the PR author, execution actor and capture actor. Review must bind the exact source, evidence/trace/artifact digests, run/attempt, model/scenario and all frozen rubric IDs. Approval and negative/dismissed/stale/bot/forged review regressions must pass; behavioral grading remains blocked until verified live origin and complete observations exist.
- Current-SHA CI green, explicit approval to enable the verified deployment gate, and separate explicit paid-pilot spend authorization. Neither approval is inferred from this implementation task.

TASK-002 remains incomplete and the pilot is **NO-GO** until every criterion is met. The first paid pilot must still return `BLOCKED` until its actual evidence is independently verified and reviewed; model-free tests never establish behavioral PASS.

To run the isolated integration check on a Docker-capable Ubuntu host (no model calls):

```bash
docker pull node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
docker build --pull=false -f evals/behavioral/Dockerfile.tool-runtime -t showdar-eval-tools:ci .
node --test scripts/lib/behavioral-eval/container-sandbox.integration.mjs
node --test scripts/lib/behavioral-eval/sandbox-tool-runtime.integration.mjs
```

This proves a bounded **tool runtime**, not the full agent trusted-runner contract. Authenticated agent-activity trace, permissions/user-approval observation, supported live Responses transport and **independent qualitative rubric grading** remain pending. The public live entry point still always returns `BLOCKED`; no user-defined trust flag or sandbox result can change that. Never treat a fake Responses turn, CI attestation or Docker tool receipt as behavioral PASS.

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

`node scripts/behavioral-eval-responses.mjs --preflight` now performs **real, model-free Docker isolation probes** via `container-sandbox.mjs`. It uses the locally provisioned immutable `node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1` image and `--pull=never`; it never pulls on the user's host. The disposable fixture is the only writable bind mount, with network disabled, read-only container root, dropped capabilities, `no-new-privileges`, non-root UID, process/CPU/memory limits and no credentials or Docker socket mount. Fixed guest probes verify non-root/capabilities/fixture access, denied external network, denied root filesystem writes and denied reads beyond the fixture and denied symlink escape attempts. `verified:true` is possible **only after all five real probes complete on a supported host**; injected fake transports never attest. A missing daemon, image, unsupported host or failed probe returns `verified:false` and nonzero CLI exit. This verifies the *tool container boundary only*: `trustedRunnerSupported` remains `false`, and live Responses execution stays blocked. The CI workflow separately provisions the image and runs `container-sandbox.integration.mjs` on Ubuntu; ordinary unit tests do not require Docker.

The future one-case entry command is:

```bash
node scripts/behavioral-eval-responses.mjs --case BRAIN-001 --model "$MODEL" --source-sha 3969d4eb62497a203beaa25fce41ecf8b3c9735a --allow-model
```

**Today this command always returns BLOCKED before any API or tool execution**, even with opt-in or supplied trust/sandbox flags. Do not execute a paid pilot until a separately verified Linux container runtime (network disabled, fixture-only mount, no evidence or credential mount), real Responses transport, runner-owned capture, all required observable events and independent rubric review are implemented and verified, and model spend is explicitly authorized.

TASK-002 remains implemented-incomplete; TASK-003/011 remain BLOCKED with 18 NOT_RUN, 0 PASS. Deterministic fake runs are NOT_RUN (BLOCKED on harness failure) and never behavioral PASS. No measurable skill improvement is claimed.
