import {digest,githubJson,REPOSITORY} from './github-provenance.mjs';
import {readPaidEnvironment,assertOwnerEnvironmentApproval} from './paid-authorization.mjs';

export const ENVIRONMENT_PROBE_PREFIX='SHOWDAR-ENVIRONMENT-PROBE/1';

export async function prepareEnvironmentProbe(token,{context=process.env,completed=false}={}) {
  if (context.GITHUB_REPOSITORY!==REPOSITORY || context.GITHUB_REF!=='refs/heads/main' ||
      context.GITHUB_EVENT_NAME!=='workflow_dispatch' || !/^[a-f0-9]{40}$/.test(context.GITHUB_SHA ?? '') ||
      !/^[1-9]\d*$/.test(context.GITHUB_RUN_ID ?? '') || context.GITHUB_RUN_ATTEMPT!=='1') throw new Error('Native main probe context required');
  const run=await githubJson(`/actions/runs/${context.GITHUB_RUN_ID}/attempts/1`,token);
  if (String(run.id)!==context.GITHUB_RUN_ID || run.run_attempt!==1 || run.head_sha!==context.GITHUB_SHA ||
      run.head_branch!=='main' || run.event!=='workflow_dispatch' ||
      run.path?.split('@')[0]!=='.github/workflows/behavioral-environment-probe.yml' ||
      run.repository?.full_name!==REPOSITORY || run.head_repository?.full_name!==REPOSITORY ||
      (completed?(run.status!=='completed' || run.conclusion!=='success'):run.status!=='in_progress')) throw new Error('Untrusted probe run');
  const {environment,policies}=await readPaidEnvironment(token);
  const rule=environment.protection_rules.find(item=>item.type==='required_reviewers');
  const reviewer=rule.reviewers[0].reviewer;
  return {schemaVersion:1,purpose:'secret-free-environment-probe',paidAuthorization:false,repository:REPOSITORY,
    runnerRevision:context.GITHUB_SHA,sourceRef:context.GITHUB_REF,runId:context.GITHUB_RUN_ID,runAttempt:1,
    environment:{id:environment.id,name:environment.name,deploymentPolicyId:policies.branch_policies[0].id,
      observedPolicyType:policies.branch_policies[0].type ?? null},
    protection:{canAdminsBypass:environment.can_admins_bypass,preventSelfReview:rule.prevent_self_review,
      reviewer:{login:reviewer.login,id:reviewer.id,type:reviewer.type},mainNameOnly:true}};
}

export async function verifyEnvironmentProbe(token,options={}) {
  const binding=await prepareEnvironmentProbe(token,options);
  const approvals=await githubJson(`/actions/runs/${binding.runId}/approvals`,token);
  const bindingSha256=digest(JSON.stringify(binding));
  assertOwnerEnvironmentApproval(binding.environment,approvals,ENVIRONMENT_PROBE_PREFIX+'\n'+bindingSha256);
  return {status:'PASS',paidAuthorization:false,binding,bindingSha256};
}
