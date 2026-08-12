const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Skill name is required'],
      trim: true,
    },
    purpose: {
      type: String,
      required: [true, 'Skill purpose is required'],
      trim: true,
    },
    createdBy: {
      type: String,
      default: 'system',
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    currentVersion: {
      type: Number,
      default: 0, // 0 means no published version yet
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Skill', skillSchema);
