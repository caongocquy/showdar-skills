---
name: showdar-insurance-review
description: Use when reviewing insurer UI labels, business models, API/schema mappings, validation, edge cases or Dev/QA scenarios for insurance terminology and business correctness.
---


# Insurance terminology and contract review

## Purpose

Review the requested feature with [source
protocol](references/source-protocol.md). Read the
[glossary](references/glossary.md) and
[concepts](references/concepts.md) only for relevant concepts.
Use [review and QA checklist](references/review-qa.md) for
mapping and scenarios. This skill can be installed on its own.

## Workflow

1. Identify market, insurer, product/version, API version, module, supplied requirements and actual code/UI/schema evidence. Scope findings; one motor sample cannot define unrelated products.
2. Follow the relevant value from UI input/label through domain model to exact request/response path, enums, transforms and displayed result. Record reverse mappings and any information lost. If implementation evidence is unavailable, review documents only and state that boundary.
3. Check meaning, roles, financial units, limit basis, dates, lifecycle states and document identifiers against applicable sources. API field names are not business definitions. Keep insurer aliases and approved UI terms explicit.
4. Distinguish a demonstrated mismatch from a missing requirement, a candidate improvement and a source conflict. Conflicts require verification; do not silently select a preferred interpretation.
5. Produce relevant QA scenarios with source-backed expected results. Mark unresolved business expectations as `blocked by rule confirmation`; technical checks may still proceed independently.

## UI writing

Use approved insurer operations terminology where available.
Otherwise propose a label as `candidate`, explain its meaning
and request confirmation when it changes business
interpretation. Helper text may clarify units, scope and
consequences only if documented. Never add a promise of
coverage, refund, approval, effective date or payment SLA
without a source. Retain accessibility basics and do not expose
raw implementation details unless useful to the operator.

## Review severity

Describe the consequence in business terms: wrong insured role,
misleading cover, incorrect amount, lost product version,
invalid effective time or unreconciled insurer outcome. Tie a
confirmed defect to the exact field, screen, API path or
transition. Do not assign severity from financial size or legal
impact without the team's supplied scale.

Treat missing evidence as a gap, not an implementation defect.
State the artefact and decision owner needed to close it when
known. Continue independent schema, accessibility and technical
checks while a business-rule answer is pending.

For UI/API review, distinguish formatting from meaning:
localized currency display does not prove the wire currency; a
percentage label does not define its base; date-only display
does not reveal timestamp timezone or interval boundaries. Keep
raw enum values available in diagnostic evidence without
presenting them as operator-facing wording unless that is
explicitly intended.

For QA review, use a sourced expected value only within its
insurer/product/version scope. A sample payload verifies that
sample's representation; it is not a pricing formula or coverage
oracle by itself. Record unresolved output as conditional or
blocked by rule confirmation.

## Output contract

Use only sections needed for the request:

- Findings: `location | observed term/behavior | expected meaning + source | scope | impact | correction or verification needed`.
- Mapping: `UI label/helper | domain concept | API path/type/enum | transform/units | source | evidence status`.
- QA: `scenario | scope/version | rule source | Given/When/Then | boundary/failure | expected result or blocking question`.

Do not claim tests ran, stakeholder sign-off, legal compliance
or implementation readiness based on a document review. Preserve
real identifiers; example identifiers must be explicitly
hypothetical.

## Example

Example: BA says a sub-limit is per event; API docs say per
year. Report the conflict and each interpretation's test oracle.
Do not relabel the field “Số tiền bảo hiểm” or pick BA merely
because its version number is higher.

## When to use
Review insurance terminology and business mappings in a supplied
UI, model, schema, API, diff or QA scope.
## When not to use
Do not perform a whole-repository engineering audit or change
implementation unless the user requests that work.
## Inputs and assumptions
Use scoped product rules, approved glossary, actual
UI/code/schema and representative redacted samples where
available.
## Non-negotiable rules
Separate defects, gaps and conflicts. A proposed UI label
remains a candidate until supported by an applicable definition.
## Decision points
Known source mismatch: report a finding. Absent business
definition: report a gap. Contradictory sources: request
verification.
## Stack detection
Follow actual form fields, validation, model serialization and
API callbacks when implementation is supplied. Do not infer
business semantics from the UI component type, database column
or API key.
## Failure modes
A schema-valid payload can carry the wrong unit or party role.
UI wording can imply cover or settlement that has not occurred.
## Stop conditions
Do not provide an unconditional business test oracle where a
coverage, money or effective-state rule remains unresolved.
## Escalation conditions
Ask the appropriate BA/product/integration owner to confirm
conflicting meanings or missing alias and enum definitions.
## Verification
For each monetary field check its currency and calculation
basis. For each limit check its person/object/event/period
scope. For each lifecycle enum check which business authority
defines the transition. For each UI promise check the wording or
SOP that supports it. Verify mappings in both directions, actual
source locations, scope/version, and the origin of each expected
result. State document-only versus runtime-tested evidence
accurately; do not promote a checklist into executed-test
evidence.
## Anti-patterns
Relabelling a sub-limit as sum insured, inventing refund
promises in helper text, or calling observed API behavior an
approved rule.
