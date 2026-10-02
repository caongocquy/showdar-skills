# Mapping and QA checklist

## Mapping completeness

For the relevant values record actual VI/EN labels, approved aliases, domain concept, JSON path, type, enum/value meaning, unit/currency, null/omitted/zero semantics, precision, timezone, cardinality and source/version. Unknown entries stay unknown. Check both request construction and response rendering. Do not infer a field's business meaning from its name or a sample alone.

Look for: plan versus product confusion; buyer versus insured; coverage versus benefit; sum insured versus limit; deductible versus co-payment; premium versus payable/collected amounts; quote versus policy; policy number versus certificate number; issued versus effective; cancellation versus termination; claim decision versus claim payment.

## Scenario selection

Choose cases related to actual scope rather than emitting every case below. A scenario has actor/precondition, input/action, sourced expected result and applicable version. For gaps, give conditional results and the question needed to choose them.

| Area | Cases worth considering |
| --- | --- |
| Terminology | Different insurers use different aliases; same alias means different concepts; UI translation and API code disagree |
| Taxonomy | Health/travel/property/cargo/liability examples; composite products; new LOB without motor assumptions |
| Validation | Required/optional/null/omitted/zero; role-specific permissions; unsupported coverage combinations; eligibility versus referral |
| Rating | Exact documented example; bracket boundaries; discount/loading order; rounding; taxes; minimum premium; no matching rate |
| Limits | Per object/person/event/claim/period; aggregate exhaustion/reset; sub-limit alongside main limit; deductible basis |
| Versions | Historical contract after configuration update; rate/wording version change; old API response; retired product servicing |
| Dates | Effective start/end boundaries; date-only input; timezone conversion; waiting period; event date versus reported date |
| Transactions | Duplicate submit/webhook; timeout after insurer success; out-of-order events; partial payment; reconciliation; reversal |
| Servicing | Endorsement changing risk/price; renewal with new terms; cancellation/refund while payment or claim pending |
| Claims | Reported event not established as covered; missing evidence; approved/rejected/partial decision; limit exhaustion; failed payment |
| Documents | Policy/GCNBH numbering and linking; wording version; failed generation; stale download; regenerated document |

## Meaningful review verdict

Report demonstrated defects separately from evidence gaps. Name affected locations and business consequences. A technical integration can conform to its schema while its business mapping remains unresolved. Document-only review cannot prove runtime correctness. If money/coverage/state authority is unresolved, explain what blocks the affected feature; do not block independent glossary or schema observations.
