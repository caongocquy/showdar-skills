# Feature lifecycle: Brainstorm → Plan → Build / TDD → Test → Review

This guide describes the **portable skill instructions** shipped in Showdar Skills v0.17.0 source. The flow is executed by the coding agent, not by a compulsory CLI state machine. A skill not installed in the target agent is never claimed to have run. The selected repository's own instructions, Git rules and established documentation paths take precedence.

## Choose the next skill

| Goal | Skill | Output |
| --- | --- | --- |
| Understand an unfamiliar change surface | `showdar-understand` | Evidence-backed dependencies and impact |
| Explore unresolved product/architecture choices | `showdar-brainstorm` | Complete Decision Brief and explicit approval |
| Convert agreed behavior to tasks | `showdar-plan` | Executable vertical slices, contracts, dependencies and proof |
| Implement approved work | `showdar-build` | Capability-aware executor, scoped changes and actual proof |
| Drive a testable change test-first | `showdar-tdd` | Observed RED → GREEN → REFACTOR receipts |
| Choose coverage or run broader independent checks | `showdar-test` | Test strategy and results |
| Review correctness and risks | `showdar-review` | Independent Spec Compliance / Code Quality verdicts and findings |
| Diagnose an observed failure | `showdar-debug` | Runnable symptom, discriminating experiments or provisional diagnosis |
| Resume interrupted work | `showdar-recover` | Reconciled progress and safe next task |

`showdar-feature` adaptively composes primitive stages; TDD, Brainstorm and the other companions are **not** new workflow-state stages. For tiny fully defined edits, skip unnecessary brainstorming/planning. If material requirements are unresolved, do not implement until the *entire* current Decision Brief revision is explicitly approved.

## Conditional brainstorm paths

Read source and accepted decisions before asking questions. Skip already-defined work. When refinement is needed:

| Path | Use when | Evidence and approval |
| --- | --- | --- |
| Spike | Feasibility is unknown | Bounded question/budget and observable signal; artifacts are throwaway, production follow-up needs separately approved scope |
| Bounded | An existing seam has an unresolved behavior choice | Concise complete brief in chat with negative cases; explicit whole-brief acceptance |
| Architectural | A subsystem, public contract or persistence decision changes | Written Decision Brief with migration/rollback and revision-specific full approval |

Raise rigor when hidden complexity appears, preserving answered decisions. A partial answer never approves the complete brief. Detailed path decisions: [Brainstorm playbook](../skills/showdar-brainstorm/references/approval-handoff.md).

## Where Markdown artifacts live

Showdar reads the existing canonical spec/ticket/plan first. When none exists and a durable handoff is warranted, defaults are:

```text
docs/
└── showdar/
    ├── specs/
    │   └── <feature>.md     # Complete approved Decision Brief (when needed)
    └── plans/
        └── <feature>.md     # Ordered TASK IDs, dependencies and verification ledger
```

- **Brainstorm** may keep short one-session decisions in conversation. Save a durable spec only for complex or cross-session work, with permission to modify that file.
- **Plan** may keep small work in conversation. For larger multi-step work, record goals/non-goals, linked approved spec and revision, `TASK-NNN` checkboxes, dependencies, acceptance criteria, change surface, proof commands and blockers.
- **Build** chooses the first unmet dependency-ready task, reconciles actual source/tests with recorded state and updates the ledger after running proof.
- A checkbox or previously reported success is **not** evidence; missing or stale verification means `implemented-unverified` or `blocked`, never silently `[x]`.
- Plan/spec Markdown does **not** grant approval, permission to edit source, commit, push, merge, publish or deploy. Files are written only after repository Git preflight and applicable approval.

## Executable plans and adaptive execution

Plan one observable outcome through the needed boundaries and its tests per vertical slice. Each material task carries stable IDs/requirements, non-goals, dependencies, Consumes/Produces, change surface, public test seam, negative cases, proof and rollback. Reject cycles/missing producers and expose a ready frontier from verified prerequisites. Wide coupled migrations use **expand → migrate → contract** with compatibility checkpoints. Legacy plan IDs, canonical paths and historical receipts stay valid; enrich relevant tasks without a wholesale migration.

Build is **inline-first**. Delegate only when actual host tools, available budget and isolated ownership support it. Parallel tasks must have verified dependencies and no conflicting files, interfaces, Git state, services, ports or generated output. Otherwise execute inline or serialize and state the limitation; an installed skill is not a subagent runtime. Owner checks delegated artifacts and proof independently.

Execution order is Git preflight → RED → minimal implementation → GREEN → REFACTOR → reverify → ledger, with justified TDD exemptions. Failed/missing proof keeps the task unchecked. Stop after two unsuccessful fix attempts after the initial attempt and hand off evidence to Debug or the affected decision to Plan/Brainstorm. See [task decomposition](../skills/showdar-plan/references/task-decomposition.md) and [Build execution](../skills/showdar-build/references/plan-execution.md) for detailed tables.

## TDD contract: RED → GREEN → REFACTOR

Choose a public observable boundary and independent expected values derived from accepted rules. One invariant per vertical cycle; mocks belong at external effects and must preserve the changed contract. Computing expected output with the same production function or mocking that function cannot prove it. See [test seams](../skills/showdar-tdd/references/test-seams.md).

For one bounded testable behavior task:

1. **RED** — write the smallest behavioral test and run it **before** the production change. It must fail for the intended missing behavior, not a syntax/import/configuration error. Record the actual command and observed failure.
2. **GREEN** — implement the minimum correct behavior and rerun the same test; it must pass without weakening assertions or mocking away the tested contract.
3. **REFACTOR** — improve naming/structure within agreed scope if valuable, then rerun the focused test and relevant adjacent checks; all required proof must remain green.

When the skill is installed, `showdar-build` can use that cycle through `showdar-tdd`. When not installed, Build/Test may follow the same evidence-first guidance directly, **without claiming the TDD companion ran**. `showdar-test` owns testing strategy and wider regression/integration/E2E verification. `showdar-review` provides independent review after implementation.

TDD is **not** mandatory for documentation-only updates, generated-only assets, or work lacking a reliable executable test boundary. State why the normal loop is inapplicable and name an honest alternative check; never manufacture RED/GREEN receipts.

## Review and debug evidence

Review always reports independent **Spec Compliance** and **Code Quality** verdicts: PASS, FAIL, BLOCKED or NOT_APPLICABLE with scope/reasons. Missing authoritative requirements blocks Spec Compliance; a spec violation does not automatically fail Code Quality, and meeting requirements does not excuse a security defect. Pin spec/plan revisions and the reviewed base/head or working diff, link findings to locations/task IDs and disclose unexecuted checks. Substantial fixes need scoped re-review, capped at two fix rounds after the initial review; final branch review is separate. See [dual-gate review](../skills/showdar-review/references/dual-gate-review.md).

Debug first seeks one command, fixture or script that reproduces the reported symptom. Record expected/observed output, source and environment; test predictions with controlled experiments, then rerun the original reproducer after a causal fix. After two experiments without new signal, reduce the case or change the observation seam. Missing device/access or harness failures remain gaps and diagnosis stays provisional. See [debug feedback loop](../skills/showdar-debug/references/hypothesis-driven-debugging.md).

## Example: a two-task plan

An illustrative plan for a pricing bracket should look like:

```md
# Rate-table bracket implementation
Plan revision: 1
Status: ready
Approved spec: <existing canonical spec/ticket + revision>

- [ ] TASK-001 — Quote a valid rate through the API and form.
  - Requirement: AC-RATE-01; non-goals: invalid-input feedback (TASK-002)
  - Depends on: none
  - Consumes: approved bracket table and existing quote request
  - Produces: quote response with compatible amount/error shape
  - Acceptance: key == max selects next bracket; key == min is included
  - Test seam: real lookup/API plus observable form submission
  - Negative case: out-of-range key is rejected
  - Proof: <discovered API/component commands; expected RED, then GREEN and post-refactor checks>
  - Rollback: scoped quote-path revert preserving existing read contracts

- [ ] TASK-002 — Show invalid-input feedback through API and form.
  - Requirement: AC-RATE-02; non-goals: new pricing rules
  - Depends on: TASK-001 with fresh required proof
  - Consumes: TASK-001 response/error shape
  - Produces: bounded validation errors and corresponding visible feedback
  - Test seam: invalid request through API and form
  - Negative cases: empty, nonnumeric and out-of-range inputs
  - Proof: <discovered integration/component commands and observed results>
  - Rollback: scoped validation change retaining TASK-001 valid quoting

Verification ledger:
| Task | RED | GREEN | REFACTOR | Other proof | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | not run | not run | not run | not run | pending |
| TASK-002 | not run | not run | not run | not run | pending |
```

This is a **format example**, not a claim that the example checks ran. Use actual symbols, commands and evidence from the target repository. Never treat `ready` as a new authorization to implement or claim task completion.

## Resuming across sessions

Read the saved plan and matching approved spec; inspect Git changes and tests first. Treat prior checkbox state as a hypothesis, not proof. For any task with absent or stale results, check existing implementation, rerun relevant verification and classify it as `verified-complete`, `implemented-unverified`, `blocked`, `not-started` or `superseded`. Continue only from an unmet task whose dependencies are verified. If spec or plan decisions drift, stop the affected work and reopen the decision instead of silently expanding scope.

Feature/Bugfix handoffs carry task/requirement IDs, spec/plan and source revisions, actual executor, Consumes/Produces, changed artifacts, executed proof, gaps and next owner/action. Build owns ledger completion, Test independent coverage, and Review the two verdicts. Recover rechecks stale proof before repeat edits. A missing companion is never claimed as invoked; failed/BLOCKED required gates prevent workflow completion. See [handoff playbook](../skills/showdar-feature/references/task-handoff.md).

Workflow checkpoints (where present) remain separate from Markdown plan ledgers and never serve as authorization.

## Static checks versus real-agent evaluation

Document-contract/installer tests and deterministic retrieval/workflow benchmarks verify instructions, packaging and runtime invariants; they do not demonstrate that an agent follows the skills. Fake-process tests exercise runner engineering only. The experimental source-checkout suite has 18 scenarios with independent oracles; all remain **18 NOT_RUN, 0 PASS**. Real-agent baseline/after-change comparison and behavioral readiness are **BLOCKED**. No measured quality improvement is claimed.

The Codex JSONL adapter refuses real execution before process launch because preventive exact-argv command mediation is unsupported; post-execution JSONL auditing is not an allowlist. Working OS sandboxing and credential isolation remain mandatory. Imported traces remain untrusted: event analysis MATCH is separate from behavioral status BLOCKED. Submitted provenance, artifact proofs and rubric grades cannot enable PASS; trusted runner capture and independent grading remain unsupported. See [experimental evaluation limits](./REFERENCE.md#experimental-agent-behavioral-evaluation). The original 18-case suite, frozen source revision and independent oracle snapshot must remain unchanged for comparison.

## Installation and invocation

```bash
npm install -g showdar-skills
showdar setup                 # Interactive skill installer
showdar doctor
showdar add brainstorm        # Add a single companion
showdar add tdd --ai cursor   # Add TDD without replacing other skills
```

The developer/backend/qa/full profiles include TDD; minimal/product/insurance do not. In supported agents, invoke the installed skills by native name (for example `/showdar-brainstorm` or `/showdar-tdd`), or use generated OpenCode/Claude `/showdar/<skill>` commands. Syntax depends on the host.

An installation does not **automatically** create feature Markdown or change an existing project. `showdar setup` selects/install skills; the separate `showdar-setup` companion handles project-context auditing and proposes writes with approval. See [CLI reference](./REFERENCE.md) and [README](../README.md).
