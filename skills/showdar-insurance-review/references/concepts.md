# Relationships and taxonomy

This is a conceptual checklist, not a prescribed database schema or cardinality.

## Product structure

Keep statutory insurance type, insurer LOB/sub-LOB, product, product version, plan/package, coverage/benefit and risk object separate. An insurer catalog may group health, accident or travel differently from legal categories. “Con người” is a broad business grouping, not proof of a single statutory type. Motor, health, accident, travel, property, cargo, engineering and liability are examples, not a closed enum or mandated hierarchy.

Resolve membership, cardinality and identifiers from supplied taxonomy. One product can combine risks/benefits; a plan can select or configure coverage; each relation is a hypothesis until established by product/schema sources. Product publication does not establish that a particular risk is eligible.

## Contract structure

Distinguish buyer, insured, beneficiary, payer, intermediary and insurer. They can coincide in particular cases but must not be merged by default. Identify insured objects, coverage selections, limits, exclusions, deductible mechanisms, effective period, territory and conditions. Keep quote, application/proposal, underwriting decision, contract, issued documents and payments conceptually separate even if the implementation combines them.

## Money and risk

Eligibility answers whether participation criteria are met; underwriting assesses acceptance and terms. Sum insured, insured value, liability/benefit limit and sub-limit are different concepts. A monetary limit needs currency, unit, insured subject, coverage, event/claim/period basis and aggregation/reset rules where applicable. Deductible may have fixed/percentage/minimum and per-event bases; do not invent their combination. Benefit products need not use an actual-loss indemnity calculation.

## Version and status

Separate product availability/publication, rate-table validity, quote status, application status, underwriting status, policy lifecycle, payment status, document generation and claim status. Preserve actual enum mappings. Never equate `ISSUED` with paid, in force or document delivered without source.

Use product/rate/wording/API versions and applicable dates when tracing historical contracts. Determine whether a transaction snapshots terms or resolves them dynamically; neither is prescribed here. Renewal and endorsement may select different versions only under documented rules. Concurrent configuration changes require an explicit interpretation and test oracle.
