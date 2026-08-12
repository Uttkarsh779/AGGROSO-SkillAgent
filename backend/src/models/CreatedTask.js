const mongoose = require('mongoose');

const createdTaskSchema = new mongoose.Schema(
  {
    approvalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Approval',
      required: true,
    },
    executionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Execution',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      default: 'open',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CreatedTask', createdTaskSchema);
