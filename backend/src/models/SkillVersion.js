const mongoose = require('mongoose');

const exampleSchema = new mongoose.Schema(
  {
    input: { type: mongoose.Schema.Types.Mixed },
    output: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const skillVersionSchema = new mongoose.Schema(
  {
    skillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    inputSchema: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    outputSchema: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    instructions: {
      type: String,
      default: '',
    },
    examples: {
      type: [exampleSchema],
      default: [],
    },
    allowedTools: {
      type: [String],
      default: [],
    },
    approvalRequiredActions: {
      type: [String],
      default: [],
    },
    maxSteps: {
      type: Number,
      default: 10,
      min: [1, 'maxSteps must be at least 1'],
      max: [50, 'maxSteps cannot exceed 50'],
    },
    createdBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique version numbers per skill
skillVersionSchema.index({ skillId: 1, versionNumber: 1 }, { unique: true });

module.exports = mongoose.model('SkillVersion', skillVersionSchema);
