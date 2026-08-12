const calculator = require('./calculator');
const documentSearch = require('./documentSearch');
const recordLookup = require('./recordLookup');
const mockTaskCreator = require('./mockTaskCreator');

/**
 * Central Tool Registry
 *
 * Every tool that the agent can use MUST be registered here.
 * The registry is the single source of truth for:
 * - Which tools exist
 * - Their metadata (description, schemas, read/write classification)
 * - Whether they require approval by default
 * - Their execute function
 *
 * The LLM cannot call a tool that is not in this registry.
 * Skill versions further restrict which registry tools are allowed.
 */
const REGISTRY = {
  calculator,
  document_search: documentSearch,
  record_lookup: recordLookup,
  mock_task_creator: mockTaskCreator,
};

/**
 * Get a tool by name. Returns undefined if not found.
 */
function getTool(name) {
  return REGISTRY[name];
}

/**
 * Check if a tool exists in the registry.
 */
function hasTool(name) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name);
}

/**
 * Get all tool names.
 */
function getAllToolNames() {
  return Object.keys(REGISTRY);
}

/**
 * Get all tools as an array (for Gemini tool definitions).
 * Returns only the metadata needed for the LLM prompt — not the execute function.
 */
function getToolDefinitions(allowedTools = null) {
  return Object.values(REGISTRY)
    .filter((tool) => !allowedTools || allowedTools.includes(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
}

module.exports = { getTool, hasTool, getAllToolNames, getToolDefinitions };
