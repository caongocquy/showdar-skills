---
name: showdar-domain-model
description: Use when clarifying shared domain terminology, maintaining an evidence-backed glossary, or documenting confirmed architectural decisions as ADRs.
---

# Showdar Domain-Model

## Purpose

- Offer a standalone portable Agent Skill that works without any Showdar executable.
- Reuse existing repository conventions and the user's authoritative requirements.
- Separate observations, assumptions, proposals, approvals, and mutations.
- Keep outcomes useful for the next engineering stage without creating a second router.

## When to use

- Several modules use inconsistent names for the same domain concept.
- An agreed cross-feature definition, alias or state transition should be preserved.
- A meaningful architectural choice has been explicitly decided with alternatives and trade-offs.

## When not to use

- An isolated variable rename does not change canonical terminology.
- A UI preference has no project-wide architecture consequences.
- No meaningful domain or architectural decision occurred.

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

Read `references/glossary.md` and `references/adr.md` only when that depth of detail is needed; these references are packaged inside this skill for skills-only installers.

## Workflow

- Discover canonical glossary, ADR, domain docs and previous decisions first.
- Read the smallest relevant context; separate domain facts from observed implementation.
- For glossary candidates record term, definition, aliases, boundaries, source and conflicts.
- Distinguish genuinely new terms from synonyms and legacy names.
- For an ADR candidate record context, explicit decision, considered alternatives, consequences and evidence of approval.
- Avoid ADRs describing implementation details that were never a chosen policy.
- Present proposed targeted edits to the canonical locations before writing.
- Request approval for proposed glossary/ADR changes and respect repo/Git write protections.
- If approved, update the canonical glossary or append the next appropriate ADR without overwriting prior decisions.
- For superseded ADRs preserve history and add explicit supersession links rather than quietly rewriting accepted decisions.
- If no significant change exists, return a no-change report; do not generate documents.
- Link feature specs to relevant domain terms and ADRs rather than copying full contents into each spec.

## Decision points

- Read when relevant; propose on material domain change; write only after approval.
- Use existing GLOSSARY.md, docs/glossary.md or project convention; never create duplicates.
- An ADR requires a confirmed choice with actual trade-offs, not merely an inferred pattern.
- For minor terminology edits use glossary only; for technical policy trade-offs consider ADR.

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

- Stop before persisting unconfirmed terminology or architectural choices.
- Stop when proposal is approved and verified or when no changes are warranted.

## Escalation conditions

- Ask for authorization when a write would change user-owned canonical content.
- Surface source conflicts affecting business correctness, money, security, privacy or data retention.
- Stop before irreversible operations not explicitly requested.

## Verification

- Check that documented file paths exist when referenced.
- Trace every concrete statement back to supplied material or observed repository evidence.
- Report what was proposed, approved, modified and left unresolved distinctly.

## Output contract

- Canonical paths and evidence-linked terminology or decision changes.
- Proposed diff with approval status, conflicts and deferred decisions.
- Verification and consumers affected by the accepted changes.

## Anti-patterns

- Duplicate a glossary simply to satisfy a process checklist.
- Use a hidden persistent state machine when portable text artifacts suffice.
- Generate empty ADRs or unsupported architecture stories.
- Begin implementation while approval is still outstanding.

## Example

- Define Package as the accepted insurance product unit and mark Plan as a legacy alias only with supporting evidence.
- Record an accepted persistence strategy as an ADR after the user agrees to real alternatives.
- Do not issue an ADR for switching a two-option field from dropdown to radio.
