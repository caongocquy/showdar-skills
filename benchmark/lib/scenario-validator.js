import Ajv from 'ajv';
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../schema/scenario.schema.json');

let ajv = null;
let validate = null;

async function getValidator() {
  if (validate) return validate;
  
  const schemaContent = await fs.readFile(SCHEMA_PATH, 'utf-8');
  const schema = JSON.parse(schemaContent);
  
  ajv = new Ajv({ allErrors: true, strict: false });
  validate = ajv.compile(schema);
  return validate;
}

export async function validateScenario(scenario) {
  const validator = await getValidator();
  const valid = validator(scenario);
  
  if (valid) {
    return { valid: true, errors: [] };
  }
  
  const errors = (validator.errors || []).map(e => 
    `${e.instancePath || 'root'} ${e.message}`
  );
  
  return { valid: false, errors };
}

export function validateResult(result) {
  const required = ['scenario', 'variant', 'success', 'testsPassed', 'changedFiles', 'commands', 'evidence', 'violations', 'metrics'];
  const missing = required.filter(f => !(f in result));
  
  if (missing.length) {
    return { valid: false, errors: [`Missing required fields: ${missing.join(', ')}`] };
  }
  
  if (typeof result.success !== 'boolean') {
    return { valid: false, errors: ['success must be boolean'] };
  }
  
  if (typeof result.testsPassed !== 'boolean') {
    return { valid: false, errors: ['testsPassed must be boolean'] };
  }
  
  if (!Array.isArray(result.changedFiles)) {
    return { valid: false, errors: ['changedFiles must be array'] };
  }
  
  if (!Array.isArray(result.commands)) {
    return { valid: false, errors: ['commands must be array'] };
  }
  
  if (!Array.isArray(result.evidence)) {
    return { valid: false, errors: ['evidence must be array'] };
  }
  
  if (!Array.isArray(result.violations)) {
    return { valid: false, errors: ['violations must be array'] };
  }
  
  if (!result.metrics || typeof result.metrics.durationMs !== 'number') {
    return { valid: false, errors: ['metrics.durationMs must be number'] };
  }
  
  return { valid: true, errors: [] };
}