const express = require('express');
const router = express.Router();
const Approval = require('../models/Approval');
const { approve, reject } = require('../engine/approvalManager');
const { resumeAfterApproval } = require('../engine/agentEngine');

// POST /api/approvals/:id/approve
router.post('/:id/approve', async (req, res) => {
  const approval = await Approval.findById(req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  if (approval.status === 'REJECTED') {
    return res.status(409).json({ error: 'This approval has already been rejected' });
  }

  // Execute with idempotency protection
  const { result } = await approve(req.params.id);

  // Resume agent loop asynchronously
  setImmediate(() => {
    resumeAfterApproval(
      approval.executionId.toString(),
      approval.stepIndex,
      result,
      false
    ).catch((err) => {
      console.error('[Approvals] Resume after approval failed:', err);
    });
  });

  res.json({
    message: 'Approved and executed',
    result,
    approvalId: req.params.id,
  });
});

// POST /api/approvals/:id/reject
router.post('/:id/reject', async (req, res) => {
  const approval = await Approval.findById(req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });

  if (approval.status !== 'PENDING') {
    return res.status(409).json({
      error: `Approval is already ${approval.status}`,
    });
  }

  await reject(req.params.id);

  // Resume agent loop (agent will see the rejection in history)
  setImmediate(() => {
    resumeAfterApproval(
      approval.executionId.toString(),
      approval.stepIndex,
      null,
      true
    ).catch((err) => {
      console.error('[Approvals] Resume after rejection failed:', err);
    });
  });

  res.json({ message: 'Rejected', approvalId: req.params.id });
});

module.exports = router;
