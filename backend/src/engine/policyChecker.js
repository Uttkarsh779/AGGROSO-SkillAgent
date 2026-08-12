const { hasTool } = require('../tools/registry');

/**
 * Policy Checker
 *
 * Every tool call from Gemini passes through these checks BEFORE execution.
 * The LLM cannot bypass any of these — they are enforced entirely on the backend.
 */

/**
 * Check all policies for a proposed tool call.
 *
 * @param {object} params
 * @param {string} params.toolName - Tool name from Gemini response
 * @param {object} params.skillVersion - The SkillVersion document
 * @param {object} params.execution - The current Execution document
 * @returns {{ allowed: boolean, reason: string | null }}
 */
function checkToolCallPolicy({ toolName, skillVersion, execution }) {
  // 1. Tool must exist in the global registry
  if (!hasTool(toolName)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" does not exist in the tool registry. Available tools: ${require('../tools/registry').getAllToolNames().join(', ')}`,
    };
  }

  // 2. Tool must be in the skill's allowedTools list
  if (!skillVersion.allowedTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is not authorized for this skill. Allowed tools: ${skillVersion.allowedTools.join(', ')}`,
    };
  }

  // 3. Execution must not be cancelled
  if (execution.status === 'CANCELLED') {
    return {
      allowed: false,
      reason: 'Execution has been cancelled. No further tool calls are permitted.',
    };
  }

  // 4. Step limit must not be exceeded
  if (execution.currentStep >= skillVersion.maxSteps) {
    return {
      allowed: false,
      reason: `Maximum step limit of ${skillVersion.maxSteps} has been reached. Cannot execute further tool calls.`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Check whether a tool call requires human approval for this skill version.
 *
 * @param {string} toolName
 * @param {object} skillVersion
 * @returns {boolean}
 */
function requiresApproval(toolName, skillVersion) {
  return (
    Array.isArray(skillVersion.approvalRequiredActions) &&
    skillVersion.approvalRequiredActions.includes(toolName)
  );
}

module.exports = { checkToolCallPolicy, requiresApproval };
