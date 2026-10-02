# Working VI ↔ EN glossary

No API field names are asserted here. Fill actual paths, types and enums only from the target contract. `VN-legal-term` anchors the Vietnamese term to original Article 4; EN equivalents remain working translations. `candidate` means common working vocabulary requiring applicable insurer/product confirmation. Alternatives are context-dependent, not interchangeable synonyms.

| VI | EN | Distinction / mapping caution | Evidence |
| --- | --- | --- | --- |
| Doanh nghiệp bảo hiểm | Insurer / insurance company | Distinguish from broker, agent and reinsurer | VN-legal-term |
| Bên mua bảo hiểm | Policyholder / proposer (context-dependent) | Contracting party; proposal-stage role needs separate mapping | VN-legal-term |
| Người được bảo hiểm | Insured / insured person | Not necessarily the buyer | VN-legal-term |
| Người thụ hưởng | Beneficiary | Not automatically the insured | VN-legal-term |
| Hợp đồng bảo hiểm | Insurance contract / policy | Document and contract entity may differ | VN-legal-term |
| Phí bảo hiểm | Insurance premium | Not sum insured or a generic service fee | VN-legal-term |
| Sự kiện bảo hiểm | Insured event | Not every reported incident qualifies | VN-legal-term |
| Bảo hiểm nhân thọ | Life insurance | Do not force into non-life taxonomy | VN-legal-term |
| Bảo hiểm phi nhân thọ | Non-life insurance | Legal category and insurer catalog may differ | VN-legal-term |
| Bảo hiểm sức khỏe | Health insurance | Preserve its legal/product classification | VN-legal-term |
| Nghiệp vụ bảo hiểm | Line of business (LOB) | LOB is not automatically a statutory category | candidate |
| Phân nhóm nghiệp vụ bảo hiểm | Sub-line of business | Name and hierarchy are insurer-specific | candidate |
| Sản phẩm bảo hiểm | Insurance product | Distinguish from plan and product version | candidate |
| Quy tắc, điều khoản bảo hiểm | Policy wording / terms and conditions | Identify exact document/version | candidate |
| Phạm vi bảo hiểm | Coverage / scope of cover | Specify insured risks and conditions | candidate |
| Quyền lợi bảo hiểm | Insurance benefit | Coverage item may describe a risk rather than a benefit | candidate |
| Điều khoản loại trừ | Exclusion clause | Not just a validation error | candidate |
| Điều kiện tham gia bảo hiểm | Eligibility criteria | Distinguish from underwriting decision | candidate |
| Giấy yêu cầu bảo hiểm / yêu cầu bảo hiểm | Proposal form / insurance application | Distinguish document from request entity | candidate |
| Người yêu cầu bảo hiểm | Proposer / applicant | Map to buyer only when defined | candidate |
| Đối tượng bảo hiểm | Subject matter insured / insured object | Can concern persons, assets or liability | candidate |
| Thông tin rủi ro | Risk information | Varies by product | candidate |
| Thẩm định bảo hiểm / thẩm định rủi ro | Underwriting | Distinguish from claim assessment | candidate |
| Chuyển thẩm định / trình phê duyệt | Underwriting referral | Not automatically rejection | candidate |
| Chương trình / gói / phương án bảo hiểm | Plan / package | Resolve per product; no universal one-to-one mapping | candidate |
| Số tiền bảo hiểm | Sum insured | Not insured value or premium | candidate |
| Giá trị bảo hiểm | Insured value | Do not equate with sum insured without evidence | candidate |
| Hạn mức trách nhiệm / giới hạn quyền lợi | Limit of liability / benefit limit | Name depends on liability or benefit context | candidate |
| Hạn mức phụ / giới hạn phụ | Sub-limit | Needs unit, scope and aggregation basis | candidate |
| Mức khấu trừ / mức miễn thường | Deductible / excess | Preserve wording; deductible and franchise mechanisms may differ | candidate |
| Đồng chi trả | Co-payment / co-insurance (benefit context) | Not automatically insurer-level đồng bảo hiểm | candidate |
| Tỷ lệ phí bảo hiểm | Premium rate | Not necessarily a percentage of sum insured | candidate |
| Bảng phí / biểu phí | Rate table / tariff | Dimensions, version and dates matter | candidate |
| Tính phí bảo hiểm | Rating / premium calculation | Distinguish calculation from pricing governance | candidate |
| Định phí bảo hiểm | Pricing | Do not infer a formula | candidate |
| Giảm phí | Premium discount | Basis and order require source | candidate |
| Tăng phí / phụ phí | Loading / surcharge | Alias and calculation basis require source | candidate |
| Báo giá bảo hiểm | Insurance quote / quotation | Not automatic acceptance or cover | candidate |
| Phát hành hợp đồng / đơn bảo hiểm | Policy issuance | Not automatic effectiveness | candidate |
| Giấy chứng nhận bảo hiểm (GCNBH) | Certificate of insurance | Do not equate certificate number with policy ID | candidate |
| Thời hạn bảo hiểm | Period of insurance | Distinguish from issue timestamp | candidate |
| Thời điểm bắt đầu hiệu lực | Effective date/time / inception | Requires timezone and boundary semantics | candidate |
| Sửa đổi, bổ sung hợp đồng | Endorsement / amendment | Wording and legal effect are scoped | candidate |
| Tái tục | Renewal | Not automatic extension of same terms/version | candidate |
| Hủy bỏ / chấm dứt hợp đồng | Cancellation / termination | Distinct legal effects; do not merge labels | candidate |
| Thu phí bảo hiểm | Premium collection | Not payment authorization alone | candidate |
| Đối soát thanh toán | Payment reconciliation | Provider event and accounting outcome differ | candidate |
| Hoàn phí bảo hiểm | Premium refund | Not claim payment | candidate |
| Thông báo tổn thất / sự kiện bảo hiểm | Loss notification / first notification of loss (FNOL) | Does not establish claim acceptance | candidate |
| Hồ sơ / yêu cầu bồi thường | Claim file / insurance claim | A technical claim may instead mean token attribute | candidate |
| Giám định tổn thất | Loss assessment / loss adjusting | Distinguish from underwriting | candidate |
| Giải quyết bồi thường / trả tiền bảo hiểm | Claims handling / settlement | Choose wording for indemnity or benefit product | candidate |
| Chi trả bồi thường / quyền lợi | Claim payment / benefit payment | Approval and actual payment are different states | candidate |
| Thời gian chờ | Waiting period | Not generic payment grace period | candidate |
| Bệnh có sẵn | Pre-existing condition | Product definition and exclusions required | candidate |
| Thế quyền | Subrogation | Applicability requires legal/product source | candidate |

## Resolve common traps

- `policy`: insurance context may mean contract/issued policy; security context may mean authorization policy. Read usage first.
- `benefit`: contractual right, not “lợi ích” by mechanical translation. `coverage`: use phạm vi or quyền lợi according to the item definition.
- `limit`: retain per person, per item, per event, per claim, per period/year and aggregate dimensions. Do not collapse into số tiền bảo hiểm.
- `excess`: can refer to deductible or excess insurance layers. Read the wording; never replace all occurrences automatically.
- `premium`: identify quoted, payable, collected, refunded and additional premium separately. Do not infer VAT inclusion, currency or rounding from one amount.
