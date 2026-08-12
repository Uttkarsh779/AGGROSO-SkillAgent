const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    executionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Execution',
      required: true,
      index: true,
    },
    stepIndex: {
      type: Number,
      required: true,
    },
    // Unique key to prevent duplicate write execution
    // Format: `${executionId}_${stepIndex}`
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    tool: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    reason: {
      type: String,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    decidedAt: {
      type: Date,
    },
    // Set AFTER the write action has been executed — idempotency guard
    executedAt: {
      type: Date,
    },
    // Atomic execution lock flag for concurrent request prevention
    executing: {
      type: Boolean,
      default: false,
    },
    // Stored result of the write action (used for idempotency return)
    result: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Approval', approvalSchema);
