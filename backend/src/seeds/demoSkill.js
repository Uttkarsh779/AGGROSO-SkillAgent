// Load .env from backend root (backend/.env)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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

const DEMO_SKILLS = [
  {
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
            description: 'The customer complaint or issue description (Long text)',
          },
        },
        required: ['customerId', 'complaint'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of the investigation and action taken (Long text)',
          },
          taskCreated: {
            type: 'boolean',
            description: 'Whether a support task was created',
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
  },
  {
    name: 'Internal Policy Assistant',
    purpose:
      'Answer employee questions regarding workplace guidelines, refund policy, billing rules, and support escalation policies using official knowledge base documents.',
    version: {
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Employee policy question or query (Long text)',
          },
        },
        required: ['question'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: 'Detailed answer citing relevant knowledge base policy documents (Long text)',
          },
        },
      },
      instructions: `You are an internal HR & workplace policy assistant. Your job is to:
1. Receive questions from employees about company policies, refund processes, billing rules, or escalation procedures.
2. Use document_search to search the knowledge base for authoritative rules and guidelines.
3. Formulate a comprehensive, accurate answer based strictly on the retrieved document excerpts.
4. Do NOT perform write actions or look up customer database records.

Provide clear, helpful responses directly addressing the employee's query.`,
      examples: [
        {
          input: {
            question: 'What is our policy for refunding failed payment orders?',
          },
          output: {
            answer:
              'According to the Billing Policy document, orders with payment captured but creation failed are classified as HIGH priority. A refund or manual order creation support task must be created within 24 hours.',
          },
        },
      ],
      allowedTools: ['document_search'],
      approvalRequiredActions: [],
      maxSteps: 5,
    },
  },
];

async function seed() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    for (const demoSkill of DEMO_SKILLS) {
      const existing = await Skill.findOne({ name: demoSkill.name });
      if (existing) {
        console.log(`Demo skill "${demoSkill.name}" already exists. Skipping.`);
        continue;
      }

      const skill = await Skill.create({
        name: demoSkill.name,
        purpose: demoSkill.purpose,
      });

      const version = await SkillVersion.create({
        skillId: skill._id,
        versionNumber: 1,
        status: 'draft',
        ...demoSkill.version,
      });

      console.log(`Created demo skill: "${skill.name}" (ID: ${skill._id}, Version: ${version.versionNumber})`);
    }

    console.log('\nSeed completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
