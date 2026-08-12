const Approval = require('../models/Approval');
const Execution = require('../models/Execution');
const { getTool } = require('../tools/registry');

/**
 * Approval Manager
 *
 * Handles the complete approval lifecycle:
 * 1. Create approval record (pauses execution)
 * 2. Execute approved action (with idempotency)
 * 3. Resume agent after decision
 */

/**
 * Create a new approval request for a write action.
 * Sets execution status to WAITING_APPROVAL.
 *
 * @returns {Promise<Approval>} The created approval document
 */
async function createApproval({ executionId, stepIndex, tool, payload, reason }) {
  const idempotencyKey = `${executionId}_${stepIndex}`;

  // Check if an approval for this step already exists (e.g. duplicate request)
  const existing = await Approval.findOne({ idempotencyKey });
  if (existing) return existing;

  const approval = await Approval.create({
    executionId,
    stepIndex,
    idempotencyKey,
    tool,
    action: tool, // action name == tool name for simplicity
    payload,
    reason: reason || '',
    status: 'PENDING',
  });

  // Pause execution
  await Execution.findByIdAndUpdate(executionId, {
    status: 'WAITING_APPROVAL',
  });

  return approval;
}

/**
 * Execute an approved write action with idempotency protection.
 *
 * If `approval.executedAt` is already set, returns the stored result
 * without re-executing.
 *
 * @returns {Promise<object>} The tool execution result
 */
async function executeApprovedAction(approval) {
  const approvalId = approval._id || approval;

  // Check if already executed
  const existing = await Approval.findById(approvalId);
  if (!existing) throw new Error('Approval not found');
  if (existing.executedAt) {
    console.log(`[ApprovalManager] Idempotency: action already executed for approval ${approvalId}`);
    return existing.result;
  }

  // Atomically claim the execution right in MongoDB
  // Only ONE concurrent request will succeed in updating executing: true
  const claimed = await Approval.findOneAndUpdate(
    {
      _id: approvalId,
      executedAt: { $exists: false },
      executing: { $ne: true },
    },
    {
      $set: { executing: true, status: 'APPROVED', decidedAt: new Date() },
    },
    { new: true }
  );

  if (!claimed) {
    // Another concurrent request claimed it or completed it. Wait briefly for it to complete.
    let attempts = 0;
    while (attempts < 15) {
      await new Promise((r) => setTimeout(r, 100));
      const current = await Approval.findById(approvalId);
      if (current && current.executedAt) {
        console.log(`[ApprovalManager] Idempotency: returned result from concurrent execution for approval ${approvalId}`);
        return current.result;
      }
      attempts++;
    }
    const finalCheck = await Approval.findById(approvalId);
    if (finalCheck && finalCheck.executedAt) return finalCheck.result;
    throw new Error('Approval is currently being processed by another request');
  }

  // We claimed the execution right!
  try {
    const tool = getTool(claimed.tool);
    if (!tool) {
      throw new Error(`Tool "${claimed.tool}" not found in registry`);
    }

    // Execute the write action
    const result = await tool.execute(claimed.payload, {
      approvalId: claimed._id,
      executionId: claimed.executionId,
    });

    // Atomically save result, set executedAt, and release execution lock
    await Approval.findByIdAndUpdate(claimed._id, {
      $set: { executedAt: new Date(), result },
      $unset: { executing: 1 },
    });

    return result;
  } catch (err) {
    // Release lock on error so it can be retried if appropriate
    await Approval.findByIdAndUpdate(claimed._id, { $unset: { executing: 1 } });
    throw err;
  }
}

/**
 * Approve an approval request and execute the write action.
 * Returns { result, approval }.
 */
async function approve(approvalId) {
  const approval = await Approval.findById(approvalId);
  if (!approval) throw new Error('Approval not found');
  if (approval.status === 'REJECTED') {
    throw Object.assign(new Error('This approval has already been rejected'), {
      statusCode: 409,
    });
  }

  const result = await executeApprovedAction(approval._id);
  const updatedApproval = await Approval.findById(approvalId);

  return { result, approval: updatedApproval };
}

/**
 * Reject an approval request. Does NOT execute the write action.
 */
async function reject(approvalId) {
  const approval = await Approval.findById(approvalId);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'PENDING') {
    throw Object.assign(
      new Error(`Approval is already ${approval.status}`),
      { statusCode: 409 }
    );
  }

  await Approval.findByIdAndUpdate(approvalId, {
    status: 'REJECTED',
    decidedAt: new Date(),
  });

  // Resume execution — agent will be informed of rejection via the tool result
  await Execution.findByIdAndUpdate(approval.executionId, {
    status: 'RUNNING',
  });

  const updatedApproval = await Approval.findById(approvalId);
  return { approval: updatedApproval };
}

module.exports = { createApproval, executeApprovedAction, approve, reject };
