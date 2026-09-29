import { createExtensionCatalog } from './extension-catalog.js';
import { validateWorkflowState } from './workflow-state.js';

export const COMPATIBILITY_REASONS = Object.freeze({
  WORKFLOW_MISSING: 'workflow-missing',
  WORKFLOW_STATE_COMPAT_UNSUPPORTED: 'workflow-state-compat-unsupported',
  STAGE_REMOVED: 'stage-removed',
  SELECTED_STAGE_INVALID: 'selected-stage-invalid',
  REQUIRED_STAGE_CONFLICT: 'required-stage-conflict',
  SKIP_POLICY_INVALID: 'skip-policy-invalid',
  RECORDED_SKIP_INVALID: 'recorded-skip-invalid',
});

export const MALFORMED_REASON = 'malformed-checkpoint';

const REASON_PRECEDENCE = Object.freeze([
  'workflow-missing',
  'workflow-state-compat-unsupported',
  'stage-removed',
  'selected-stage-invalid',
  'required-stage-conflict',
  'skip-policy-invalid',
  'recorded-skip-invalid',
]);

const REMEDIATION_MESSAGES = Object.freeze({
  'workflow-missing': 'Workflow no longer exists in the current candidate catalog.',
  'workflow-state-compat-unsupported': 'Checkpoint uses unsupported workflowStateCompat schema version.',
  'stage-removed': 'Selected stage is no longer declared by the workflow.',
  'selected-stage-invalid': 'Selected stage is not a valid candidate stage.',
  'required-stage-conflict': 'Required stage is not selected.',
  'skip-policy-invalid': 'Skip rule for stage is not in workflow policy.',
  'recorded-skip-invalid': 'Recorded skip reason or policy is no longer accepted.',
  'malformed-checkpoint': 'Checkpoint cannot be parsed or fails schema validation.',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function assessCompatibilityReasons(checkpoint, catalog) {
  let parsed = checkpoint;
  if (typeof checkpoint === 'string') {
    try {
      parsed = JSON.parse(checkpoint);
    } catch {
      return {
        compatible: false,
        replanRequired: true,
        category: 'schema-invalid',
        reason: MALFORMED_REASON,
        detail: REMEDIATION_MESSAGES[MALFORMED_REASON],
        affectedWorkflow: null,
        affectedStage: null,
      };
    }
  }

  if (!isRecord(parsed)) {
    return {
      compatible: false,
      replanRequired: true,
      category: 'schema-invalid',
      reason: MALFORMED_REASON,
      detail: REMEDIATION_MESSAGES[MALFORMED_REASON],
      affectedWorkflow: null,
      affectedStage: null,
    };
  }

  const workflowId = parsed.workflowId;
  const catalogStages = catalog?.selectableStages?.[workflowId] ?? null;
  if (typeof workflowId !== 'string' || !catalogStages) {
    return {
      compatible: false,
      replanRequired: true,
      category: 'workflow-incompatible',
      reason: 'workflow-missing',
      detail: `${REMEDIATION_MESSAGES['workflow-missing']} Workflow: ${workflowId ?? 'unknown'}`,
      affectedWorkflow: workflowId ?? null,
      affectedStage: null,
    };
  }

  const validation = validateWorkflowState(parsed, { extensionCatalog: catalog });
  if (validation.ok) {
    return {
      compatible: true,
      replanRequired: false,
      category: null,
      reason: null,
      detail: null,
      affectedWorkflow: workflowId,
      affectedStage: null,
    };
  }

  const errors = validation.errors;
  const reason = mapErrorsToReason(errors, parsed, catalog);
  return {
    compatible: false,
    replanRequired: true,
    category: 'workflow-incompatible',
    reason: reason.code,
    detail: reason.detail,
    affectedWorkflow: workflowId,
    affectedStage: reason.stage,
  };
}

function mapErrorsToReason(errors, parsed, catalog) {
  const errorText = errors.join('; ');
  const workflowId = parsed.workflowId;

  if (errorText.includes('workflowId must be one of')) {
    return { code: 'workflow-missing', stage: null, detail: `${REMEDIATION_MESSAGES['workflow-missing']} Workflow: ${workflowId}` };
  }

  const doc = findWorkflowDoc(catalog, workflowId);
  if (doc && doc.workflowStateCompat && doc.workflowStateCompat.schemaVersion !== 1) {
    return { code: 'workflow-state-compat-unsupported', stage: null, detail: REMEDIATION_MESSAGES['workflow-state-compat-unsupported'] };
  }

  const stages = catalog.selectableStages[workflowId] ?? [];
  for (const stage of parsed.selectedStages ?? []) {
    if (!stages.includes(stage)) {
      return {
        code: 'stage-removed',
        stage,
        detail: `${REMEDIATION_MESSAGES['stage-removed']} Stage: ${stage}, workflow: ${workflowId}`,
      };
    }
  }

  for (const stage of parsed.selectedStages ?? []) {
    if (!(parsed.candidateStages ?? []).includes(stage)) {
      return {
        code: 'selected-stage-invalid',
        stage,
        detail: `${REMEDIATION_MESSAGES['selected-stage-invalid']} Stage: ${stage}`,
      };
    }
  }

  for (const error of errors) {
    if (error.includes('required stage')) {
      const m = error.match(/required stage (\S+)/);
      return {
        code: 'required-stage-conflict',
        stage: m ? m[1] : null,
        detail: `${REMEDIATION_MESSAGES['required-stage-conflict']} ${error}`,
      };
    }
  }

  for (const error of errors) {
    if (error.includes('not skippable') || error.includes('skipRules') || error.includes('skip rule')) {
      return {
        code: 'skip-policy-invalid',
        stage: extractStage(error),
        detail: `${REMEDIATION_MESSAGES['skip-policy-invalid']} ${error}`,
      };
    }
  }

  for (const error of errors) {
    if (error.includes('skip reason') || error.includes('skip policy')) {
      return {
        code: 'recorded-skip-invalid',
        stage: extractStage(error),
        detail: `${REMEDIATION_MESSAGES['recorded-skip-invalid']} ${error}`,
      };
    }
  }

  return {
    code: 'recorded-skip-invalid',
    stage: null,
    detail: `${REMEDIATION_MESSAGES['recorded-skip-invalid']} ${errors[0] ?? 'Unknown incompatibility'}`,
  };
}

function findWorkflowDoc(catalog, workflowId) {
  return null;
}

function extractStage(error) {
  const m = error.match(/stage (\S+)/) || error.match(/for (\S+)/);
  return m ? m[1].replace(/[.,;:'"]/g, '') : null;
}

export function validateReasonPrecedence(reasons) {
  const indices = reasons.map((r) => REASON_PRECEDENCE.indexOf(r));
  return indices.every((idx, i) => i === 0 || indices[i - 1] <= idx);
}

export { REASON_PRECEDENCE, REMEDIATION_MESSAGES };
