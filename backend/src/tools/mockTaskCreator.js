const CreatedTask = require('../models/CreatedTask');

/**
 * Mock Task Creator tool — the primary WRITE tool.
 * This tool MUST go through the approval flow when configured as such.
 * Persistence: tasks are saved to MongoDB.
 *
 * Input:  { title, description, priority }
 * Output: { taskId, title, priority, status, createdAt }
 */
const mockTaskCreator = {
  name: 'mock_task_creator',
  description:
    'Creates a support task in the task management system. ' +
    'Use this when a customer issue requires a formal task to be created for follow-up. ' +
    'This is a WRITE operation and requires human approval.',
  readWrite: 'write',
  requiresApproval: true, // Default — enforced per-skill by approvalRequiredActions config
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, specific title for the task',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Task priority level',
      },
    },
    required: ['title', 'description', 'priority'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      title: { type: 'string' },
      priority: { type: 'string' },
      status: { type: 'string' },
      createdAt: { type: 'string' },
    },
  },

  /**
   * Execute the task creation.
   * Called ONLY by the approvalManager after human approval + idempotency check.
   * approvalId and executionId are injected by the approval flow.
   */
  async execute(args = {}, { approvalId, executionId } = {}) {
    const title = args.title || 'Support Task';
    const description = args.description || args.details || 'Customer issue follow-up';
    
    let rawPriority = String(args.priority || 'medium').toLowerCase().trim();
    let priority = 'medium';
    if (rawPriority.includes('high') || rawPriority.includes('critical') || rawPriority.includes('urgent')) {
      priority = 'high';
    } else if (rawPriority.includes('low')) {
      priority = 'low';
    }

    const task = await CreatedTask.create({
      approvalId,
      executionId,
      title,
      description,
      priority,
      status: 'open',
    });

    return {
      taskId: task._id.toString(),
      title: task.title,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
    };
  },
};

module.exports = mockTaskCreator;
