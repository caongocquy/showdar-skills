import { planPackUpdate, verifyPlanPreconditions, executePackUpdate } from './pack-plan.js';

export async function updatePack({ cwd, source, dryRun = false }) {
  const plan = await planPackUpdate({ cwd, source });

  if (dryRun) {
    return { plan, dryRun: true };
  }

  const result = await executePackUpdate(plan, { cwd });
  return { ...result, plan };
}

export const packUpdateAPI = { updatePack, planPackUpdate, verifyPlanPreconditions, executePackUpdate };
