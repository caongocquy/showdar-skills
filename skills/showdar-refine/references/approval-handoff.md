# Approved Decision Brief and handoff

A brief contains Goal, Context evidence, Scope, Non-goals, Decisions (stable DEC identifiers), Alternatives and trade-offs, Assumptions, Acceptance notes, Open questions, Approval revision and Next skill.

States: skipped, needs-input, ready-for-approval, approved. Do not silently promote from needs-input or ready-for-approval.

When triggered, request explicit acceptance of the whole brief, not approval inferred from individual answers. Never begin implementation from a draft.

Adaptive persistence: update existing canonical spec/ticket only with approval, otherwise write docs/specs/<feature>.md when cross-session or complex handoff justifies it. In-session small approved briefs may remain in chat, but do not assume another session can recover the approval.

Do not store mutation permissions inside a workflow checkpoint. Require fresh repository authority for writes, commits or publication.
