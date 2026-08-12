// Load .env from backend root (backend/.env)
// __dirname = backend/src/seeds, so ../../ = backend/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Fallback: try cwd-relative .env (when run as `node src/seeds/demoSkill.js`)
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
}
if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found. Make sure backend/.env exists.');
  process.exit(1);
}
console.log('Connecting to:', process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@'));
const { connectDB } = require('../config/db');
const Skill = require('../models/Skill');
const SkillVersion = require('../models/SkillVersion');

const DEMO_SKILL = {
  name: 'Customer Issue Resolver',
  purpose:
    'Analyze a customer complaint, inspect relevant customer information and support policies, and create a support task when appropriate.',
  version: {
    inputSchema: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'The customer ID to look up (e.g., C102)',
        },
        complaint: {
          type: 'string',
          description: 'The customer complaint or issue description',
        },
      },
      required: ['customerId', 'complaint'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of the investigation and action taken',
        },
        taskCreated: {
          type: 'boolean',
        },
      },
    },
    instructions: `You are a customer support AI agent. Your job is to:
1. Look up the customer's record to understand their account status and history.
2. Look up any relevant orders mentioned in the complaint.
3. Search the knowledge base for relevant policies (refund policy, billing policy, support guidelines, escalation rules).
4. Based on the information gathered, determine the appropriate action.
5. If the issue warrants a support task (especially payment/billing issues), create one with the appropriate priority.
6. Provide a clear, empathetic final response explaining what was found and what action was taken.

Always prioritize customer satisfaction while following company policies.
For "payment deducted but order not created" issues: this is HIGH priority per billing policy.`,
    examples: [
      {
        input: {
          customerId: 'C102',
          complaint: 'Payment was deducted but my order was not created.',
        },
        output: {
          summary:
            'Investigated customer C102 (Arjun Mehta). Found order ORD-2045 in payment_captured_order_failed state. Per billing policy, created HIGH priority support task for billing team to resolve within 24 hours.',
          taskCreated: true,
        },
      },
    ],
    allowedTools: ['record_lookup', 'document_search', 'mock_task_creator'],
    approvalRequiredActions: ['mock_task_creator'],
    maxSteps: 8,
  },
};

async function seed() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    // Check if demo skill already exists
    const existing = await Skill.findOne({ name: DEMO_SKILL.name });
    if (existing) {
      console.log('Demo skill already exists. Skipping seed.');
      process.exit(0);
    }

    // Create the skill
    const skill = await Skill.create({
      name: DEMO_SKILL.name,
      purpose: DEMO_SKILL.purpose,
    });

    // Create version 1 as draft
    const version = await SkillVersion.create({
      skillId: skill._id,
      versionNumber: 1,
      status: 'draft',
      ...DEMO_SKILL.version,
    });

    console.log(`Created demo skill: ${skill.name} (ID: ${skill._id})`);
    console.log(`Created version 1 (draft) for skill`);
    console.log('\nTo publish the demo skill, use the UI or run:');
    console.log(`  POST /api/skills/${skill._id}/publish`);
    console.log('\nSeed completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
