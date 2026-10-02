---
name: showdar-insurance-domain
description: Use when Vietnamese insurer work involves insurance terminology, product taxonomy, coverage concepts, VI/EN glossary, or insurer/product-specific vocabulary.
---


# Insurance domain

## Purpose

Reason in insurance business language and preserve exact
mappings to implementation identifiers. This is a multi-line
insurer domain: motor, health, accident, travel, property,
cargo, engineering, liability, personal insurance and other
supported products. HDInsurance/HDI or motor examples never
establish the whole system's scope. Do not assume modules
already exist.

## Sources and scope

Read [source protocol](references/source-protocol.md) for every
domain task. Read [glossary](references/glossary.md) for
terminology and [concepts](references/concepts.md) for
relationships/taxonomy. Load only relevant sections.

For each term, keep five layers separate: industry meaning,
insurer alias, product/version meaning, UI label, exact
technical/API identifier. A likely translation is a candidate,
not an approved insurer term. `planCode` alone does not
establish whether its meaning is a gói, chương trình, phương án
or technical grouping.

Keep VI accents; prefer language used by insurer operations.
Preserve an insurer's approved wording within its scope and
record aliases instead of overwriting a shared term. Do not
translate JSON keys, enums or identifiers. Avoid literal
translations such as policy → “chính sách” or premium → “cao
cấp”. Do not equate application, quote, contract and
certificate.

## Workflow

1. Identify the requested module and known market, insurer, product, product version and API version. Unknown scope stays explicit; ask only for missing context that changes the answer.
2. Extract exact terms and source locations from supplied glossary, wording, BA/spec, SOP, API/schema, screenshots and sample data.
3. Match by meaning, not spelling. Explain distinctions and relationships before suggesting labels or mappings. Label observed code behavior separately from business requirements.
4. Record conflicts and ask for verification of the affected interpretation. Continue independent analysis; do not choose the newer document, more convenient term or API name as business authority.

## Term resolution

- Use the legal Vietnamese term for statutory roles and concepts when the applicable
legal source defines it. Label its EN rendering as a working
translation unless a bilingual authority confirms the English
term.
- Use wording, schedule and endorsements to interpret product coverage and exclusions.
Keep the exact product/version and effective scope with each
term.
- Use the insurer glossary and SOP for approved operator vocabulary. Preserve a
differing local alias alongside the normalized domain concept.
- Use API contracts for wire spelling, enum values, types and null behavior. Do not
silently promote technical names to product names or visible UI
labels.
- Use observed screens and implementation to report what exists. Keep observations
distinct from approved or requested behavior.
- When one displayed label maps to several API values, or an API value has several
product-specific meanings, show the conditional mapping instead
of flattening it.
- When sources conflict, preserve both meanings, source versions and the affected
decision. Ask which source governs that scope.

## Output contract

Produce only the requested scope. A glossary/mapping uses:

| VI term | EN term | Meaning/distinction | Insurer/product alias | UI label | API path/type/enum | Scope | Source/location | Evidence status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Use `unknown` for missing API mappings and `candidate` for
unapproved labels. Add relationships and unresolved conflicts
when relevant. Do not generate invented identifiers to fill the
table.

## Example

Example: a sample `planCode: "A"` proves only that the sample
contains that field/value. Report its business meaning and UI
label as unresolved until a glossary, contract or BA definition
establishes them.

## When to use
Analyze insurer terminology, taxonomy, business concepts or
glossary mappings across any supported line of business.
## When not to use
For state transitions or rule derivation use
`showdar-insurance-workflows`; for implementation/UI QA use
`showdar-insurance-review`.
## Inputs and assumptions
Use supplied glossary, BA/spec, wording, SOP, API/schema and
scoped samples. No insurer-specific source is bundled.
## Non-negotiable rules
Keep source, scope and evidence status attached to each mapping.
A seed translation is not an approved UI label.
## Decision points
Exact approved mapping available: preserve it. Meaning
uncertain: keep mapping unknown. Conflicting definitions: report
both.
## Stack detection
Identify actual models and API versions only when mapping to
implementation. Framework choice cannot define insurance
meaning.
## Failure modes
Same word can refer to different concepts across products.
Apparent synonyms can hide different monetary or legal effects.
## Stop conditions
Do not finalize a mapping that would change money, coverage,
party role or contractual meaning without evidence.
## Escalation conditions
Ask for the applicable glossary or business-owner verification
when context cannot distinguish competing meanings.
## Verification
Check that each mapping distinguishes legal taxonomy from
catalog grouping. Check that health, personal insurance and
non-life are not collapsed by analogy. Verify an alias is
recorded with its insurer and applicable product/version. Keep
source-backed wording separate from proposed operator-facing
wording. Check every asserted API identifier against the
contract; every insurer alias against its scoped source. Check
translations preserve the distinctions in the relevant concepts
reference.
## Anti-patterns
Guessing a gói from planCode, rewriting API enums into
Vietnamese, or treating an insurer sample as an industry
standard.
