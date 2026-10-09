---
name: showdar-setup
description: Use when onboarding a repository, auditing project context, or proposing grounded glossary and agent documentation improvements.
---

# Showdar Setup

## Purpose

- Offer a standalone portable Agent Skill that works without any Showdar executable.
- Reuse existing repository conventions and the user's authoritative requirements.
- Separate observations, assumptions, proposals, approvals, and mutations.
- Keep outcomes useful for the next engineering stage without creating a second router.

## When to use

- First-time project onboarding and project context drift investigations.
- Discovering existing glossary, ADR, specs, conventions and ownership.
- Preparing a repository-grounded context improvement proposal.

## When not to use

- A single feature needs questions: use showdar-refine.
- An existing contract needs implementation: use the appropriate lifecycle skill.
- The user only wants the interactive CLI installer: use showdar setup.

## Inputs and assumptions

- Read repository instructions and user-provided context before proposing changes.
- Prefer relevant source files, API schemas, tests, tickets, and existing documentation.
- Record conflicting evidence and ask the user about decisions that change meaning.
- Treat an existing artifact as canonical when repository conventions say so.

## Non-negotiable rules

- Never claim a user approved an unapproved proposal.
- Do not infer permission to edit files, commit, push, merge, publish, or deploy.
- Before edits, honor repository Git policy and prepare a safe task branch as required.
- If the Showdar CLI is available, run showdar guard --mutation local-write --json and require ok=true and data.allowed=true.
- If CLI is unavailable, perform Git and repository-policy checks manually; never auto-fetch a CLI with npx.
- Respect existing files and user modifications; show proposed changes before writes.
- Do not fabricate product decisions or source evidence.
- Use native skill discovery in skills-only installations without assuming router, manifest or CLI.

Read `references/context-audit.md` only when that depth of detail is needed; these references are packaged inside this skill for skills-only installers.

## Workflow

- Inventory instructions, package/build files, app entrypoints and relevant tests without source mutation.
- Map user roles, product purpose, domain concepts, business flows and architecture with cited file evidence.
- Discover existing canonical glossary, ADR and feature specification locations before choosing paths.
- Compare existing docs/agents/project.md, issue-tracker.md, verification.md and domain.md against actual repository facts.
- Extract glossary candidates only from consistent evidence; give meaning, aliases, source and unresolved conflicts.
- Present a concise file-by-file proposed diff for project context and glossary candidates.
- Ask for explicit approval for the proposal; declining must leave files unchanged.
- If approved, create or enrich canonical docs; preserve existing content and avoid boilerplate.
- Do not create an ADR from observing implementation; an ADR needs a confirmed decision and alternatives.
- Check links, commands, and content consistency; use showdar doctor only if its CLI exists.
- Report documentation changes and unresolved context gaps, with follow-up options.

## Decision points

- Existing canonical docs override default docs/agents and glossary paths.
- No defensible terminology? Skip glossary creation instead of making an empty file.
- Conflicting domain meanings? Keep candidates proposed until the user decides.
- CLI absent? Continue normal read-only audit, approvals, and permitted edits manually.

## Stack detection

- Inspect manifests/configuration before assuming framework or tooling.
- For web and mobile check navigation, state lifecycle, API contracts and accessibility concerns.
- For backend check persistence, authentication, compatibility and operational boundaries.
- For other stacks use available repository evidence rather than generalized guesses.

## Failure modes

- Treating installed tooling as proof of user authorization.
- Reading one README and assuming it describes live behavior.
- Creating duplicate markdown for topics with an existing canonical document.
- Treating a proposed decision as accepted because it was presented to the user.

## Stop conditions

- Finish after approved onboarding changes are verified or the user declines them.
- Stop before creating speculative domain rules or implementing application code.

## Escalation conditions

- Ask for authorization when a write would change user-owned canonical content.
- Surface source conflicts affecting business correctness, money, security, privacy or data retention.
- Stop before irreversible operations not explicitly requested.

## Verification

- Check that documented file paths exist when referenced.
- Trace every concrete statement back to supplied material or observed repository evidence.
- Report what was proposed, approved, modified and left unresolved distinctly.

## Output contract

- Evidence inventory, canonical document map and context gaps.
- Glossary bootstrap proposal containing only supported concepts.
- Approval status, file-by-file changes, verification and remaining open questions.

## Anti-patterns

- Duplicate a glossary simply to satisfy a process checklist.
- Use a hidden persistent state machine when portable text artifacts suffice.
- Generate empty ADRs or unsupported architecture stories.
- Begin implementation while approval is still outstanding.

## Example

- For a payments repository, trace existing transfer API and UI types before proposing glossary entries for transfer status.
- If the repository already has docs/domain/glossary.md, propose an addition there instead of making GLOSSARY.md.
- Never author a policy ADR just because an HTTP endpoint happens to be implemented.
