# Lifecycle questions by module

Read only relevant rows. Each question requires scoped evidence before becoming a rule.

| Module | Concepts / decisions to resolve | Alternate or boundary cases to inspect |
| --- | --- | --- |
| Product management | Taxonomy; identifiers; product/wording/rate versions; draft/approval/publication/retirement; authority; applicable dates | Overlapping versions, future activation, retired product with existing contracts, concurrent edits |
| Coverage configuration | Covered risks/benefits; compulsory/optional items; dependencies; exclusions; territory; limits/sub-limits; deductible | Incompatible selections, aggregation, person/item/event/period bases, missing units |
| Risk/application/proposal | Buyer/insured/payer roles; object/person data; declarations; documents; consent; submission authority | Incomplete risk data, multiple objects/insureds, correction/resubmission, duplicates |
| Eligibility/underwriting | Eligibility criteria versus acceptance decisions; referral; authority; additional conditions/documents | Ineligible versus referred, conditional acceptance, decline, expired decision, re-underwriting |
| Plans/packages | What a plan controls; optional selections; coverage/limit/deductible values; aliases | Code/name mismatch, unavailable plan, plan changes invalidating quote, insurer-specific grouping |
| Pricing/rating | Rate-table dimensions/version; fixed or variable premium; discounts/loadings; tax/fee; currency; precision/order | Tier boundaries, overlapping/no matching rate, missing rate, minimum premium, prorating, negative adjustment |
| Quote | Inputs and selected terms; underwriting relation; validity; acceptance; binding status; version reference | Expiration, changed risk/configuration, stale acceptance, requote, multiple offers |
| Issuance/documents | Acceptance and issuance authority; contract/GCNBH relationship; numbering; effective conditions; wording/schedule | Pending/failed issuance, missing document, duplicate request, timeout after insurer success |
| Effective period | Start/end timezone and inclusivity; retroactive/future dates; conditions; waiting periods if applicable | Date-only versus timestamp, leap day, event on boundary, issue time different from inception |
| Collection/payment | Amount due, currency, payer; installments/credit terms if specified; payment/collection/settlement/reconciliation | Partial/overpayment, failed/late payment, duplicate/out-of-order webhook, reversal, unallocated receipt |
| Endorsement | Permitted changes; effective date; approval; revised terms/documents; additional/refund premium | Backdating, overlapping changes, concurrent endorsement/claim, pending endorsement at expiry |
| Renewal | Offer and acceptance; eligibility; version/rates; continuity; documents/identifiers | Changed terms, lapsed cover, non-renewal, duplicate renewal, pending claim relevance if documented |
| Cancellation/termination | Distinguish legal mechanism, requesting party, authority, effective date, notices, refunds | Issued versus unissued request, pending claim/payment, partial refund, failed refund, reinstatement if defined |
| Claims | Notification; required evidence; event-date cover; eligibility for benefit/indemnity; assessment; decision; reserve if in scope; payment | Missing docs, exclusion, waiting period, exhaustion, duplicate/reopened claim, partial approval, multiple beneficiaries |
| Insurer API integration | Operation semantics; versions; authentication; correlation; idempotency; callbacks; reconciliation; source of business status | Success with missing business result, timeout after success, stale enum, callback before response, duplicate document/policy |

## Flow composition

Product definition/configuration informs eligibility, rating and coverage decisions. Applications and quotes may appear in different orders or share an entity. Underwriting may happen before or after a provisional quote. Issuance and collection ordering must come from the applicable contract/SOP. Endorsements, renewals and cancellation are servicing branches; claims can interact with them rather than follow them in a single linear chain.

## Test oracles

Every expected result needs a sourced rule and version. Numerical examples supplied by an insurer are usable oracles only within their scope; they do not prove the entire formula. Technical idempotency requirements and business duplicate detection are distinct. For unresolved retry semantics, propose checks and reconciliation questions rather than authorizing a blind retry of payment or issuance.
