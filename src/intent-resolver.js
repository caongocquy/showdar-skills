/**
 * Intent Resolver — backward-compatible entry point
 * 
 * Delegates to the modular pipeline under src/intent-resolver/
 * Maintains public API: resolveIntentFromPrompt, resolveIntentFromPromptSync, resolverApi
 */

export { resolveIntentFromPrompt, resolveIntentFromPromptSync, resolverApi, INTENT_RESOLVER_VERSION } from './intent-resolver/index.js';