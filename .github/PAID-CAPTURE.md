# TASK-002 paid capture authorization (activation proposal)

This unmerged activation proposal permits only explicit paid opt-in on a native main workflow run, attempt 1. Trusted main remains disabled until separately approved deployment. Merge is not paid execution approval: fresh signed readiness for the resulting main SHA and exact owner Environment approval are mandatory before any credential read or model request. No API key is configured by this change.

## Owner authorization

Use a protected GitHub Environment named `showdar-paid-capture`:

- Exactly one required reviewer: user `caongocquy`, immutable GitHub user ID `50620260`.
- Prevent self-review **off**, deliberately: the repository owner may authorize a deployment they initiated. This is distinct from independent behavioral grading.
- Administrator bypass **off**. Missing/unreadable bypass policy blocks authorization.
- Selected deployment branches/tags: configure exactly `{name: "main", type: "branch"}` through the policy creation API; no tags or wildcard patterns. Approval binds the returned policy ID and the observed type (null if omitted).
- REST does not guarantee a `type` response field. Missing type is **not** interpreted as branch: native authorization still requires `refs/heads/main`, cryptographic verification still requires signed `refs/heads/main`, and an authenticated matching-ref lookup must prove no exact `refs/tags/main` exists. Missing/malformed/paginated tag metadata, an explicit tag/unknown type, or a same-name tag blocks authorization. Real Environment main acceptance and unauthorized-ref rejection remain required.
- `can_admins_bypass` is not guaranteed by the published OpenAPI Environment schema. It must actually be readable as false; missing is never treated as false. Confirm its real response and GitHub settings after approved setup.
- Eventually store `SHOWDAR_PAID_CAPTURE_KEY` as an **Environment secret only**. Never use repository/organization scope for this name. Do not configure a key during this phase.

Secret-free Environment acceptance was completed at trusted runner `349bd82d36918bd647db8ddde8174aba7a7d9734`, evaluated source `b647b89967e05b9040c3afeb362d601939b27487`. Environment ID `23997720744`, policy ID `62660164` (observed branch), zero secrets. These observations must be re-fetched after deployment; acceptance at the old SHA is not transferable. An implicit unprotected Environment never qualifies.

## Proposed execution flow

1. Only after separate approval, deploy this activation proposal to main. Pin the actual main merge SHA, never the activation PR SHA. Keep `paid_capture: false` and the Environment secret-free throughout fresh acceptance.
2. Sync the evaluated PR source and re-run the signed model-free producer contract. Independently verify image archive/manifest, the three producer artifacts and both original attestation bundles. Update the expected pins for this exact runner/source/model/image.
3. Perform model-free Environment acceptance: withheld/rejected/missing approval cannot start a protected job; correct owner approval is independently observable through GitHub review history. Confirm branch restrictions and disabled administrator bypass using the separate probe below. No model key or model calls are needed. The separate probe previously passed real acceptance at the old runner SHA; repeat it for the new SHA.
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

## Separate human behavioral review

Paid authorization is never a rubric grade. Behavioral PASS/FAIL requires independently verified native live evidence and a separate authenticated human rubric record. The existing different-collaborator route remains supported: GitHub review `APPROVED`, prefix `SHOWDAR-RUBRIC/2`, current write/admin permission, and reviewer distinct from capture actor and PR author.

For this single-owner repository, the owner explicitly authorized a same-account alternative. It is **owner human review, not independent grading**: exact user `caongocquy` / ID `50620260` / type User, association OWNER, native review state `COMMENTED`, prefix `SHOWDAR-OWNER-RUBRIC/1`, current write/admin permission with matching owner ID. GitHub PR self-approval is neither required nor accepted. An execution/probe approval cannot substitute for this record. The verifier returns `reviewMode: owner-human-review` and labels owner classifications accordingly.

Both modes require a human-authored JSON payload after reviewing real live evidence: `decision: APPROVED`, exact evidence digest, runner/source/scenario/model/run/attempt, image identity, response IDs, trace/artifact/interaction/coverage/receipt digests, every frozen rubric grade (PASS or FAIL), and every captured interaction ID/digest with forbidden-event classifications. Missing, stale, forged or incomplete records stay BLOCKED. No review is created or graded automatically. CI-only/simulated evidence remains BLOCKED before either route is considered.

After a future authorized capture has been independently verified and the owner has filled the complete rubric payload, an authenticated COMMENT review may be submitted through the documented GitHub reviews API with explicit `commit_id` and `event: COMMENT`; do not use `--approve`. This proposal does not submit a review or claim this owner path has been exercised against real live evidence. [GitHub review schema](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).

Any activation changes the runner SHA. Re-run PRE-PILOT acceptance after that change, before requesting approval for a concrete paid run. Do not reuse acceptance from an older revision.

## Evidence boundary

Unit tests exercise authenticated API shapes using explicit model-free fixtures; they do not prove a real Environment approval. Fresh signed acceptance and protected Environment requalification of the activation merge SHA are required after separately approved deployment. The probe approval prefix and `paidAuthorization: false` prevent probe evidence from authorizing a paid capture. This document authorizes neither setup, dispatch, live execution, BRAIN-001, merge of PR #23 nor release.

References: [Environment protections and secret release](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [authenticated workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

## Secret-free Environment acceptance probe (after separate deployment approval)

After separately approved deployment, run only the secret-free probe and model-free contract with `paid_capture: false`; keep the Environment secret-free. Read the existing Environment and require exact owner user ID `50620260`, `prevent_self_review: false`, `can_admins_bypass: false`, and exactly one main branch policy. Preserve its existing ID; do not implicitly create an Environment or duplicate/recreate its policy during requalification. Read authenticated Environment/policy JSON and matching `tags/main` refs; `assertPaidEnvironment()` must pass. Do not assume a missing type means branch.

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


## Fresh signed PRE-PILOT acceptance after an approved activation merge

Do not execute this sequence before deployment approval. The old readiness bundle is a historical control only; it cannot authorize the new runner.

1. Read and preserve the actual merge SHA using `gh api repos/caongocquy/showdar-skills/git/ref/heads/main --jq .object.sha`. Fetch approved main, sync PR #23 by a normal merge on its existing feature branch, run full checks, push without force, and require its exact-head CI to pass. Record the fresh source SHA using `gh pr view 23 --repo caongocquy/showdar-skills --json headRefOid --jq .headRefOid`. Keep frozen scenarios/fixtures/oracles unchanged.
2. Re-fetch Environment configuration, the singleton policy, `tags/main` refs when type is omitted, and secret names only. Require exact owner ID, self-review allowed, admin bypass false, exact branch main, stable policy binding and zero secrets. Repeat the documented native secret-free probe cases for the new runner: withheld, rejected, wrong digest, authorized exact digest, cross-run replay, unauthorized reviewed branch and attempt 2. Verify the downloaded original positive receipt independently using `verifyEnvironmentProbe(token, {context: exactRunContext, completed: true})`. Probe approval uses only `SHOWDAR-ENVIRONMENT-PROBE/1`; never a paid prefix.
3. Build a new producer input JSON containing the fresh PR #23 source SHA, `pullRequest: 23`, `model: gpt-6-luna`, and approved immutable image pins. Image runner `1014422618782b149267b7cec9538fd4af34c4f8`, run `38061717341` / attempt 1, image ID `sha256:e57720d796a2a1bdca070eb004c26180743389e3013ba6cc29709a4e0be84227`, archive SHA-256 `e8c4f54fbfc22c0aedc0f8a1158ffa648c078340a594dd548e1873a8867b0c03`, manifest SHA-256 `16da578be278fbb3389d3e8bf912c91cb1097727e345cb518a17c7af892c02d6`. If any image recipe/identity changes, an approved fresh signed image build and new pins are required first.
4. Dispatch only the generic contract on main using the reviewed JSON file:

   ```sh
   gh workflow run behavioral-live-capture.yml --repo caongocquy/showdar-skills --ref main \
     -f producer_input="$(cat producer-input.json)" -f paid_capture=false
   ```

   Identify the exact new run from authenticated run metadata; require its head SHA equals the pinned main SHA. Wait for contract and attestation success; require all three paid jobs SKIPPED. Record run/attempt and CI links. The capture scenario must be PRODUCER-CONTRACT, simulated origin; BRAIN-001 is metadata only.
5. Download original `behavioral-producer-contract-<attempt>` (evidence.json, trace.json, artifacts.json) and `behavioral-producer-attestation-<attempt>` (original attestation.json). Preserve the approved image archive, manifest and its original bundle. Build a fresh expected.json with the new main runner/signer SHA, new PR source, frozen scenario digest, exact planned model, producer run/attempt, image/build identity and actual SHA-256 of all three files. Do not replace original bundles with downloaded reconstructions or success flags.
6. Run `verifyPilotGates()` with all original file/bundle paths, exact expected pins and authenticated GitHub token. It independently checks image archive/config/layers/recipe, both cryptographic bundles, signer/source main refs and SHAs, run/attempt invocation, current same-repository PR head and complete event/channel receipts. Require PRE-PILOT GO and BEHAVIORAL BLOCKED. Independently `verifySignedFiles()` for all three subjects using the original producer bundle, exact `behavioral-live-capture.yml` signer, new main SHA, run/attempt. Both source and signer digests must equal the new trusted main SHA; evaluated PR source is separately bound in the artifact.
7. Repeat copy-only tamper, recomputed-digest forgery, invalid signature, stale-source/runner, wrong-image/model/signer/workflow, run/attempt replay, fork, unobserved-channel, simulated-origin promotion and forged/incomplete human-review checks. Require genuine rejection diagnostics and positive verification before/after; timeouts/outages are INCONCLUSIVE. Assert original digests unchanged and publish all pins/CI/attestation links.
8. Only after the entire new acceptance is GO may a separate request authorize secret setup and a concrete paid capture. That future owner approval binds the full newly verified readiness, new paid run attempt 1 and fixed budget. Neither model-free acceptance nor this activation merge is that authorization. BEHAVIORAL remains BLOCKED until verified live capture plus a complete separate human rubric record.

Rollback before a paid capture: stop dispatching paid opt-ins, cancel only the owned run if necessary, and restore disabled gates through a separately reviewed trusted main change. A rollback also changes the runner SHA and invalidates readiness for that revision. Never retry a consumed authorization or bypass Environment protection.
