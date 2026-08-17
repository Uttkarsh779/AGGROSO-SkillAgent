const mongoose = require('mongoose');
const Execution = require('../src/models/Execution');
const Skill = require('../src/models/Skill');
const SkillVersion = require('../src/models/SkillVersion');
const CreatedTask = require('../src/models/CreatedTask');
const Approval = require('../src/models/Approval');
const { runAgentLoop } = require('../src/engine/agentEngine');
const geminiClient = require('../src/engine/geminiClient');
const { approve } = require('../src/engine/approvalManager');
const { validateSkillForPublish } = require('../src/validators/skillValidator');
const { fieldsToSchema } = require('../src/validators/schemaBuilder');

// Mock geminiClient.callGemini for deterministic offline testing
jest.mock('../src/engine/geminiClient', () => {
  const originalModule = jest.requireActual('../src/engine/geminiClient');
  return {
    ...originalModule,
    callGemini: jest.fn(),
  };
});

describe('Agent Engine Suite (Deterministic Mocks)', () => {
  let db;
  let sampleSkill;
  let sampleVersion;

  beforeAll(async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillsagent_test';
    await mongoose.connect(uri);
    db = mongoose.connection;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Execution.deleteMany({});
    await Skill.deleteMany({});
    await SkillVersion.deleteMany({});
    await CreatedTask.deleteMany({});
    await Approval.deleteMany({});

    sampleSkill = await Skill.create({
      name: 'Customer Service Bot',
      purpose: 'Assist customer inquiries safely',
    });

    sampleVersion = await SkillVersion.create({
      skillId: sampleSkill._id,
      versionNumber: 1,
      status: 'published',
      instructions: 'Help customers with account and order queries.',
      allowedTools: ['calculator', 'record_lookup', 'document_search', 'mock_task_creator'],
      approvalRequiredActions: ['mock_task_creator'],
      maxSteps: 5,
    });
  });

  test('Test 11 — Basic Agent Loop (tool call then final response)', async () => {
    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { customerId: 'C102' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'record_lookup',
        arguments: { collection: 'customers', id: 'C102' },
        reason: 'Lookup customer details for C102',
      })
      .mockResolvedValueOnce({
        type: 'final',
        output: 'Customer C102 is Arjun Mehta.',
      });

    await runAgentLoop(execution._id.toString());

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('COMPLETED');
    expect(finalExec.finalOutput).toBe('Customer C102 is Arjun Mehta.');
    expect(finalExec.steps.length).toBeGreaterThanOrEqual(2);
  });

  test('Test 12 — Tool Authorization Check (Unauthorized tool call blocked)', async () => {
    const restrictedVersion = await SkillVersion.create({
      skillId: sampleSkill._id,
      versionNumber: 2,
      status: 'published',
      allowedTools: ['calculator'],
      approvalRequiredActions: [],
      maxSteps: 5,
    });

    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: restrictedVersion._id,
      versionNumber: 2,
      input: { action: 'create task' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'mock_task_creator',
        arguments: { title: 'Unauthorized Task', description: 'Test', priority: 'high' },
        reason: 'Attempt unauthorized action',
      })
      .mockResolvedValueOnce({
        type: 'final',
        output: 'I cannot create tasks because mock_task_creator is not authorized for this skill.',
      });

    await runAgentLoop(execution._id.toString());

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('COMPLETED');
    
    const errorStep = finalExec.steps.find((s) => s.type === 'error');
    expect(errorStep).toBeDefined();
    expect(errorStep.error).toMatch(/not authorized for this skill/i);

    const taskCount = await CreatedTask.countDocuments({ executionId: execution._id });
    expect(taskCount).toBe(0);
  });

  test('Test 13 — Unknown Tool Rejection', async () => {
    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { send: 'email' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'send_email',
        arguments: { to: 'user@example.com' },
        reason: 'Send email notification',
      })
      .mockResolvedValueOnce({
        type: 'final',
        output: 'Tool send_email does not exist in the tool registry.',
      });

    await runAgentLoop(execution._id.toString());

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('COMPLETED');

    const errorStep = finalExec.steps.find((s) => s.type === 'error');
    expect(errorStep).toBeDefined();
    expect(errorStep.error).toMatch(/does not exist in the tool registry/i);
  });

  test('Test 14 — Maximum Steps Enforcement', async () => {
    const shortVersion = await SkillVersion.create({
      skillId: sampleSkill._id,
      versionNumber: 3,
      status: 'published',
      allowedTools: ['calculator'],
      approvalRequiredActions: [],
      maxSteps: 2,
    });

    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: shortVersion._id,
      versionNumber: 3,
      input: { expression: '1+1' },
      status: 'RUNNING',
    });

    geminiClient.callGemini.mockResolvedValue({
      type: 'tool_call',
      tool: 'calculator',
      arguments: { expression: '1+1' },
      reason: 'Infinite calculation loop attempt',
    });

    await runAgentLoop(execution._id.toString());

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('FAILED');
    expect(finalExec.error).toMatch(/Maximum step limit/i);
  });

  test('Test 15 — Execution Cancellation Check', async () => {
    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { test: 'cancel' },
      status: 'CANCELLED',
    });

    await runAgentLoop(execution._id.toString());

    expect(geminiClient.callGemini).not.toHaveBeenCalled();

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('CANCELLED');
  });

  test('Test 18 — Immediate Final Response (Zero tools executed)', async () => {
    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { query: 'Hello' },
      status: 'RUNNING',
    });

    geminiClient.callGemini.mockResolvedValueOnce({
      type: 'final',
      output: 'Hello! How can I assist you today?',
    });

    await runAgentLoop(execution._id.toString());

    const finalExec = await Execution.findById(execution._id);
    expect(finalExec.status).toBe('COMPLETED');
    expect(finalExec.finalOutput).toBe('Hello! How can I assist you today?');
  });

  test('Test 19 — Write Tool Approval Boundary & Resume', async () => {
    const execution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { issue: 'Payment deducted but order failed' },
      status: 'RUNNING',
    });

    geminiClient.callGemini.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'mock_task_creator',
      arguments: { title: 'Billing Issue Task', description: 'Investigate payment', priority: 'high' },
      reason: 'Create support task for billing team',
    });

    await runAgentLoop(execution._id.toString());

    let currentExec = await Execution.findById(execution._id);
    expect(currentExec.status).toBe('WAITING_APPROVAL');

    let taskCount = await CreatedTask.countDocuments({ executionId: execution._id });
    expect(taskCount).toBe(0);

    const approval = await Approval.findOne({ executionId: execution._id });
    expect(approval).toBeDefined();
    expect(approval.status).toBe('PENDING');

    geminiClient.callGemini.mockResolvedValueOnce({
      type: 'final',
      output: 'Support task created successfully and assigned to billing team.',
    });

    const { result } = await approve(approval._id);
    expect(result.taskId).toBeDefined();

    taskCount = await CreatedTask.countDocuments({ executionId: execution._id });
    expect(taskCount).toBe(1);
  });
});

describe('Generic Multi-Skill Execution (Requirement 6)', () => {
  let skillA, versionA, skillB, versionB;

  beforeEach(async () => {
    jest.clearAllMocks();
    await Execution.deleteMany({});
    await Skill.deleteMany({});
    await SkillVersion.deleteMany({});

    // Skill A: Customer Issue Resolver (Multi-tool + Approval write action)
    skillA = await Skill.create({
      name: 'Customer Issue Resolver',
      purpose: 'Resolve customer issues and create support tasks',
    });
    versionA = await SkillVersion.create({
      skillId: skillA._id,
      versionNumber: 1,
      status: 'published',
      instructions: 'Investigate customer complaint and create support task if needed.',
      allowedTools: ['record_lookup', 'document_search', 'mock_task_creator'],
      approvalRequiredActions: ['mock_task_creator'],
      maxSteps: 8,
    });

    // Skill B: Internal Policy Assistant (Single tool: document_search only, no write actions)
    skillB = await Skill.create({
      name: 'Internal Policy Assistant',
      purpose: 'Answer employee policy queries using document search',
    });
    versionB = await SkillVersion.create({
      skillId: skillB._id,
      versionNumber: 1,
      status: 'published',
      instructions: 'Answer questions about company policies using document_search only.',
      allowedTools: ['document_search'],
      approvalRequiredActions: [],
      maxSteps: 5,
    });
  });

  test('Executes Skill A and Skill B through the exact same agent engine without skill name branching', async () => {
    // Execution for Skill A
    const execA = await Execution.create({
      skillId: skillA._id,
      skillVersionId: versionA._id,
      versionNumber: 1,
      input: { customerId: 'C102', complaint: 'Payment deducted' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'record_lookup',
        arguments: { collection: 'customers', id: 'C102' },
        reason: 'Check customer record',
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'document_search',
        arguments: { query: 'billing refund policy' },
        reason: 'Search refund policy',
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'mock_task_creator',
        arguments: { title: 'Refund task C102', description: 'Process refund', priority: 'high' },
        reason: 'Create refund task',
      });

    await runAgentLoop(execA._id.toString());
    const resA = await Execution.findById(execA._id);
    expect(resA.status).toBe('WAITING_APPROVAL');

    // Execution for Skill B through identical engine
    const execB = await Execution.create({
      skillId: skillB._id,
      skillVersionId: versionB._id,
      versionNumber: 1,
      input: { question: 'What is the refund policy for billing errors?' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'document_search',
        arguments: { query: 'billing refund policy' },
        reason: 'Search billing policy document',
      })
      .mockResolvedValueOnce({
        type: 'final',
        output: 'Per billing policy, refunds for failed orders are processed within 24 hours.',
      });

    await runAgentLoop(execB._id.toString());
    const resB = await Execution.findById(execB._id);
    expect(resB.status).toBe('COMPLETED');
    expect(resB.finalOutput).toMatch(/refunds for failed orders are processed/i);
  });
});

describe('Dynamic Creation of Completely New Skill (Requirement 7)', () => {
  test('User creates, validates, publishes, and executes a third skill (Simple Calculator Assistant) without backend code changes', async () => {
    // STEP 1 — Create Draft
    const skill = await Skill.create({
      name: 'Simple Calculator Assistant',
      purpose: 'Evaluate math calculations accurately',
    });

    const inputFields = [{ name: 'expression', description: 'Math expression', type: 'Text', required: true }];
    const outputFields = [{ name: 'result', description: 'Calculation result', type: 'Number', required: true }];

    const version = await SkillVersion.create({
      skillId: skill._id,
      versionNumber: 1,
      status: 'draft',
      inputSchema: fieldsToSchema(inputFields),
      outputSchema: fieldsToSchema(outputFields),
      instructions: 'Calculate the math expression provided using the calculator tool.',
      allowedTools: ['calculator'],
      approvalRequiredActions: [],
      maxSteps: 5,
    });

    // STEP 2 — Validate Draft
    const validation = validateSkillForPublish(version);
    expect(validation.valid).toBe(true);

    // STEP 3 — Publish Version
    version.status = 'published';
    await version.save();
    skill.status = 'published';
    skill.currentVersion = 1;
    await skill.save();

    // STEP 4 — Execute New Skill through Generic Engine
    const execution = await Execution.create({
      skillId: skill._id,
      skillVersionId: version._id,
      versionNumber: 1,
      input: { expression: '125 * 18' },
      status: 'RUNNING',
    });

    geminiClient.callGemini
      .mockResolvedValueOnce({
        type: 'tool_call',
        tool: 'calculator',
        arguments: { expression: '125 * 18' },
        reason: 'Multiply 125 by 18',
      })
      .mockResolvedValueOnce({
        type: 'final',
        output: 'The calculated result of 125 * 18 is 2250.',
      });

    await runAgentLoop(execution._id.toString());

    const resultExec = await Execution.findById(execution._id);
    expect(resultExec.status).toBe('COMPLETED');
    expect(resultExec.finalOutput).toContain('2250');
  });
});
