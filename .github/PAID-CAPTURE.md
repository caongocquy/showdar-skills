# TASK-002 paid capture authorization (deployment proposal)

Live execution remains disabled. Preparing or merging this implementation is not paid execution approval. The three paid workflow jobs have literal false conditions, and the private Responses gate is false. No API key is configured by this change.

## Owner authorization

Use a protected GitHub Environment named `showdar-paid-capture`:

- Exactly one required reviewer: user `caongocquy`, immutable GitHub user ID `50620260`.
- Prevent self-review **off**, deliberately: the repository owner may authorize a deployment they initiated. This is distinct from independent behavioral grading.
- Administrator bypass **off**. Missing/unreadable bypass policy blocks authorization.
- Selected deployment branches/tags: configure exactly `{name: "main", type: "branch"}` through the policy creation API; no tags or wildcard patterns. Approval binds the returned policy ID and the observed type (null if omitted).
- REST does not guarantee a `type` response field. Missing type is **not** interpreted as branch: native authorization still requires `refs/heads/main`, cryptographic verification still requires signed `refs/heads/main`, and an authenticated matching-ref lookup must prove no exact `refs/tags/main` exists. Missing/malformed/paginated tag metadata, an explicit tag/unknown type, or a same-name tag blocks authorization. Real Environment main acceptance and unauthorized-ref rejection remain required.
- `can_admins_bypass` is not guaranteed by the published OpenAPI Environment schema. It must actually be readable as false; missing is never treated as false. Confirm its real response and GitHub settings after approved setup.
- Eventually store `SHOWDAR_PAID_CAPTURE_KEY` as an **Environment secret only**. Never use repository/organization scope for this name. Do not configure a key during this phase.

The repository currently has no Environments. Creation/configuration and real, secret-free Environment acceptance need separate deployment approval. Do not let an implicit unprotected Environment created by a workflow qualify.

## Proposed execution flow

1. Deploy reviewed trusted code to main, keeping both live gate and paid jobs disabled. Pin the actual main runner SHA; it cannot be the PR SHA.
2. Sync the evaluated PR source and re-run the signed model-free producer contract. Independently verify image archive/manifest, the three producer artifacts and both original attestation bundles. Update the expected pins for this exact runner/source/model/image.
3. Perform model-free Environment acceptance: withheld/rejected/missing approval cannot start a protected job; correct owner approval is independently observable through GitHub review history. Confirm branch restrictions and disabled administrator bypass using the separate probe below. No model key or model calls are needed. The probe is prepared but has not been deployed/dispatched here.
4. Only after separate paid authorization and a reviewed activation revision, start a fresh main workflow run, attempt **1**, with explicit `paid_capture: true` (default is false). The `prepare-paid-capture` job independently verifies readiness and publishes the complete binding plus its SHA-256 in the job summary.
5. The owner reviews that binding and approves `showdar-paid-capture` with exactly this comment, replacing the digest with the published value:

   ```text
   SHOWDAR-CAPTURE-AUTH/2
   <binding SHA-256>
   ```

   Binding includes Environment ID, runner/source/scenario/model, immutable image/build/archive/manifest, run/attempt, the complete readiness evidence pins and fixed budget: 120 seconds, 8 requests/turns, 2048 maximum output tokens per request. Planned model is `gpt-6-luna`.
6. The protected job verifies native GitHub owner identity, Environment configuration, review history and exact binding **before the workflow references the model secret**. Evaluated source is checked out as data only; no PR-controlled install, hooks, scripts or tests run in the paid job.
7. The producer verifies again and exclusively creates a host reservation. Only this operation mints a non-serializable transport capability. Same-job process replay is rejected atomically; every rerun (attempt greater than 1) is rejected. A different run requires a new owner approval and digest.
8. Transport checks the authorized model, source/scenario seed, frozen prompt, shared deadline and request/output budget before each request. Missing, copied or forged capabilities cannot start an HTTP request. No retry is performed.
9. Sign live evidence in a separate job using pinned Actions only, with no checkout or code execution. Preserve original bundles. Evidence contains the owner authorization proof and its digest. Independently verify this approval again before considering rubric review.

## Independent behavioral review

Paid authorization is never a rubric grade. Behavioral PASS/FAIL additionally requires independently verified native live evidence and a different permitted human reviewer (not the capture actor or PR author). They must classify every captured interaction and grade every frozen rubric ID, bound to the exact evidence digest and source commit. Missing, invalid or unverifiable evidence remains BLOCKED. CI-only/simulated evidence remains BLOCKED.

Any activation changes the runner SHA. Re-run PRE-PILOT acceptance after that change, before requesting approval for a concrete paid run. Do not reuse acceptance from an older revision.

## Evidence boundary

Unit tests exercise authenticated API shapes using explicit model-free fixtures; they do not prove a real Environment approval. Real protected Environment acceptance and deployment of this revision are remaining blockers. The probe approval prefix and `paidAuthorization: false` prevent probe evidence from authorizing a paid capture. This document authorizes neither setup, dispatch, live execution, BRAIN-001, merge of PR #23 nor release.

References: [Environment protections and secret release](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [authenticated workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

## Secret-free Environment acceptance probe (after separate deployment approval)

Deploy this PR with both live gates and all three paid jobs still disabled. Configure the Environment with no secrets, using exact owner user ID `50620260`, `prevent_self_review: false`, `can_admins_bypass: false`, and selected policies. Create exactly one policy with request `{ "name": "main", "type": "branch" }`; read back and preserve its ID. Read authenticated Environment/policy JSON and matching `tags/main` refs; `assertPaidEnvironment()` must pass. Do not assume a missing type means branch.

The separate `.github/workflows/behavioral-environment-probe.yml` has no secret expressions, model credential, OIDC or Responses dependency. Its only network target is the allowlisted GitHub REST helper. It cannot mint a paid transport capability. Main jobs checkout the exact main workflow SHA; no evaluated PR code is checked out or executed. The unauthorized-ref job is an inline failure sentinel with empty permissions and no checkout.

Acceptance cases (each approval case needs a fresh run, attempt 1):

1. **Withheld:** dispatch only the probe on main. Preparation must publish a digest; the protected `approve` job must stay waiting and start no runner/steps before approval. Save native run/job/pending-deployment metadata, then cancel the owned run. A canceled run cannot qualify as positive acceptance.
2. **Rejected:** reject the main probe deployment. The protected job must never execute; record the authenticated rejected review.
3. **Wrong digest:** approve a fresh main probe with an incorrect comment. GitHub may release the job, but the native verifier must fail and upload no successful result.
4. **Authorized:** approve a fresh main probe with exactly:

   ```text
   SHOWDAR-ENVIRONMENT-PROBE/1
   <published binding SHA-256>
   ```

   The protected job must succeed, producing only `environment-probe.json`, with `paidAuthorization: false`. Independently use `verifyEnvironmentProbe(token, {context: pinnedRunContext, completed: true})` from the reviewed runner code to re-fetch the successful native run, current policy and original approval. Compare the recomputed result/digest to the downloaded result; preserve authenticated records and original bytes. The probe is never paid approval or a behavioral grade.
5. **Unauthorized ref:** after explicitly approved probe deployment, use a disposable branch (and tag, if approved) pointing to the exact deployed main SHA, with unchanged reviewed workflow bytes. Dispatch only the probe. Require a GitHub Environment branch-policy denial annotation and no execution of `UNAUTHORIZED_ENVIRONMENT_JOB_STARTED`. A job failure alone is insufficient: if the sentinel ran or a runner/infrastructure failure occurred, acceptance FAILS or is INCONCLUSIVE. Do not execute or checkout PR-controlled code. Do not create negative probe refs before deployment approval.
6. **Replay/fork/stale:** native verification must reject attempt 2, another run's comment, changed policy ID, wrong runner SHA, fork metadata, tag context, and missing/unreadable security metadata. Unit fixtures prove these checks locally; real probe results are required after deployment.

Only after all cases pass, sync PR #23 with the approved main deployment and re-run the signed model-free producer contract against its fresh exact source/runner/model/image. Independently verify the image and all three producer files with both original bundles and repeat copy-based tamper/replay/wrong-image/wrong-signer/stale-source checks. Neither that contract nor this probe authorizes live execution. Any later activation changes the runner identity and needs fresh acceptance.

If real bypass metadata cannot be authenticated, keep authorization BLOCKED and investigate a reviewed authenticated policy source; do not remove the check.

Schema references: [GitHub canonical REST description](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json), [branch policy REST response and creation request](https://docs.github.com/en/rest/deployments/branch-policies), [Environment restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
