const { getAllToolNames, getTool } = require('../tools/registry');

/**
 * Validates a skill version draft before publishing.
 * Returns { valid: boolean, errors: string[] }
 */
function validateSkillForPublish(skillVersion) {
  const errors = [];
  const availableTools = getAllToolNames();

  // 1. Instructions must exist
  if (!skillVersion.instructions || skillVersion.instructions.trim().length < 10) {
    errors.push('Instructions are required and must be at least 10 characters');
  }

  // 2. Input schema must be a valid object
  if (!skillVersion.inputSchema || typeof skillVersion.inputSchema !== 'object') {
    errors.push('inputSchema must be a valid JSON Schema object');
  } else if (skillVersion.inputSchema.type !== 'object') {
    errors.push('inputSchema.type must be "object"');
  }

  // 3. Output schema must be a valid object
  if (!skillVersion.outputSchema || typeof skillVersion.outputSchema !== 'object') {
    errors.push('outputSchema must be a valid JSON Schema object');
  }

  // 4. At least one allowed tool
  if (!skillVersion.allowedTools || skillVersion.allowedTools.length === 0) {
    errors.push('At least one allowed tool must be specified');
  } else {
    // All allowed tools must exist in registry
    for (const toolName of skillVersion.allowedTools) {
      if (!availableTools.includes(toolName)) {
        errors.push(
          `Tool "${toolName}" does not exist in the registry. Available: ${availableTools.join(', ')}`
        );
      }
    }
  }

  // 5. Approval-required actions must be a subset of allowed tools
  if (skillVersion.approvalRequiredActions) {
    for (const actionName of skillVersion.approvalRequiredActions) {
      if (!skillVersion.allowedTools.includes(actionName)) {
        errors.push(
          `approvalRequiredActions includes "${actionName}" which is not in allowedTools`
        );
      }

      // Must be a write tool
      const tool = getTool(actionName);
      if (tool && tool.readWrite !== 'write') {
        errors.push(
          `"${actionName}" is a read-only tool and cannot require approval. Only write tools can require approval.`
        );
      }
    }
  }

  // 6. maxSteps must be a positive number
  if (
    !skillVersion.maxSteps ||
    typeof skillVersion.maxSteps !== 'number' ||
    skillVersion.maxSteps < 1 ||
    skillVersion.maxSteps > 50
  ) {
    errors.push('maxSteps must be a number between 1 and 50');
  }

  // 7. Examples must be valid if provided
  if (skillVersion.examples && skillVersion.examples.length > 0) {
    skillVersion.examples.forEach((ex, i) => {
      if (!ex.input || !ex.output) {
        errors.push(`Example ${i + 1} must have both "input" and "output" fields`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validateSkillForPublish };
