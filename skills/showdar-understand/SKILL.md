---
name: showdar-understand
description: Analyze an unfamiliar repository from executable evidence and produce a bounded architecture map before any implementation work.
---

# Showdar Understand

## Purpose

- Build a trustworthy mental model of a repository before changing it.
- Identify runtime entrypoints, ownership boundaries, state/data flow, dependencies, build/test systems, and platform surfaces.
- Separate facts observed in files from architectural inferences.
- Reduce random file reading by following high-signal configuration and representative runtime paths.
- Read `references/repository-analysis.md` for the default inspection sequence.
- Use `references/architecture-signals.md` when directory names and actual dependency direction disagree.
- Use `references/dependency-analysis.md` when the task crosses packages, native modules, persistence, queues, or external services.

## When to use

- Entering a repository or subsystem you do not already understand.
- Before planning a feature whose change surface is unclear.
- Before a refactor or migration that may cross package/module boundaries.
- When the user asks for an architecture overview, dependency map, ownership map, or “where should this change go?”
- When a bug appears to cross layers and you need a minimal map before debugging.
- When agent context was compacted and repository structure must be re-established.

## When not to use

- The task is a tiny, already-localized edit and the exact owning file/contract is known.
- The user only asks a conceptual question unrelated to the repository.
- A production incident requires immediate evidence collection from runtime systems; use the relevant incident/debug tooling first.
- Do not turn this into a comprehensive documentation project unless the user requested one.

## Inputs and assumptions

- Repository root or a clearly identified subproject is available.
- Read repository instructions such as AGENTS.md/CLAUDE.md before source analysis.
- Prefer current executable config, imports, tests, and build files over stale prose.
- Generated files can reveal tooling but normally do not define source ownership.
- If multiple apps/packages exist, record which one the user task targets before expanding analysis.
- The read-only inspector `scripts/inspect-repo.mjs` may be used to collect deterministic signals.

## Non-negotiable rules

- Do not edit implementation files while running this skill unless the user explicitly changed the task.
- Never claim an architecture pattern solely because folders are named domain, core, clean, feature, or shared.
- Cite concrete files/symbols in the working notes that support each important architectural conclusion.
- Mark uncertainty instead of filling missing links with a familiar architecture pattern.
- Trace at least one representative runtime flow before declaring the repository understood.
- Keep the map proportional to the user task; avoid exploring unrelated subsystems.
- Never expose secrets found in configuration. Refer to secret names only.

## Workflow

### Phase 1 — establish repository context
- Read instructions, manifests, lockfiles, workspace files, build scripts, CI, and platform folders.
- Run `node scripts/inspect-repo.mjs <repo>` when deterministic stack/top-level signals are useful.
- Record language, package manager, framework/runtime, workspace layout, test tooling, and build entrypoints.

### Phase 2 — locate runtime entrypoints
- Find app/server/worker/native entrypoints and route/navigation registration.
- Identify configuration loading, dependency wiring, state stores, persistence adapters, and external integration seams.
- Prefer symbols that create or register dependencies over leaf utility files.

### Phase 3 — trace one representative flow
- Select a flow relevant to the task: a screen transition, request handler, background job, or persistence write.
- Trace input -> state/policy -> side effects -> output.
- Record where errors propagate, where state is owned, and where platform boundaries occur.

### Phase 4 — map boundaries and dependencies
- Distinguish package boundary, runtime boundary, persistence boundary, UI/state boundary, and native/platform boundary.
- Use `data/architecture-signals.csv` as a checklist, not as proof by itself.
- Expand dependencies only until the likely change/verification surface is clear.

### Phase 5 — synthesize
- Produce a concise current-state map, relevant flow, change-relevant boundaries, risks, and unresolved questions.
- Name the smallest set of files/symbols that should be read next for the user task.

## Decision points

- Monorepo? Map package ownership before source internals.
- Multiple state systems? Identify which owns the task’s state instead of documenting all of them.
- README contradicts source? Treat source/build configuration as current evidence and flag documentation drift.
- Cross-platform mobile? Map shared code and native iOS/Android responsibilities separately.
- Backend with workers/queues? Trace request and background execution as separate lifecycles.
- If dependency direction is cyclic, report the cycle rather than forcing a clean-layer interpretation.

## Stack detection

- Use manifest and directory evidence; the shared engine can detect common stacks.
- For mobile, read `stacks/mobile.md` and include navigation, lifecycle, native projects, permissions, and release surfaces.
- For backend, read `stacks/backend.md` and include process entrypoint, persistence, jobs, health, and shutdown.
- For React/Next.js, inspect render/router, server-client, cache, and state ownership using `stacks/react.md` or `stacks/nextjs.md`.
- For Node/Fastify/NestJS, inspect bootstrap, plugin/module graph, request contracts, persistence, jobs, and shutdown using the matching stack file.
- For React Native/Flutter/iOS/Android, separate shared state from native lifecycle, build, signing, and permissions using the matching stack file.
- For Tauri/Electron, separate frontend, IPC/preload/commands, capabilities, host lifecycle, and packaging using `stacks/tauri.md` or `stacks/electron.md`.
- Query `data/index.json` and `data/architecture-signals.csv` for stable signal IDs instead of treating folder names as proof.
- For unsupported stacks, infer from build/config files and keep claims evidence-based.
- Stack detection changes what to inspect; it does not change the core evidence-first workflow.

## Failure modes

- Over-reading every directory instead of following entrypoints and task-relevant flows.
- Treating architecture diagrams or README prose as more current than executable code.
- Confusing generated/vendor code with owned source.
- Missing a second runtime such as worker, extension, native host, or CLI.
- Describing folder taxonomy without explaining data/state/call flow.
- Producing a map so broad that it does not reduce the next implementation decision.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when the task-relevant runtime flow, ownership boundaries, and verification surfaces are clear enough to plan or debug.

## Escalation conditions

- Ask the user when multiple apps/packages plausibly match the requested task and repository evidence cannot select one.
- Escalate when required source is generated externally or missing from the checkout.
- Escalate when repository instructions prohibit reading or executing a needed command.
- For very large systems, propose narrowing to one user flow or service boundary before continuing.

## Verification

- Re-check every architecture claim against at least one executable/source signal.
- Confirm the representative flow reaches a real entrypoint and observable output/side effect.
- Confirm identified test/build commands actually exist before recommending them.
- Verify that no unrelated subsystem was included merely because it looked architecturally interesting.
- If using the inspector script, treat its output as inventory and manually verify important conclusions.

## Output contract

- **Stack and project shape** — languages, runtimes, package/workspace structure.
- **Entrypoints** — app/server/worker/native entrypoints relevant to the task.
- **Architecture map** — ownership boundaries and dependency direction with evidence.
- **Representative flow** — input to output/side effect.
- **Change-relevant surface** — files/symbols likely involved in the next task.
- **Verification surface** — tests/builds/platforms that can prove a later change.
- **Uncertainties** — explicit unknowns and the evidence needed to resolve them.

## Anti-patterns

- “This looks like Clean Architecture” without import/runtime proof.
- Opening hundreds of files alphabetically.
- Producing a generic technology inventory but no ownership or flow map.
- Suggesting refactors while the task is only understanding.
- Hiding uncertainty with confident architecture jargon.
- Copying sensitive configuration values into notes or output.

## Example

User request: “Where should offline caching for the transactions screen live?”
- Inspect manifests/navigation/state/data clients and trace transactions screen -> state/query -> API.
- Determine whether cache ownership belongs to query/data layer or screen state based on existing boundaries.
- Report exact source of truth, invalidation path, persistence options already present, and affected tests.
- Do not implement caching during this skill.
- See `examples/repository-audit.md` for a compact output shape.
