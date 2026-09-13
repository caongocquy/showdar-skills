// Shadow differential harness (Phase 6F T09)
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

  // 2. Structural resolution (primary-only at T09)
  const requestFrame = assembleRequestFrame(prompt);
  const structuralPrimary = resolveStructuralIntent(requestFrame);

  // 3. Build structural side with nulls for not-yet-projected fields
  const structural = {
    phase: structuralPrimary.phase,
    action: structuralPrimary.action,
    mutation: null,
    secondaryActions: null,
    primarySkill: null,
  };

  // 4. Build agreement (only phase/action can agree at this stage)
  const agreement = {
    phase: structuralPrimary.phase === legacyIntent.phase,
    action: structuralPrimary.action === legacyIntent.action,
    mutation: false, // not-yet-projected
    secondary: false, // not-yet-projected
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