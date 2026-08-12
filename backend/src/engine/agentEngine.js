const Execution = require('../models/Execution');
const SkillVersion = require('../models/SkillVersion');
const { callGemini } = require('./geminiClient');
const { checkToolCallPolicy, requiresApproval } = require('./policyChecker');
const { createApproval } = require('./approvalManager');
const { getTool } = require('../tools/registry');

const MAX_TOOL_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Main Agent Engine — orchestrates the full execution loop.
 *
 * This function:
 * 1. Validates the execution exists and is RUNNING
 * 2. Builds conversation history from previous steps
 * 3. Calls Gemini to get the next action
 * 4. Enforces all policies
 * 5. Executes tools (or creates approvals for write tools)
 * 6. Stores step results
 * 7. Loops until final, cancelled, or terminal error
 *
 * IMPORTANT: This function may be called multiple times for the same execution
 * (once initially, and again after each approval decision).
 */
async function runAgentLoop(executionId) {
  const execution = await Execution.findById(executionId);
  if (!execution) throw new Error('Execution not found');

  if (!['RUNNING', 'WAITING_APPROVAL'].includes(execution.status)) {
    console.log(`[AgentEngine] Execution ${executionId} is in state ${execution.status}, skipping`);
    return;
  }

  const skillVersion = await SkillVersion.findById(execution.skillVersionId);
  if (!skillVersion) {
    await failExecution(executionId, 'SkillVersion not found');
    return;
  }

  // Mark as running
  await Execution.findByIdAndUpdate(executionId, { status: 'RUNNING' });

  // Build conversation history from existing steps
  const history = buildConversationHistory(execution);

  // Add the initial user input if no steps yet
  if (history.length === 0) {
    history.push({
      role: 'user',
      parts: [{ text: `User Input: ${JSON.stringify(execution.input)}` }],
    });
  }

  // Main agent loop
  while (true) {
    // Re-fetch execution status before each iteration
    const currentExecution = await Execution.findById(executionId);
    if (!currentExecution) break;

    if (currentExecution.status === 'CANCELLED') {
      console.log(`[AgentEngine] Execution ${executionId} cancelled`);
      break;
    }

    if (!['RUNNING'].includes(currentExecution.status)) {
      break;
    }

    // Check step limit before calling LLM
    if (currentExecution.currentStep >= skillVersion.maxSteps) {
      await failExecution(
        executionId,
        `Maximum step limit of ${skillVersion.maxSteps} reached`,
        'STEP_LIMIT_EXCEEDED'
      );
      break;
    }

    // Call Gemini
    let action;
    try {
      action = await callGemini(skillVersion, history);
    } catch (err) {
      await failExecution(executionId, `LLM call failed: ${err.message}`);
      break;
    }

    // Record LLM decision step
    const stepIndex = currentExecution.steps.length;
    const llmStep = {
      step: stepIndex,
      type: 'llm_decision',
      input: { conversationLength: history.length },
      output: action,
      status: 'success',
      startedAt: new Date(),
      completedAt: new Date(),
    };

    await Execution.findByIdAndUpdate(executionId, {
      $push: { steps: llmStep },
    });

    // Handle final response
    if (action.type === 'final') {
      await Execution.findByIdAndUpdate(executionId, {
        status: 'COMPLETED',
        finalOutput: action.output,
        completedAt: new Date(),
        $inc: { currentStep: 1 },
      });

      // Add final step
      await Execution.findByIdAndUpdate(executionId, {
        $push: {
          steps: {
            step: stepIndex + 1,
            type: 'final',
            output: { text: action.output },
            status: 'success',
            startedAt: new Date(),
            completedAt: new Date(),
          },
        },
      });

      console.log(`[AgentEngine] Execution ${executionId} completed`);
      break;
    }

    // Handle tool call
    if (action.type === 'tool_call') {
      const { tool: toolName, arguments: toolArgs, reason } = action;

      // Re-fetch for current state
      const freshExecution = await Execution.findById(executionId);

      // Policy check
      const policy = checkToolCallPolicy({
        toolName,
        skillVersion,
        execution: freshExecution,
      });

      if (!policy.allowed) {
        // Feed policy error back to LLM
        history.push({
          role: 'model',
          parts: [{ text: JSON.stringify(action) }],
        });
        history.push({
          role: 'user',
          parts: [
            {
              text: `Policy Error: ${policy.reason}. Please choose a different action or provide a final answer.`,
            },
          ],
        });

        // Record the policy error step
        await Execution.findByIdAndUpdate(executionId, {
          $push: {
            steps: {
              step: stepIndex + 1,
              type: 'error',
              tool: toolName,
              input: toolArgs,
              error: policy.reason,
              status: 'failed',
              startedAt: new Date(),
              completedAt: new Date(),
            },
          },
          $inc: { currentStep: 1 },
        });

        continue;
      }

      // Check if approval is required
      if (requiresApproval(toolName, skillVersion)) {
        const toolStepIndex = freshExecution.steps.length;
        const approval = await createApproval({
          executionId,
          stepIndex: toolStepIndex,
          tool: toolName,
          payload: toolArgs,
          reason,
        });

        // Record approval request step
        await Execution.findByIdAndUpdate(executionId, {
          $push: {
            steps: {
              step: toolStepIndex,
              type: 'approval_request',
              tool: toolName,
              input: toolArgs,
              reason,
              output: { approvalId: approval._id.toString() },
              status: 'pending',
              startedAt: new Date(),
            },
          },
          $inc: { currentStep: 1 },
        });

        console.log(`[AgentEngine] Execution ${executionId} paused for approval`);
        return; // Pause — resume happens via approvalManager.approve()
      }

      // Execute tool (no approval needed)
      const toolStepIndex = (await Execution.findById(executionId)).steps.length;
      const toolResult = await executeToolWithRetry({
        executionId,
        skillVersion,
        toolName,
        toolArgs,
        reason,
        stepIndex: toolStepIndex,
      });

      if (toolResult.fatal) {
        await failExecution(executionId, toolResult.error);
        break;
      }

      // Feed tool result back to Gemini
      history.push({
        role: 'model',
        parts: [{ text: JSON.stringify(action) }],
      });
      history.push({
        role: 'user',
        parts: [
          {
            text: `Tool "${toolName}" result: ${JSON.stringify(toolResult.output)}`,
          },
        ],
      });
    }
  }
}

/**
 * Execute a tool with retry logic.
 * Returns { output, fatal: false } on success.
 * Returns { error, fatal: true } if retries exhausted with non-retryable error.
 */
async function executeToolWithRetry({
  executionId,
  skillVersion,
  toolName,
  toolArgs,
  reason,
  stepIndex,
}) {
  const tool = getTool(toolName);
  let lastError;
  let retryCount = 0;

  for (let attempt = 0; attempt < MAX_TOOL_RETRIES; attempt++) {
    try {
      const startedAt = new Date();
      const output = await tool.execute(toolArgs);
      const completedAt = new Date();

      // Record successful step
      await Execution.findByIdAndUpdate(executionId, {
        $push: {
          steps: {
            step: stepIndex,
            type: 'tool_call',
            tool: toolName,
            input: toolArgs,
            reason,
            output,
            status: 'success',
            retryCount,
            startedAt,
            completedAt,
          },
        },
        $inc: { currentStep: 1 },
      });

      return { output, fatal: false };
    } catch (err) {
      lastError = err;
      retryCount++;

      const isRetryable = err.retryable !== false; // default to retryable

      // Record retry/failure step
      await Execution.findByIdAndUpdate(executionId, {
        $push: {
          steps: {
            step: stepIndex,
            type: 'tool_call',
            tool: toolName,
            input: toolArgs,
            reason,
            error: err.message,
            status: attempt < MAX_TOOL_RETRIES - 1 && isRetryable ? 'retrying' : 'failed',
            retryCount,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        },
      });

      if (!isRetryable || attempt >= MAX_TOOL_RETRIES - 1) {
        return {
          error: `Tool "${toolName}" failed after ${retryCount} attempt(s): ${err.message}`,
          fatal: true,
        };
      }

      // Wait before retrying
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  return {
    error: `Tool "${toolName}" failed after ${retryCount} attempt(s): ${lastError.message}`,
    fatal: true,
  };
}

/**
 * Build Gemini conversation history from existing execution steps.
 * Only includes the last tool result to avoid context overflow.
 */
function buildConversationHistory(execution) {
  if (!execution.steps || execution.steps.length === 0) return [];

  const history = [];

  // Start with user input
  history.push({
    role: 'user',
    parts: [{ text: `User Input: ${JSON.stringify(execution.input)}` }],
  });

  // Add successful tool steps as model+user pairs
  for (const step of execution.steps) {
    if (step.type === 'tool_call' && step.status === 'success') {
      history.push({
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              type: 'tool_call',
              tool: step.tool,
              arguments: step.input,
              reason: step.reason || '',
            }),
          },
        ],
      });
      history.push({
        role: 'user',
        parts: [
          {
            text: `Tool "${step.tool}" result: ${JSON.stringify(step.output)}`,
          },
        ],
      });
    } else if (step.type === 'approval_request') {
      // Include approved tool results
      if (step.output && step.output.result) {
        history.push({
          role: 'model',
          parts: [
            {
              text: JSON.stringify({
                type: 'tool_call',
                tool: step.tool,
                arguments: step.input,
                reason: step.reason || '',
              }),
            },
          ],
        });
        history.push({
          role: 'user',
          parts: [
            {
              text: `Tool "${step.tool}" result (approved): ${JSON.stringify(step.output.result)}`,
            },
          ],
        });
      } else if (step.output && step.output.rejected) {
        history.push({
          role: 'user',
          parts: [
            {
              text: `Tool "${step.tool}" was rejected by the human reviewer. Please provide an alternative response or final answer.`,
            },
          ],
        });
      }
    }
  }

  return history;
}

/**
 * Resume the agent loop after an approval decision.
 * Updates the approval_request step with the result, then re-runs the loop.
 */
async function resumeAfterApproval(executionId, stepIndex, result, rejected = false) {
  // Update the approval_request step with the result
  await Execution.findOneAndUpdate(
    { _id: executionId, 'steps.step': stepIndex },
    {
      $set: {
        'steps.$.status': rejected ? 'skipped' : 'success',
        'steps.$.completedAt': new Date(),
        'steps.$.output': rejected ? { rejected: true } : { result },
      },
      status: 'RUNNING',
    }
  );

  // Re-run the agent loop
  await runAgentLoop(executionId);
}

async function failExecution(executionId, error, code = 'EXECUTION_FAILED') {
  console.error(`[AgentEngine] ${code}: ${error}`);
  await Execution.findByIdAndUpdate(executionId, {
    status: 'FAILED',
    error,
    completedAt: new Date(),
  });
}

module.exports = { runAgentLoop, resumeAfterApproval };
