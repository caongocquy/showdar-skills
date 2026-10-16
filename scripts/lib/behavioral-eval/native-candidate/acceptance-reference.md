# TASK-002-AA-001 — Limited Pilot Acceptance Amendment v0.4

**Date:** 2026-10-14  
**Status:** FROZEN REVIEW CANDIDATE — PROPOSED, NOT EFFECTIVE  
**Previous full revision:** v0.3  
**v0.3 SHA-256 (verified):** `1d92ae7f78d3e239ba07ef20d4205a6a1213e0e0f51d8a88d00966467016ffa3`  
**v0.4 change-set SHA-256 (owner-reported):** `acb0425df6d5d9e13dccbb7530e591f38c8c8b3c48813a94c9f471ea10ed89b8`

**Baseline:** Phase 4B.6 — `PHASE4B_NO_GO`  
**Authoritative behavioral:** `BLOCKED`

This amendment proposes a limited, risk-accepted execution boundary. It does not assert that unknown native guarantees have passed and does not authorize repository changes, real-model execution, paid APIs, deployment or release.

## 1. Objective and scope

Permit a future review of a limited pilot using bounded end-to-end safeguards instead of requiring every safety property to be implemented by the pinned Codex native host.

The proposed scope covers:

- Pinned Codex CLI 0.162.1 and Code Mode host.
- Trusted broker and MCP adapter.
- Docker-mediated typed tools.
- Model-free BRAIN-002/003.
- Credential isolation, filesystem/network isolation, cancellation, artifact integrity and recovery.
- Bounded execution and explicit residual-risk acceptance.

Out of scope: real-model smoke, paid pilot, SAFE-003, authoritative behavioral grading, production mutation, deployment and release.

## 2. Decisions requiring approval

| ID | Proposed acceptance decision | Status |
|---|---|---|
| D-A01 | Replace mandatory native aggregate hard-memory qualification with a dedicated-runner operating contract and explicitly accepted residual OOM risk. | PENDING |
| D-A02 | Accept trusted ingress/tool payload restrictions as partial mitigation, without claiming native IPC pre-allocation protection. | PENDING |
| D-A03 | Restrict operation to one native invocation and one outstanding action; native concurrency coverage remains incomplete. | PENDING |
| D-A04 | Accept independently verified broker lifecycle/fencing evidence as partial mitigation for unobserved retained native connections. | PENDING |
| D-A05 | Require exact resource ceilings, environment, independent review, E-04 recovery evidence, explicit residual-risk decisions and stop conditions. | PENDING |

Owner approval must bind one immutable revision and all five decisions.

## 3. Evidence baseline

| Evidence | Established status |
|---|---|
| Native cancellation barriers | 8/8 PASS |
| Native integrity negatives | 12/12 PASS |
| Focused regression | 91/91 PASS |
| Full isolated-HOME regression | 1051/1051 PASS |
| Broker retained/concurrent/replay/deadline | 4/4 PASS — broker only |
| Historical preservation | 14,531/14,531 hashes matched |
| BRAIN-002/003 | PASS — mechanical only |
| Hard native process-tree quota | UNOBSERVABLE |
| Native pre-allocation IPC cap | UNOBSERVABLE |
| Native overlapping admissions | UNOBSERVABLE |
| Retained native connection after CLI exit | UNOBSERVABLE |

The original source remains pinned to `99fc3f98e01c1a6d6f2549cc36b21af6f5eede04`.

Phase 4B corrections are still local, ignored candidate files. They have not been accepted as reviewed production source.

## 4. Proposed operating envelope

These limits are candidate requirements, not current PASS results.

| Parameter | Proposed ceiling |
|---|---|
| Environment | Dedicated disposable macOS runner, no production secrets or unrelated workloads |
| Active native invocations | 1 |
| Outstanding tool actions | 1 |
| Scenarios per execution | 1 |
| Agent turns | 8 |
| Total execution deadline | 90 seconds |
| Docker tool deadline | 15 seconds |
| Cancellation cleanup deadline | 5 seconds |
| Trusted ingress HTTP body | 65,536 bytes |
| Tool-call argument payload | 16,384 bytes |
| Tool result | 65,536 bytes |
| Artifact | 65,536 bytes, additionally constrained by the input mechanism |
| Native process-tree RSS warning | 512 MiB |
| Native process-tree RSS emergency stop | 1 GiB |
| RSS sampling interval | 250 ms |
| Docker memory | Proposed hard limit 256 MiB |
| Docker process count | Proposed hard limit 32 PIDs |
| Automatic retries for side-effecting actions | 0 |

RSS monitoring is supervisory, not an OS-enforced hard memory quota. A sampled process can exceed the threshold before the supervisor acts.

Docker limits require real-container verification. No dedicated runner or new infrastructure is authorized by this document.

### 4.1 Aggregate invocation budget

The existing per-request ceilings remain unchanged. Add the following cumulative limits for one invocation:

| Budget | Proposed maximum |
|---|---:|
| Authenticated, invocation-bound ingress request attempts | 16 |
| Cumulative ingress HTTP body bytes | 262,144 bytes (256 KiB) |
| Typed tool action attempts | 8 |
| Cumulative raw tool-argument bytes | 65,536 bytes (64 KiB) |
| Cumulative serialized/decoded argument bytes | 65,536 bytes (64 KiB) for each separately measured representation |
| Cumulative serialized tool-result bytes | 131,072 bytes (128 KiB) |
| Cumulative produced artifact bytes | 65,536 bytes (64 KiB) |
| Model/agent turns | 8 |
| Active native invocations | 1 |
| Outstanding tool actions | 1 |

All limits apply in addition to existing individual request, argument, result, artifact and deadline ceilings. The effective allowance is the minimum of all applicable limits.

**Budget ownership**

- Counters belong to trusted invocation state, not model-visible state.
- Reconnection, replay, retry or tool failure must not reset counters.
- Counters are updated at the earliest trustworthy admission/measurement point.
- Authenticated invocation-bound attempts count even when subsequent schema or authorization validation rejects them.
- Requests rejected before they can be securely bound to an invocation are handled by separate broker admission protection; they cannot consume another invocation's budget.
- Revoked invocations cannot receive additional budget.
- New invocation identities cannot be minted to bypass the one-active-invocation policy.
- Counter overflow, missing measurement, inconsistent accounting or ambiguous ownership fails closed.

**Byte accounting**

Ingress totals count actual received wire-body octets, including JSON framing and escapes.

Argument accounting maintains separate totals for raw argument bytes, deterministic serialized representation and decoded payload bytes. Applicable representations must each satisfy their own aggregate ceiling.

Tool-result accounting counts complete serialized response bytes before release.

Artifact accounting counts actual produced bytes, including staged artifact output, without resetting consumed budget after cancellation, cleanup or unsuccessful publication. Trusted promotion does not charge the same content a second time.

For predictable operations, reserve sufficient remaining budget before dispatch. Check actual measured bytes before releasing a response or authorizing publication. Unknown output size must not authorize unbounded allocation or privileged publication.

These controls do not establish a native IPC pre-allocation limit.

## 5. Byte-counting and payload contract

All limits use binary units: 1 KiB = 1,024 bytes.

### 5.1 Wire ingress

The 65,536-byte ingress ceiling applies to the complete received HTTP request body, including JSON structure, quotes and escapes.

- Count received body octets, not JavaScript string length.
- Enforce the limit incrementally while receiving data.
- Do not trust `Content-Length` alone.
- Reject requests exceeding the limit before forwarding or invoking tools.
- Disable compressed request bodies for this pilot.
- Reject malformed UTF-8 and unsupported content encodings.
- Repeated, chunked or streaming delivery must not bypass the aggregate ceiling.

This protects broker ingress. It does not establish a native IPC pre-allocation cap.

### 5.2 Tool arguments

The 16,384-byte limit applies independently to:

1. Raw UTF-8 JSON argument bytes received for one tool call.
2. Deterministic UTF-8 serialization of the parsed argument object.
3. Any decoded string or binary payload produced from those arguments.

All applicable limits must pass. Ambiguous encoding, malformed Unicode, duplicate critical fields and unsupported representations fail closed.

For inline content, actual artifact bytes are measured using UTF-8 encoding of the decoded content.

JSON escape notation must not allow raw or decoded limit bypasses.

### 5.3 Artifact and result

The 65,536-byte artifact ceiling applies to actual output bytes, not the number of characters or a self-reported size field.

The result ceiling applies to the complete serialized tool-result payload before release to the caller.

For `artifact.write` with inline content, the effective maximum artifact size is constrained by BOTH:

- The 16,384-byte argument ceiling, including JSON overhead.
- The 65,536-byte artifact ceiling.

Therefore **this amendment does not permit a full 64 KiB inline artifact through the current 16 KiB argument interface**.

An out-of-band artifact capability would require a separate reviewed contract, not an implicit exception.

### 5.4 Required negative tests

Test every applicable boundary at the exact maximum and maximum + 1 byte, including:

- Multibyte UTF-8 characters.
- Escaped Unicode.
- Escaped backslashes and JSON control characters.
- Nested objects and large arrays.
- Chunked input.
- Declared versus actual body-length mismatch.
- Malformed UTF-8 and invalid encodings.
- Encoded payload expansion.
- Oversized decoded content.
- Oversized artifact/result bytes.

Verify rejection before the associated privileged operation and verify zero forbidden side effects.

Native IPC before-allocation safety remains `UNOBSERVABLE`.

#### Aggregate session negative tests

In addition to the per-request tests, independently verify:

1. The 16th authenticated request is within the request-count ceiling; the 17th is denied.
2. The ninth tool action attempt is denied.
3. Cumulative ingress bytes are accepted at 262,144 and denied at 262,145.
4. Cumulative raw tool arguments are accepted at 65,536 and denied at 65,537.
5. Cumulative serialized and decoded arguments independently enforce their aggregate limits.
6. Cumulative serialized tool results enforce 131,072 bytes.
7. Cumulative produced artifact output enforces 65,536 bytes.
8. The ninth model/agent turn is denied.
9. Rejected attempts, reconnects and replays cannot reset or evade accounting.
10. Concurrent attempts cannot overdraw the same remaining budget.

For byte-boundary tests, distribute data across multiple individually valid requests so the aggregate limit, not an earlier per-request ceiling, is the condition under test. Use separate isolated fixtures when necessary to prevent another counter from masking the targeted boundary.

Verify exact boundary versus boundary + 1 behavior, atomic reservations under concurrent admission, fail-closed rejection, no forbidden dispatch/artifact commit/approval after exhaustion, and independently recorded counter values and filesystem effects.

These tests qualify the trusted accounting boundary only. They are not proof of native Code Mode IPC allocation limits.

## 6. Mandatory security safeguards

The following requirements cannot be waived by this amendment:

- No provider credentials in CLI/host/delegate environments, arguments, logs or artifacts.
- Root-deny filesystem isolation.
- Denied external network access.
- Only explicitly approved typed capabilities.
- Authenticated broker invocation and source/session binding.
- Serialized actions, irreversible revocation and trusted commit fencing.
- Independent raw-byte receipt, snapshot, marker and approval-target verification.
- No post-effective-revocation committed effects.
- Fail-closed operation on missing or inconsistent evidence.
- No arbitrary shell or generic process execution exposed to the agent.
- No production credentials, production data, deployment or publishing authority.

### 6.1 Allowed JavaScript execution versus forbidden process execution

The pinned native Code Mode `exec` interface is an authorized JavaScript execution environment. Its existence or use does not, by itself, violate the prohibition against arbitrary shell execution.

**Allowed behavior**

- Execute JavaScript computations within the restricted native Code Mode runtime.
- Use control flow, transformations and bounded local computations.
- Invoke explicitly exposed, approved typed capabilities through the authorized native tool interface.
- Receive bounded responses from those capabilities.
- Use runtime-supported language features only when they do not bypass the established capability boundary.

**Forbidden behavior**

- Invoke generic shell or terminal execution capabilities.
- Select arbitrary external executables or command-line arguments.
- Spawn arbitrary subprocesses.
- Access unrestricted Node.js, Bun, Deno or equivalent host execution APIs.
- Access filesystem, network, environment variables or credentials outside explicitly mediated capabilities.
- Load modules or use runtime escape techniques to obtain unauthorized host privileges.
- Execute arbitrary operating-system scripts, package installers or deployment commands.
- Bypass broker authorization through alternative tool namespaces, imports or indirect execution paths.

Trusted internal fixed-command executors are permitted only with exact allowlisted executables, arguments, working directories, environment and authorization.

**Security invariant:** JavaScript computation is permitted; unauthorized operating-system capabilities are not.

The trusted runtime must enforce this distinction. Agent instructions, tool descriptions and read-only sandbox settings are insufficient enforcement evidence.

### 6.2 Required positive and negative tests

**Positive qualification**

Execute the genuine pinned Code Mode `exec` interface with bounded JavaScript that:

1. Performs a deterministic computation.
2. Calls an approved typed capability.
3. Receives its expected response.
4. Produces no unauthorized host effects.

**Negative qualification**

Attempt unauthorized execution through:

- Generic shell/process tool names and namespaces.
- `node:child_process`, `process`, `require` and equivalent process APIs.
- Unsupported module imports and dynamic import paths.
- Direct filesystem/network/runtime API access.
- Arbitrary executable and argument overrides.
- Alternative MCP or broker dispatch paths.
- Interpreter and module-loading escape attempts.
- Encoded command strings, malformed schemas and injected execution parameters.
- Trusted internal Docker or fixed-command capabilities exposed outside their approved typed interface.

For each applicable attempt, verify independently that unauthorized subprocess creation and privileged effects did not occur.

Ordinary Code Mode JavaScript execution must not be counted as a forbidden subprocess spawn. Negative tests must distinguish approved trusted internal processes from unauthorized agent-controlled process execution.

Failure to enforce this distinction is a mandatory NO-GO condition.

## 7. Recovery trust model — quarantine only

**Decision proposed for v0.4: after broker restart, recovered transaction files are NOT automatically trusted.**

The live trusted session maintains private receipt and publication bindings. After a crash, the process-private trust state may be unavailable.

A self-contained commit marker with matching SHA-256 digests proves neither authenticated origin nor permission to resume a session.

### 7.1 Restart behavior

On restart:

- All previous invocation capabilities remain revoked.
- No previous session is automatically resumed.
- No recovered receipt or publication marker can authorize an approval.
- Staging, pending and previously published transaction files are treated as untrusted recovery material until handled by an independently authorized workflow.
- Recovery material is quarantined from active trusted namespaces or logically isolated so normal consumers cannot recognize it as valid.
- Recovery cannot overwrite valid existing files.
- Missing, inconsistent or ambiguous transaction state fails closed.

The recovery scanner may classify and preserve evidence for analysis, but classification does not create new trust.

### 7.2 No automatic re-trust

This proposed amendment deliberately excludes automatic transaction re-attestation after process restart.

A future design that re-trusts persisted transactions would require an independently authenticated trust anchor, bound to source/session/transaction identities, with explicit authorization and fresh negative tests.

A digest stored beside the artifact, an unsigned marker, or an HMAC key that was lost with the previous process is insufficient.

Existing evidence independently authenticated before a crash is not retroactively invalidated merely because a new local broker cannot resume it. However, the new broker cannot use historical files to mint new approval authority.

## 8. E-04 — Mandatory crash and recovery evidence

Before limited model-free readiness, fault-inject or abruptly terminate the trusted runtime at:

1. Before artifact preparation.
2. After final artifact link, before transaction publication.
3. During receipt/marker preparation.
4. Immediately before transaction-directory publication.
5. Immediately after publication, before response.
6. During recovery and orphan cleanup.

For each case, verify independently:

- Partial artifacts and markers cannot authorize approval.
- Restart does not automatically restore trusted transaction status.
- Recovery material is quarantined or isolated.
- No stale invocation is reactivated.
- Quarantine and cleanup are idempotent.
- Existing valid files are not overwritten.
- No new trusted receipt is synthesized from recovered files.
- Ambiguous states fail closed.

A clean process exit is not a substitute for abrupt-termination testing.

Fault-injection evidence must state whether it covers process crash, forced termination, OS crash or power loss. Do not claim power-loss durability without applicable evidence.

**E-04 is mandatory and cannot be waived through residual-risk acceptance.**

## 9. Residual risk register

All risks remain open until individually reviewed and accepted.

| ID | Risk | Severity | Required treatment |
|---|---|---|---|
| R-01 | Native memory exhaustion or host impact | High | Dedicated-runner isolation, bounded supervision, explicit non-hard-limit acceptance |
| R-02 | Native IPC allocation before trusted filtering | High | Per-request and cumulative byte controls with independently verified negatives; residual HIGH risk remains OPEN because native pre-allocation safety is unqualified |
| R-03 | Unobserved concurrent native action races | Medium–High | Enforce one invocation and one outstanding action; adversarial counter-reservation and serialized-dispatch tests; broker-only proof stays separately labeled |
| R-04 | Post-exit connection or callback activity | Medium–High | Revocation, fencing, delayed-action tests and cleanup evidence |
| R-05 | Crash/partial transaction publication | High | E-04 must PASS; quarantine-only recovery |
| R-06 | Local unreviewed corrected implementation | High | Reviewed candidate source and current-SHA CI |
| R-07 | Synthetic evidence mistaken for autonomous behavior | High | Trusted live producer, authenticated evidence and separate rubric verification |

Each risk decision must record:

- Exact amendment revision.
- Risk ID.
- Owner decision and independent reviewer.
- Execution scope.
- Required mitigation evidence.
- Remaining exposure.
- Explicit acceptance or rejection.

Risk acceptance never converts an unqualified guarantee into PASS.

R-05 and R-06 cannot bypass their required readiness evidence.

## 10. Mandatory stop conditions

The trusted runtime must revoke further dispatch and prevent new trusted commits on:

- Credential leakage or authentication failure.
- Unauthorized filesystem/network access.
- Availability of an unmediated generic execution tool.
- Payload ceiling violation.
- Concurrent invocation/action violation.
- Deadline or cleanup failure.
- Observed RSS emergency threshold.
- Post-revocation commit.
- Artifact, receipt, snapshot or marker integrity failure.
- Inconsistent source/session/runtime identity.
- Ambiguous recovery state.
- Missing provenance or required independent verification.

Revocation must be irreversible for that invocation.

Stop evidence must identify the violated boundary, observed effect, disposition of artifacts and cleanup result.

Supervisory termination is not a hard memory containment guarantee.

## 11. Authorization boundaries

All permissions remain separate.

| Authority | Permitted action after explicit grant | Currently |
|---|---|---|
| AUTH-01 | Assemble a scoped, reviewed candidate on a task branch | NOT AUTHORIZED |
| AUTH-02 | Run candidate-specific model-free qualification, create review PR and trigger CI; no automatic merge | NOT AUTHORIZED |
| AUTH-03 | Approve exact amendment revision, D-A01–D-A05 and individual residual risks | NOT AUTHORIZED |
| AUTH-04 | Approve live deployment, real-model execution and paid pilot budget | NOT AUTHORIZED |

Approval of AUTH-01 or AUTH-02 does not approve the amendment or pilot.

No repository mutation may be inferred from drafting this document.

## 12. Readiness requirements

**E-01 — Reviewed candidate**

- Candidate SHA and component hashes.
- Complete reviewed security-sensitive diff.
- Reproducible current-SHA CI.
- Frozen/adopted artifacts unchanged.

**E-02 — Model-free security**

- Credential, filesystem and network isolation.
- Legitimate pinned Code Mode `exec` positive test and no-generic-shell/process negative tests under §6.2.
- Source/answer/target binding.
- Native lifecycle, cancellation and Docker commit fencing.
- Receipt and artifact tampering tests.
- Independent security verification.

**E-03 — Bounded execution**

- Independently enforced per-request and aggregate invocation budgets under §§4.1 and 5, including concurrency/reservation and byte-boundary negatives.
- Single-invocation/action serialization.
- Deadlines and actual cleanup.
- Resource budget observations.
- Explicit records of remaining native memory/IPC unknowns.

**E-04 — Recovery**

- Required crash/restart qualification.
- Quarantine-only recovery.
- No trust from partial publication.
- No automatic re-attestation.

**E-05 — Operational acceptance**

- Approved environment and exact ceilings.
- Independent security review.
- Individual R-01–R-07 decisions.
- Effective stop conditions.

**E-06 — Separate live readiness**

- Reviewed trusted live capture producer.
- Authenticated source/run/model/trace/artifact provenance.
- Complete observable required/forbidden events.
- Independent human rubric.
- Current-SHA CI.
- Separate real-model, deployment and spend authorization.

E-01 through E-05 do not replace E-06.

## 13. Approval and versioning

This document becomes effective only after:

1. Final revision text is frozen.
2. Exact UTF-8 document bytes and SHA-256 are recorded.
3. Owner explicitly approves that revision, D-A01–D-A05 and the defined operating envelope.
4. Each residual risk receives its required explicit disposition.
5. The approval evidence is stored under an authorized, reviewable workflow.

Approval of the amendment changes only the agreed acceptance criteria. It does not itself complete E-01–E-06 or authorize repository mutation, live execution or paid model use.

Versions 0.1, 0.2 and 0.3 remain historical proposals. They are not silently superseded by this frozen review candidate.

## 14. Current verdict

- Amendment: **FROZEN REVIEW CANDIDATE — PROPOSED, NOT EFFECTIVE**
- Exact-revision approval: **PENDING**
- Residual-risk acceptance: **PENDING**
- Phase 4B original contract: **PHASE4B_NO_GO**
- Limited model-free readiness: **NOT QUALIFIED**
- Repository changes: **NOT AUTHORIZED**
- Real-model smoke: **NOT AUTHORIZED**
- Paid pilot: **NOT AUTHORIZED**
- Authoritative behavioral: **BLOCKED**
