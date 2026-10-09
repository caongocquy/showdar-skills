---
name: showdar-refine
description: Use when a feature idea or implementation request has unresolved product or architecture decisions that require interactive refinement and explicit spec approval.
---

# Showdar Refine

## Purpose

- Offer a standalone portable Agent Skill that works without any Showdar executable.
- Reuse existing repository conventions and the user's authoritative requirements.
- Separate observations, assumptions, proposals, approvals, and mutations.
- Keep outcomes useful for the next engineering stage without creating a second router.

## When to use

- A proposed feature has conflicting behaviors, missing states or business-rule choices.
- Several viable architectural approaches differ in public contract, persistence or compatibility.
- The user explicitly asks to brainstorm, grill, refine or challenge a feature concept.

## When not to use

- The task already has approved scope, acceptance and design decisions.
- A localized bug has a proven root cause and agreed fix.
- The user asks only for testing, review or operational status.

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

## Workflow

- Start read-only: inspect request, canonical spec/ticket, relevant repository context and existing ADR/glossary.
- Classify readiness from evidence; skip refinement when outcomes and important decisions are already specified.
- If triggered, identify the single highest-impact unresolved decision rather than many decorative questions.
- Ask one targeted question at a time; when helpful give two or three feasible options with consequences.
- Challenge assumptions and negative paths, permissions, state, rollback, compatibility and data integrity.
- Do not ask the user to repeat a decision already clearly recorded.
- Draft a concise Decision Brief: goal, scope, non-goals, decisions with IDs, alternatives, acceptance notes and blockers.
- Show the complete proposed spec and request explicit approval; a response to one question is not approval for the whole brief.
- On changes, revise the brief and ask approval again; do not implement while waiting.
- After approval, prefer an existing canonical spec or ticket; save to docs/specs only for complex durable handoffs with file approval.
- For a small one-session task, keep the approved brief in conversation; never claim chat memory persists across sessions.
- Handoff the approved brief and exact decisions to showdar-requirements or showdar-plan without repeating the interview.
- If later evidence contradicts an accepted decision, reopen only affected decisions and request fresh approval.

## Decision points

- Trigger on material product/architecture ambiguity, not prompt length or number of modified files.
- Skip only with explicit evidence of defined behavior and no blocking decision.
- No architecture tradeoff? Do not invent alternatives merely to fill a matrix.
- Approved design does not grant Git, file mutation or deployment authority.

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

- Do not enter implementation without full spec approval once refinement has run.
- Stop with needs-input when an unresolved decision materially changes implementation.
- Stop with ready-for-approval until explicit user acceptance.
- End as approved only after a clear confirmation of a specific brief or revision.

## Escalation conditions

- Ask for authorization when a write would change user-owned canonical content.
- Surface source conflicts affecting business correctness, money, security, privacy or data retention.
- Stop before irreversible operations not explicitly requested.

## Verification

- Check that documented file paths exist when referenced.
- Trace every concrete statement back to supplied material or observed repository evidence.
- Report what was proposed, approved, modified and left unresolved distinctly.

## Output contract

- Status: skipped | needs-input | ready-for-approval | approved.
- Approved brief with decision IDs, alternatives, assumptions, acceptance notes and unresolved questions.
- Next skill suggestion, evidence and persistence location if any; no invented approval authority.

## Anti-patterns

- Duplicate a glossary simply to satisfy a process checklist.
- Use a hidden persistent state machine when portable text artifacts suffice.
- Generate empty ADRs or unsupported architecture stories.
- Begin implementation while approval is still outstanding.

## Example

- For checkout vouchers, ask whether stacking is allowed before choosing a pricing algorithm.
- When the user accepts the complete voucher brief, hand off approved stacking and expiry rules.
- An already-specified one-line validation change should skip refinement entirely.
