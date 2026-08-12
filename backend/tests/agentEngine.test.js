const mongoose = require('mongoose');
const Execution = require('../src/models/Execution');
const Skill = require('../src/models/Skill');
const SkillVersion = require('../src/models/SkillVersion');
const CreatedTask = require('../src/models/CreatedTask');
const Approval = require('../src/models/Approval');
const { runAgentLoop } = require('../src/engine/agentEngine');
const geminiClient = require('../src/engine/geminiClient');
const { approve } = require('../src/engine/approvalManager');

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

    // Mock Gemini step 1: tool_call -> record_lookup
    // Mock Gemini step 2: final output
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
    // Create version that ONLY allows calculator
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

    // Gemini attempts to call mock_task_creator which is NOT allowed by version 2
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
    
    // Verify policy error step was recorded
    const errorStep = finalExec.steps.find((s) => s.type === 'error');
    expect(errorStep).toBeDefined();
    expect(errorStep.error).toMatch(/not authorized for this skill/i);

    // Verify task was NOT created in DB
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

    // Gemini requests unregistered tool send_email
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

    // Verify error step recorded
    const errorStep = finalExec.steps.find((s) => s.type === 'error');
    expect(errorStep).toBeDefined();
    expect(errorStep.error).toMatch(/does not exist in the tool registry/i);
  });

  test('Test 14 — Maximum Steps Enforcement', async () => {
    // Create version with maxSteps = 2
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

    // Gemini keeps requesting tool calls
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

    // Gemini should never be called if execution is pre-cancelled
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

    // Step 1: Gemini requests mock_task_creator (write tool requiring approval)
    geminiClient.callGemini.mockResolvedValueOnce({
      type: 'tool_call',
      tool: 'mock_task_creator',
      arguments: { title: 'Billing Issue Task', description: 'Investigate payment', priority: 'high' },
      reason: 'Create support task for billing team',
    });

    await runAgentLoop(execution._id.toString());

    // Verify execution paused at WAITING_APPROVAL
    let currentExec = await Execution.findById(execution._id);
    expect(currentExec.status).toBe('WAITING_APPROVAL');

    // Verify ZERO tasks created in DB prior to human approval
    let taskCount = await CreatedTask.countDocuments({ executionId: execution._id });
    expect(taskCount).toBe(0);

    // Get pending approval
    const approval = await Approval.findOne({ executionId: execution._id });
    expect(approval).toBeDefined();
    expect(approval.status).toBe('PENDING');

    // Step 2: Human approves
    geminiClient.callGemini.mockResolvedValueOnce({
      type: 'final',
      output: 'Support task created successfully and assigned to billing team.',
    });

    const { result } = await approve(approval._id);
    expect(result.taskId).toBeDefined();

    // Verify EXACTLY ONE task created in DB after approval
    taskCount = await CreatedTask.countDocuments({ executionId: execution._id });
    expect(taskCount).toBe(1);
  });
});
