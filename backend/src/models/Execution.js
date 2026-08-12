const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema(
  {
    step: { type: Number, required: true },
    type: {
      type: String,
      enum: ['llm_decision', 'tool_call', 'approval_request', 'final', 'error'],
      required: true,
    },
    tool: { type: String },
    input: { type: mongoose.Schema.Types.Mixed },
    output: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['success', 'failed', 'retrying', 'skipped', 'pending'],
      default: 'pending',
    },
    retryCount: { type: Number, default: 0 },
    error: { type: String },
    reason: { type: String }, // LLM reason for choosing this tool
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false }
);

const executionSchema = new mongoose.Schema(
  {
    skillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true,
      index: true,
    },
    skillVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SkillVersion',
      required: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'RUNNING',
      index: true,
    },
    currentStep: {
      type: Number,
      default: 0,
    },
    steps: {
      type: [stepSchema],
      default: [],
    },
    finalOutput: {
      type: String,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Execution', executionSchema);
