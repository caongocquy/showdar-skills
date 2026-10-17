# TASK-002 model-free candidate — not ready

Base source: `99fc3f98e01c1a6d6f2549cc36b21af6f5eede04`. Acceptance reference: TASK-002-AA-001 v0.4 consolidated, SHA-256 `f7fa749ddb3e731198a2be9107e752aefa040f359ad2b1c2fbdcc01ea3804a96`. AUTH-01/02 only; no AUTH-03/04, residual-risk, real-model or release approval.

`budgets.mjs` owns private per-invocation request/action/round and raw/serialized/decoded/result/artifact accounting. The existing broker and MCP adapter share one instance. Raw ingress is incrementally measured before dispatch; strict UTF-8/JSON rejects duplicate fields and malformed representations. Atomic synchronous reservations gate actions, result capacity and staged artifact publication. Snapshot files cannot restore or reset private counters. No budget API is a model tool.

`invocation.mjs` keeps live CLI handle/birth/session/socket bindings and irreversible revocation. Normal successful CLI exit permits offline integrity evidence finalization for already completed actions. Deadline, cancellation, failed exit and budget violations poison finish; they cannot synthesize success.

Original Docker tool script and UTF-8 payload semantics remain unchanged. Candidate worker PID limit is tightened from the original 64 to v0.4's 32, with 256 MiB/network-none/read-only/cap-drop/no-new-privileges preserved. Only invocation staging is writable to the worker. Produced bytes are accounted before error cleanup, including after revocation; only the host's existing synchronous commit fence publishes.

The independent supervisor still owns native CLI and immutable Docker identities. There is no PID-scan kill or broad process-group fallback. Recovery remains quarantine only; persisted markers, digests and counters never create authority. Current budget/security evidence and exact command/result matrices are in `docs/TASK-002-e0203-budgets-local-20261015-01/`.

The accepted prospective E-04 process-crash run is immutable at `docs/TASK-002-e04-prospective-local-20261015-01/`: six functional barriers and its own preservation PASS. It is not rerun by this task; old preservation FAIL and old E-04 UNQUALIFIED remain unchanged. Global config is not restored or rebaselined. New runs use the explicitly authorized prospective SHA-256 and isolated HOME/CODEX_HOME; historical semantic diff and modifying actor remain UNKNOWN.

Typed broker budgets are not native IPC pre-allocation protection or an OS-enforced native process-tree memory quota. Native overlapping admission/retained connections, dedicated-runner environment, supervisor/OS death, Docker-daemon stall and unregistered host identity remain subject to their separate coverage limitations. E-03 Environment remains UNQUALIFIED.

**PHASE4B_NO_GO. AUTHORITATIVE BEHAVIORAL BLOCKED.** A commit/CI result proves only its declared source-validation scope; external human review is separate. Diagnostic integration is reviewable under qualification/; local test harnesses are not a shipped/live capture producer. Frozen/adopted datasets, original trusted runner and historical pins are unchanged.

E-01 review packages the existing diagnostic broker/driver under `qualification/`; no ignored executable imports remain. `qualification/README.md` records external prerequisites and native NOT_RUN/UNQUALIFIED on unsupported CI. Portable HTTP tests clone the unchanged source pin locally; CI must fetch full history. E-01 also fences legacy BRAIN-002 action receipts, closing an observed post-revocation writer outside the v2 fence. Prior test totals identify prior component maps, not this changed tree.
