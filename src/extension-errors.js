const EXTENSION_ERROR_CATEGORIES = {
  SCHEMA_INVALID: 'schema-invalid',
  NAMESPACE_INVALID: 'namespace-invalid',
  COLLISION: 'collision',
  PROTECTED_FIELD: 'protected-field',
  UNSAFE_PATH: 'unsafe-path',
  SOURCE_UNAVAILABLE: 'source-unavailable',
  SOURCE_UNSUPPORTED: 'source-unsupported',
  OWNERSHIP_CONFLICT: 'ownership-conflict',
  WORKFLOW_INCOMPATIBLE: 'workflow-incompatible',
  PROFILE_REFERENCE_INVALID: 'profile-reference-invalid',
  OVERRIDE_INVALID: 'override-invalid',
  DRIFT_DETECTED: 'drift-detected',
};

const ERROR_MESSAGES = {
  [EXTENSION_ERROR_CATEGORIES.SCHEMA_INVALID]: 'Schema validation failed',
  [EXTENSION_ERROR_CATEGORIES.NAMESPACE_INVALID]: 'Invalid namespace/identifier',
  [EXTENSION_ERROR_CATEGORIES.COLLISION]: 'Identifier collision detected',
  [EXTENSION_ERROR_CATEGORIES.PROTECTED_FIELD]: 'Protected field modification not allowed',
  [EXTENSION_ERROR_CATEGORIES.UNSAFE_PATH]: 'Unsafe path detected',
  [EXTENSION_ERROR_CATEGORIES.SOURCE_UNAVAILABLE]: 'Source path unavailable',
  [EXTENSION_ERROR_CATEGORIES.SOURCE_UNSUPPORTED]: 'Source type not supported',
  [EXTENSION_ERROR_CATEGORIES.OWNERSHIP_CONFLICT]: 'Ownership conflict with existing managed files',
  [EXTENSION_ERROR_CATEGORIES.WORKFLOW_INCOMPATIBLE]: 'Workflow definition incompatible with checkpoint',
  [EXTENSION_ERROR_CATEGORIES.PROFILE_REFERENCE_INVALID]: 'Invalid profile reference',
  [EXTENSION_ERROR_CATEGORIES.OVERRIDE_INVALID]: 'Invalid project override',
  [EXTENSION_ERROR_CATEGORIES.DRIFT_DETECTED]: 'Source drift detected',
};

export class ExtensionError extends Error {
  constructor(category, message, details = {}) {
    super(message);
    this.name = 'ExtensionError';
    this.category = category;
    this.code = category.toUpperCase().replace(/-/g, '_');
    this.details = details;
  }
}

export function createExtensionError(category, details = {}) {
  const message = details.message ?? ERROR_MESSAGES[category] ?? 'Extension error';
  return new ExtensionError(category, message, details);
}

export function isExtensionError(error) {
  return error instanceof ExtensionError;
}

export function formatErrorForCli(error, verbose = false) {
  if (isExtensionError(error)) {
    const lines = [`[${error.category}] ${error.message}`];
    if (verbose && Object.keys(error.details).length > 0) {
      lines.push('Details:', JSON.stringify(error.details, null, 2));
    }
    return lines.join('\n');
  }
  return error.message;
}

export function formatErrorForJson(error) {
  if (isExtensionError(error)) {
    return {
      category: error.category,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  return {
    category: 'unknown',
    code: 'UNKNOWN',
    message: error.message,
    details: {},
  };
}

export { EXTENSION_ERROR_CATEGORIES, ERROR_MESSAGES };

export const extensionErrorsAPI = {
  ExtensionError,
  createExtensionError,
  isExtensionError,
  formatErrorForCli,
  formatErrorForJson,
  categories: EXTENSION_ERROR_CATEGORIES,
  messages: ERROR_MESSAGES,
};

export default extensionErrorsAPI;