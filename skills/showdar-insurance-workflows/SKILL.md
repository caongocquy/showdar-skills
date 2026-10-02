---
name: showdar-insurance-workflows
description: Use when insurer features involve product configuration, underwriting, rating, quotes, issuance, collection, endorsements, renewals, cancellation or claims business flows and validation rules.
---


# Insurance business workflows

## Purpose

Use insurance concepts across lines of business; do not
extrapolate HDI/motor rules. Read [source
protocol](references/source-protocol.md),
[glossary](references/glossary.md) and the relevant [lifecycle
checklist](references/lifecycle.md). This skill can be installed
on its own.

## Workflow

Identify known scope and evidence. Separate existing
implementation, requested behavior and conceptual possibilities.
Map actor, trigger, preconditions, inputs, decision owner,
transitions, outputs/documents, money movements and
failure/recovery paths. The lifecycle checklist is a question
set, not a universal sequence or a promise the system implements
every stage.

For each rule record: `rule | classification (legal/industry
concept/insurer/product/technical) | exact scope and version |
source/location | condition | result | exception | evidence
status`. A generic concept describes a distinction; it does not
supply a mandatory operational rule. Unknown thresholds,
permissions, formulas, SLAs and status transitions stay unknown.

Trace product configuration into application, rating/quote,
accepted terms, contract and downstream servicing/claims where
relevant. Capture separate business-effective time, recorded
time and event time. Do not assume collection precedes issuance,
issuance grants cover, a quote binds the insurer, or renewal
preserves the same terms.

For pricing, extract inputs, rate-table/version selection,
calculation order, bases/units, discounts/loadings, taxes/fees,
prorating, rounding and authority from applicable docs. Never
derive `premium = sumInsured × rate` from field names or
samples. Unknown monetary rules block a final formula and
unconditional expected amounts.

If sources conflict, return both interpretations and the
affected decisions for verification. Continue unaffected
analysis. API success proves only documented API success; it
cannot establish coverage or payment settlement by inference.

Before drawing transitions, check whether policy, payment and
document generation have independent lifecycles. A successful
transition in one does not imply a transition in another. Track
correlation IDs and idempotency rules only when the actual
integration contract defines them.

When terms or configurations change, identify whether the
transaction uses a snapshot or resolves the active version at
runtime. Use the version attached to the source artefact, not a
current catalog value, unless version selection is documented as
dynamic.

For limits, record the applicable person, item, event, claim,
time window and aggregate. Add boundary tests for the documented
unit and scope. Do not assume unused limit resets, carries
forward, or combines with another coverage.

## Output contract

For the requested flow give:

1. Known scope, sources and evidence boundaries.
2. Actors and a transition table: `from | trigger | guard/rule source | action | resulting state | failures/recovery`. Use actual enums if known; label conceptual states as candidates.
3. Rule matrix and links to affected data/documents/money.
4. Relevant alternate/negative/boundary cases and unresolved decisions.

Use Mermaid only if it clarifies actual branching. Do not hide
unknown edges in a polished diagram. Stop short of
implementation-ready sign-off while an unresolved rule changes
cover, money, authority or legal meaning.

## Example

Example: `ISSUED` in a sample plus a payment webhook does not
define an in-force rule. Ask for contractual effective
conditions and SOP/API transitions, then give separate
conditional flows until verified.

## When to use
Analyze insurance lifecycle flows and validation rules for the
requested product/module, including rating and claims.
## When not to use
Pure vocabulary tasks belong to `showdar-insurance-domain`.
Technical workflow orchestration or code implementation needs
its own scope.
## Inputs and assumptions
Read applicable SOP, wording, BA/spec, pricing documentation and
API contracts. Examples alone do not establish rules.
## Non-negotiable rules
Distinguish contractual, operational and technical state. Attach
scope and source to guards, calculations and transitions.
## Decision points
Documented rule: use its scoped result. Missing rule: give a
question or candidate. Conflict: show conditional paths.
## Stack detection
Use actual API/model/event identifiers when available. A
callback or HTTP status cannot supply an undocumented business
transition.
## Failure modes
A linear flow hides parallel payment and document states. A
single pricing example hides rate selection and rounding rules.
## Stop conditions
Leave monetary formula, cover activation or irreversible
transition unresolved when the decisive rule is missing or
conflicting.
## Escalation conditions
Request verification of the affected rule, applicable version
and decision authority; continue unrelated flow analysis.
## Verification
Trace each guard and expected outcome to a source. Check
relevant boundaries, duplicate and failure/recovery cases.
Confirm conceptual stages are labelled and not presented as
implemented modules or real enums.
## Anti-patterns
Assuming pay-before-issue, treating ISSUED as in force, choosing
the newest conflicting source, or copying motor risk rules to
health.
