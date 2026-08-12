const express = require('express');
const router = express.Router();
const Execution = require('../models/Execution');
const Approval = require('../models/Approval');

// GET /api/executions — list all executions (most recent first)
router.get('/', async (req, res) => {
  const { skillId, limit = 20 } = req.query;
  const query = skillId ? { skillId } : {};
  const executions = await Execution.find(query)
    .sort({ startedAt: -1 })
    .limit(Number(limit))
    .select('-steps'); // Omit steps in list view for performance
  res.json({ executions });
});

// GET /api/executions/:id — get full execution with steps
router.get('/:id', async (req, res) => {
  const execution = await Execution.findById(req.params.id);
  if (!execution) return res.status(404).json({ error: 'Execution not found' });
  res.json({ execution });
});

// POST /api/executions/:id/cancel — cancel a running execution
router.post('/:id/cancel', async (req, res) => {
  const execution = await Execution.findById(req.params.id);
  if (!execution) return res.status(404).json({ error: 'Execution not found' });

  if (!['RUNNING', 'WAITING_APPROVAL'].includes(execution.status)) {
    return res.status(400).json({
      error: `Cannot cancel execution in state: ${execution.status}`,
    });
  }

  await Execution.findByIdAndUpdate(req.params.id, {
    status: 'CANCELLED',
    completedAt: new Date(),
    error: 'Cancelled by user',
  });

  res.json({ message: 'Execution cancelled', executionId: req.params.id });
});

// GET /api/executions/:id/approvals — list approvals for an execution
router.get('/:id/approvals', async (req, res) => {
  const approvals = await Approval.find({ executionId: req.params.id }).sort({
    requestedAt: 1,
  });
  res.json({ approvals });
});

module.exports = router;
