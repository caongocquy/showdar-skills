// Shadow differential harness (Phase 6F T09; extended T11 mutation; T14 secondaries; T17 thin primarySkill)
// Diagnostic-only comparison between legacy and structural intent resolution.

import { resolveIntentFromPrompt } from '../index.js';
import { assembleRequestFrame } from './request-frame.js';
import { resolveStructuralIntent } from './projectors/index.js';
import { buildRoutePlan, buildThinRoutePlan } from '../../route-plan.js';

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

  // 2. Structural resolution (primary + mutation + secondaries + thin primarySkill)
  const requestFrame = assembleRequestFrame(prompt);
  const structuralPrimary = resolveStructuralIntent(requestFrame);
  const structuralIntent = {
    phase: structuralPrimary.phase,
    action: structuralPrimary.action,
    object: structuralPrimary.object,
    secondaryActions: structuralPrimary.secondaryActions,
    risks: structuralPrimary.risks,
    mutation: structuralPrimary.mutation,
    evidence: structuralPrimary.evidence,
  };

  // 3. Structural side reports primarySkill via the thin mapper (T17)
  let structuralPrimarySkill = null;
  try {
    structuralPrimarySkill = buildThinRoutePlan(structuralIntent).primary.skill;
  } catch {
    structuralPrimarySkill = null;
  }
  const structural = {
    phase: structuralPrimary.phase,
    action: structuralPrimary.action,
    mutation: structuralPrimary.mutation,
    secondaryActions: structuralPrimary.secondaryActions,
    primarySkill: structuralPrimarySkill,
  };

  // Structural side reports primarySkill via the thin mapper (T17),
  // agreement compares structural skill against legacy skill directly
  const agreement = {
    phase: structuralPrimary.phase === legacyIntent.phase,
    action: structuralPrimary.action === legacyIntent.action,
    mutation: structuralPrimary.mutation === legacyIntent.mutation,
    secondary: Array.isArray(structuralPrimary.secondaryActions) && Array.isArray(legacyIntent.secondaryActions)
      ? structuralPrimary.secondaryActions.join(',') === legacyIntent.secondaryActions.join(',')
      : false,
    primarySkill: typeof structuralPrimarySkill === 'string'
      ? structuralPrimarySkill === legacyPrimarySkill
      : false,
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