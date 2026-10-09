# Feature lifecycle: Brainstorm → Plan → Build / TDD → Test → Review

This guide describes the **portable skill instructions** shipped in Showdar Skills v0.17.0 source. The flow is executed by the coding agent, not by a compulsory CLI state machine. A skill not installed in the target agent is never claimed to have run. The selected repository's own instructions, Git rules and established documentation paths take precedence.

## Choose the next skill

| Goal | Skill | Output |
| --- | --- | --- |
| Understand an unfamiliar change surface | `showdar-understand` | Evidence-backed dependencies and impact |
| Explore unresolved product/architecture choices | `showdar-brainstorm` | Complete Decision Brief and explicit approval |
| Convert agreed behavior to tasks | `showdar-plan` | Bounded tasks, risks and verification matrix |
| Implement approved work | `showdar-build` | Scoped source/test changes, actual verification |
| Drive a testable change test-first | `showdar-tdd` | Observed RED → GREEN → REFACTOR receipts |
| Choose coverage or run broader independent checks | `showdar-test` | Test strategy and results |
| Review correctness and risks | `showdar-review` | Findings and residual risks |
| Resume interrupted work | `showdar-recover` | Reconciled progress and safe next task |

`showdar-feature` adaptively composes primitive stages; TDD, Brainstorm and the other companions are **not** new workflow-state stages. For tiny fully defined edits, skip unnecessary brainstorming/planning. If material requirements are unresolved, do not implement until the *entire* current Decision Brief revision is explicitly approved.

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

## TDD contract: RED → GREEN → REFACTOR

For one bounded testable behavior task:

1. **RED** — write the smallest behavioral test and run it **before** the production change. It must fail for the intended missing behavior, not a syntax/import/configuration error. Record the actual command and observed failure.
2. **GREEN** — implement the minimum correct behavior and rerun the same test; it must pass without weakening assertions or mocking away the tested contract.
3. **REFACTOR** — improve naming/structure within agreed scope if valuable, then rerun the focused test and relevant adjacent checks; all required proof must remain green.

When the skill is installed, `showdar-build` can delegate that cycle to `showdar-tdd`. When not installed, Build/Test may follow the same evidence-first guidance directly, **without claiming the TDD companion ran**. `showdar-test` owns testing strategy and wider regression/integration/E2E verification. `showdar-review` provides independent review after implementation.

TDD is **not** mandatory for documentation-only updates, generated-only assets, or work lacking a reliable executable test boundary. State why the normal loop is inapplicable and name an honest alternative check; never manufacture RED/GREEN receipts.

## Example: a two-task plan

An illustrative plan for a pricing bracket should look like:

```md
# Rate-table bracket implementation
Plan revision: 1
Status: ready
Approved spec: <existing canonical spec/ticket + revision>

- [ ] TASK-001 — Correct exclusive upper-bound lookup.
  - Depends on: none
  - Acceptance: key == max is excluded; key == min is included
  - TDD: reproduce boundary failure, minimal fix, rerun after refactor
  - Proof: <exact repo-native test command; discover, never invent>

- [ ] TASK-002 — Validate request and UI behavior.
  - Depends on: TASK-001
  - Acceptance: invalid/empty inputs produce expected feedback
  - Proof: <repo-native integration/component tests>

Verification ledger:
| Task | RED | GREEN | REFACTOR | Other proof | Status |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | not run | not run | not run | not run | pending |
| TASK-002 | not run | not run | not run | not run | pending |
```

This is a **format example**, not a claim that the example checks ran. Use actual symbols, commands and evidence from the target repository. Never treat `ready` as a new authorization to implement or claim task completion.

## Resuming across sessions

Read the saved plan and matching approved spec; inspect Git changes and tests first. Treat prior checkbox state as a hypothesis, not proof. For any task with absent or stale results, check existing implementation, rerun relevant verification and classify it as `verified-complete`, `implemented-unverified`, `blocked`, `not-started` or `superseded`. Continue only from an unmet task whose dependencies are verified. If spec or plan decisions drift, stop the affected work and reopen the decision instead of silently expanding scope.

Workflow checkpoints (where present) remain separate from Markdown plan ledgers and never serve as authorization.

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
