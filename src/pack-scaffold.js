import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { EXTENSION_ERROR_CATEGORIES, createExtensionError } from './extension-errors.js';

const SKILL_TEMPLATE = `---
name: {{skillName}}
description: {{skillDescription}}
---

# {{skillTitle}}

## Purpose

Describe when to use this skill.

## When to use

- List specific scenarios where this skill applies
- Provide concrete examples of applicable situations
- Explain the context in which this skill is most valuable
- Document the types of problems this skill solves

## When not to use

- List scenarios where this skill should not be used
- Explain limitations and boundaries
- Note any conflicting approaches
- Document known incompatibilities

## Inputs and assumptions

- List required inputs and assumptions
- Document any prerequisites
- Specify expected data formats
- Note any environmental dependencies

## Non-negotiable rules

- List non-negotiable constraints
- Document mandatory practices
- Specify compliance requirements
- Note any regulatory requirements

## Workflow

### Phase 1 - Discovery
- Step 1: Gather requirements
- Step 2: Analyze context
- Step 3: Identify stakeholders

### Phase 2 - Analysis
- Step 1: Evaluate options
- Step 2: Assess trade-offs
- Step 3: Document findings

### Phase 3 - Output
- Step 1: Produce deliverable
- Step 2: Validate results
- Step 3: Document outcomes

## Decision points

- List decision points and criteria
- Document evaluation criteria
- Specify escalation paths
- Note decision deadlines

## Stack detection

- How to detect if this skill applies
- Technology stack indicators
- File pattern matching
- Configuration indicators

## Failure modes

- Known failure scenarios
- Common error patterns
- Recovery procedures
- Mitigation strategies

## Stop conditions

- When to stop using this skill
- Completion criteria
- Termination signals
- Rollback triggers

## Escalation conditions

- When to escalate
- Escalation contacts
- Severity thresholds
- Communication protocols

## Verification

- How to verify correct usage
- Validation checkpoints
- Quality gates
- Acceptance criteria

## Output contract

- What this skill produces
- Expected deliverables
- Format specifications
- Quality standards

## Anti-patterns

- Common mistakes to avoid
- Anti-pattern examples
- Corrective actions
- Prevention techniques

## Example

\`\`\`markdown
### Summary
Example usage summary
\`\`\`
`;

function normalizeVendor(vendor) {
  return vendor.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSkillName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function normalizeWorkflowName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function generateSkillId(vendor, skillName) {
  const v = normalizeVendor(vendor);
  const s = normalizeSkillName(skillName);
  return `${v}/${s}`;
}

function generateWorkflowId(vendor, workflowName) {
  const v = normalizeVendor(vendor);
  const w = normalizeWorkflowName(workflowName);
  return `${v}-${w}`;
}

function toTitleCase(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function createPackManifest({ name, version, description, vendor, skillName, withWorkflow, withProfile }) {
  const skillId = generateSkillId(vendor, skillName);
  const skills = [{
    id: skillId,
    path: `skills/${skillId}`,
    description: `Custom skill for ${skillName}`,
    domains: ['custom', 'utility'],
  }];
  
  const workflows = [];
  if (withWorkflow) {
    const workflowId = generateWorkflowId(vendor, withWorkflow);
    workflows.push({ id: workflowId, path: `workflows/${workflowId}.json` });
  }
  
  const profiles = {};
  if (withProfile) {
    const memberIds = [generateSkillId(vendor, skillName)];
    if (withWorkflow) memberIds.push(generateWorkflowId(vendor, withWorkflow));
    profiles[withProfile] = memberIds;
  }
  
  return {
    name,
    version,
    description: description ?? `Custom pack: ${name}`,
    skills,
    workflows,
    profiles,
  };
}

function createWorkflowDoc({ vendor, workflowName, stages, description }) {
  const workflowId = generateWorkflowId(vendor, workflowName);
  const allowedSkips = stages
    .filter(s => s !== 'showdar-understand')
    .map(stage => ({
      stage,
      reason: 'no-ux-decision',
      policy: 'no-ux-decision',
      evidence: [],
    }));
  
  return {
    id: workflowId,
    description: description ?? `Custom workflow ${workflowId} for ${stages.join(', ')}`,
    stages,
    allowedSkips,
    requiredStages: ['showdar-understand', 'showdar-build', 'showdar-test'],
    completionPolicy: {
      allSelectedStagesAccounted: true,
      noBlockers: true,
      requiredVerificationSatisfied: true,
      noNegativeEvidence: true,
    },
    workflowStateCompat: {
      schemaVersion: 1,
      selectableStages: stages,
      skipRules: Object.fromEntries(allowedSkips.map(s => [s.stage, {
        reason: s.reason,
        policy: s.policy,
        evidence: s.evidence,
      }])),
    },
  };
}

function createSkillFile({ vendor, skillName }) {
  const title = toTitleCase(skillName);
  return SKILL_TEMPLATE
    .replace(/\{\{skillName\}\}/g, skillName)
    .replace(/\{\{skillTitle\}\}/g, title)
    .replace(/\{\{skillDescription\}\}/g, `Custom ${title} skill providing reusable functionality for ${skillName} tasks across projects.`);
}

function createSkillDir(skillId) {
  const parts = skillId.split('/');
  return `skills/${parts.join('/')}`;
}

async function createPackScaffold({
  destination,
  name,
  version = '0.1.0',
  vendor = 'custom',
  description,
  skillName = 'notes',
  withWorkflow,
  withProfile,
} = {}) {
  if (!name || !name.trim()) {
    throw createExtensionError('NAMESPACE_INVALID', { field: 'name', message: 'Pack name is required' });
  }
  
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
  if (!/^[a-z][a-z0-9-]*$/.test(normalizedName)) {
    throw createExtensionError('NAMESPACE_INVALID', { field: 'name', message: 'Pack name must match ^[a-z][a-z0-9-]*$' });
  }
  
  const vendorNorm = normalizeVendor(vendor);
  if (vendorNorm === 'showdar') {
    throw createExtensionError('PROTECTED_FIELD', { field: 'vendor', message: 'Vendor cannot be "showdar" (reserved prefix)' });
  }
  
  const packDir = path.resolve(destination, normalizedName);
  const manifest = createPackManifest({ 
    name: normalizedName, 
    version, 
    description, 
    vendor: vendorNorm, 
    skillName,
    withWorkflow,
    withProfile 
  });
  
  // Check if destination already exists
  const fs = await import('node:fs/promises');
  try {
    const stat = await fs.stat(packDir);
    if (stat.isDirectory()) {
      throw createExtensionError('COLLISION', { path: packDir, message: 'Destination directory already exists' });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  
  // Create directory structure
  await mkdir(path.join(packDir, 'skills', manifest.skills[0].id), { recursive: true });
  if (manifest.workflows.length > 0) {
    await mkdir(path.join(packDir, 'workflows'), { recursive: true });
  }
  
  // Write pack.json
  await import('node:fs/promises').then(fs => 
    fs.writeFile(path.join(packDir, 'pack.json'), JSON.stringify(manifest, null, 2), 'utf8')
  );
  
  // Write skill SKILL.md
  const skillContent = createSkillFile({ vendor: vendorNorm, skillName });
  
  await import('node:fs/promises').then(fs => 
    fs.writeFile(path.join(packDir, 'skills', manifest.skills[0].id, 'SKILL.md'), skillContent, 'utf8')
  );
  
  // Write workflow if requested
  if (withWorkflow) {
    const workflowId = generateWorkflowId(vendor, withWorkflow);
    const stages = ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'];
    const workflowDoc = createWorkflowDoc({
      vendor: vendorNorm,
      workflowName: withWorkflow,
      stages,
      description: `Custom workflow ${withWorkflow} for ${manifest.name}`,
    });
    await import('node:fs/promises').then(fs => 
      fs.writeFile(path.join(packDir, 'workflows', `${workflowId}.json`), JSON.stringify(workflowDoc, null, 2), 'utf8')
    );
  }
  
  return {
    packDir,
    manifest,
    skillId: manifest.skills[0].id,
    workflowId: withWorkflow ? generateWorkflowId(vendorNorm, withWorkflow) : null,
    profileName: withProfile,
  };
}

export { createPackScaffold, generateSkillId, generateWorkflowId, createPackManifest, createWorkflowDoc };

export const packScaffoldAPI = {
  createPackScaffold,
  generateSkillId,
  generateWorkflowId,
  createPackManifest,
  createWorkflowDoc,
};

export default { createPackScaffold };