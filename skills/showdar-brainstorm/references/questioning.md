# Questioning and skip policy

Read source evidence and previously accepted decisions first. Define a blocking decision as one whose alternatives materially affect product behavior, architecture, data integrity or compatibility.

Ask one high-leverage question per response, optionally with two or three real alternatives. Prefer specific examples and negative paths over generic surveys.

Skip if acceptance, behavior and significant decisions are already clear; do not force a feature into refinement for ceremony. When triggered, record explicit user acceptance of the entire resulting Decision Brief.

## Converge material blockers

- Separate supplied facts, repository observations, assumptions and unresolved decisions; preserve exact source/artifact references and revisions. Evidence of current code is not a product decision.
- Reuse approved decisions and answers from the current accepted Brief/spec. Deduplicate questions first; preserve existing IDs and revisions for unchanged decisions.
- Rank blockers by downstream impact and dependency blocking. Permissions/data integrity or choices invalidating many tasks precede isolated details; break ties by earliest blocked dependency. Ask only the single highest-impact necessary question, with evidence, viable alternatives and consequences. A settled question needs a source citation, not another interview.
- Record the answer as a proposed user decision with its source. Revise only affected decisions and the proposed Brief, retaining previous revisions/approval history. Recheck affected links; conflicting evidence must reopen only affected decisions.
- Partial answers or approval of one choice never approve the whole Decision Brief revision. Present the complete current revision for explicit approval under the existing refinement gate, while reusing unchanged approved choices.
- Stop implementation while an unresolved decision materially changes behavior, permissions, architecture or data integrity. Carry blockers explicitly; never hide them in implementation assumptions.

Return Converge status `RESOLVED | NEEDS_INPUT | BLOCKED`, remaining decisions and next owner, alongside the existing Brief status (skipped, needs-input, ready-for-approval, approved). `RESOLVED` describes ambiguity only: it does not make an unapproved Brief approved, change workflow state, or grant mutation authority. Pass source references/revisions, stable decision IDs and approval evidence to Requirements/Plan. A sufficiently defined task skips the loop and gains no new gate.
