// Shadow differential harness (Phase 6F T09; extended T11 mutation; T14 secondaries)
// Diagnostic-only comparison between legacy and structural intent resolution.

import { resolveIntentFromPrompt } from '../index.js';
import { assembleRequestFrame } from './request-frame.js';
import { resolveStructuralIntent } from './projectors/index.js';
import { buildRoutePlan } from '../../route-plan.js';

const NOT_YET_PROJECTED = 'not-yet-projected';

function extractPrimarySkillFromRoutePlan(intent) {
  const plan = buildRoutePlan(intent);
  return plan.primary.skill;
}

export function runShadow(prompt) {
  // 1. Legacy resolution (skip shadow to avoid recursion)
  const legacyResult = resolveIntentFromPrompt(prompt, { skipShadow: true });
  const legacyIntent = legacyResult.intent;
  const legacyPrimarySkill = extractPrimarySkillFromRoutePlan(legacyIntent);

  // 2. Structural resolution (primary + mutation + secondaries)
  const requestFrame = assembleRequestFrame(prompt);
  const structuralPrimary = resolveStructuralIntent(requestFrame);

  // 3. Build structural side with mutation and secondaryActions projected (primarySkill stays null until T17)
  const structural = {
    phase: structuralPrimary.phase,
    action: structuralPrimary.action,
    mutation: structuralPrimary.mutation,
    secondaryActions: structuralPrimary.secondaryActions,
    primarySkill: null,
  };

  // 4. Build agreement (phase/action/mutation/secondary; primarySkill still not-yet-projected)
  const agreement = {
    phase: structuralPrimary.phase === legacyIntent.phase,
    action: structuralPrimary.action === legacyIntent.action,
    mutation: structuralPrimary.mutation === legacyIntent.mutation,
    secondary: Array.isArray(structuralPrimary.secondaryActions) && Array.isArray(legacyIntent.secondaryActions)
      ? structuralPrimary.secondaryActions.join(',') === legacyIntent.secondaryActions.join(',')
      : false,
    primarySkill: structuralPrimary.action === legacyIntent.action && legacyPrimarySkill !== null,
  };

  // 5. Collect issues from structural diagnostics
  const issues = requestFrame.diagnostics.map((d) => ({
    code: d.code,
    detail: d.detail,
  }));

  return {
    legacy: {
      phase: legacyIntent.phase,
      action: legacyIntent.action,
      mutation: legacyIntent.mutation,
      secondaryActions: legacyIntent.secondaryActions,
      primarySkill: legacyPrimarySkill,
    },
    structural,
    agreement,
    issues,
  };
}