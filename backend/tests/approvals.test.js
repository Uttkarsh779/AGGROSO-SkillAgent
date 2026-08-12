const mongoose = require('mongoose');
const Approval = require('../src/models/Approval');
const Execution = require('../src/models/Execution');
const CreatedTask = require('../src/models/CreatedTask');
const Skill = require('../src/models/Skill');
const SkillVersion = require('../src/models/SkillVersion');
const { createApproval, approve, reject, executeApprovedAction } = require('../src/engine/approvalManager');

describe('Approval Manager & Idempotency Suite', () => {
  let db;
  let sampleSkill;
  let sampleVersion;
  let sampleExecution;

  beforeAll(async () => {
    // Use local MongoDB test instance
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillsagent_test';
    await mongoose.connect(uri);
    db = mongoose.connection;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean collections before each test to ensure test isolation
    await Approval.deleteMany({});
    await Execution.deleteMany({});
    await CreatedTask.deleteMany({});
    await Skill.deleteMany({});
    await SkillVersion.deleteMany({});

    // Setup baseline fixtures
    sampleSkill = await Skill.create({
      name: 'Test Refund Skill',
      purpose: 'Test refund and task workflows',
    });

    sampleVersion = await SkillVersion.create({
      skillId: sampleSkill._id,
      versionNumber: 1,
      status: 'published',
      allowedTools: ['record_lookup', 'mock_task_creator'],
      approvalRequiredActions: ['mock_task_creator'],
      maxSteps: 10,
    });

    sampleExecution = await Execution.create({
      skillId: sampleSkill._id,
      skillVersionId: sampleVersion._id,
      versionNumber: 1,
      input: { customerId: 'C102' },
      status: 'RUNNING',
      currentStep: 1,
    });
  });

  test('Test 1 — Approval Creation', async () => {
    const payload = {
      title: 'Investigate payment discrepancy',
      description: 'Payment deducted without order creation for C102',
      priority: 'high',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
      reason: 'Issue requires high priority support task',
    });

    expect(approval).toBeDefined();
    expect(approval.status).toBe('PENDING');
    expect(approval.idempotencyKey).toBe(`${sampleExecution._id}_1`);
    expect(approval.tool).toBe('mock_task_creator');
    expect(approval.payload.title).toBe(payload.title);

    // Verify execution status was set to WAITING_APPROVAL
    const updatedExecution = await Execution.findById(sampleExecution._id);
    expect(updatedExecution.status).toBe('WAITING_APPROVAL');
  });

  test('Test 2 — Approval Rejection (Write tool NEVER executes)', async () => {
    const payload = {
      title: 'Investigate payment discrepancy',
      description: 'Payment deducted for C102',
      priority: 'high',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
      reason: 'Testing rejection',
    });

    // Reject approval
    const { approval: rejectedApproval } = await reject(approval._id);
    expect(rejectedApproval.status).toBe('REJECTED');

    // Verify write tool NEVER executed — zero tasks created in DB
    const taskCount = await CreatedTask.countDocuments({ executionId: sampleExecution._id });
    expect(taskCount).toBe(0);

    // Verify approval record has no executedAt timestamp
    const freshApproval = await Approval.findById(approval._id);
    expect(freshApproval.executedAt).toBeUndefined();
  });

  test('Test 3 — Approval Success (Write tool executes once & result stored)', async () => {
    const payload = {
      title: 'Create support task for C102',
      description: 'Billing issue follow-up',
      priority: 'high',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
      reason: 'Testing approval success',
    });

    const { result, approval: approvedRecord } = await approve(approval._id);

    expect(approvedRecord.status).toBe('APPROVED');
    expect(approvedRecord.executedAt).toBeDefined();
    expect(result).toBeDefined();
    expect(result.title).toBe('Create support task for C102');

    // Verify task actually exists in CreatedTask collection
    const tasks = await CreatedTask.find({ executionId: sampleExecution._id });
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Create support task for C102');
  });

  test('Test 4 — Duplicate Approval (Sequential double-click returns stored result & EXACTLY ONE write)', async () => {
    const payload = {
      title: 'Duplicate click task test',
      description: 'Double click protection test',
      priority: 'high',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
      reason: 'Double click test',
    });

    // First approve
    const res1 = await approve(approval._id);
    expect(res1.result.taskId).toBeDefined();

    // Second approve (simulating double-click or frontend retry)
    const res2 = await approve(approval._id);
    expect(res2.result.taskId).toBe(res1.result.taskId);

    // Verify database side effect: EXACTLY ONE task created
    const taskCount = await CreatedTask.countDocuments({ executionId: sampleExecution._id });
    expect(taskCount).toBe(1);
  });

  test('Test 5 — Repeated Approval after completion (Multiple post-completion requests)', async () => {
    const payload = {
      title: 'Post-completion retry test',
      description: 'Repeated calls after completed execution',
      priority: 'medium',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
    });

    const initial = await approve(approval._id);

    // Call approve 3 more times
    const call1 = await approve(approval._id);
    const call2 = await approve(approval._id);
    const call3 = await approve(approval._id);

    expect(call1.result.taskId).toBe(initial.result.taskId);
    expect(call2.result.taskId).toBe(initial.result.taskId);
    expect(call3.result.taskId).toBe(initial.result.taskId);

    // Verify persisted side effect: EXACTLY ONE task created
    const totalTasks = await CreatedTask.countDocuments({ executionId: sampleExecution._id });
    expect(totalTasks).toBe(1);
  });

  test('Test 6 — Concurrent Approval / Race Condition (Simultaneous Promise.all calls)', async () => {
    const payload = {
      title: 'Race condition test task',
      description: 'Simultaneous HTTP requests testing atomic locking',
      priority: 'high',
    };

    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload,
    });

    // Fire 2 concurrent approval requests simultaneously
    const [resA, resB] = await Promise.all([
      approve(approval._id),
      approve(approval._id),
    ]);

    // Both requests must resolve with identical result
    expect(resA.result.taskId).toBe(resB.result.taskId);

    // Verify database side effect: EXACTLY ONE task created in MongoDB
    const taskCount = await CreatedTask.countDocuments({ executionId: sampleExecution._id });
    expect(taskCount).toBe(1);
  });

  test('Test 7 — Approval Cannot Bypass Authorization (Unknown tool fails safely)', async () => {
    const approval = await Approval.create({
      executionId: sampleExecution._id,
      stepIndex: 1,
      idempotencyKey: `${sampleExecution._id}_1_unauth`,
      tool: 'nonexistent_unauthorized_tool',
      action: 'nonexistent_unauthorized_tool',
      payload: { foo: 'bar' },
      status: 'PENDING',
    });

    await expect(approve(approval._id)).rejects.toThrow(/not found in registry/i);
  });

  test('Test 8 — Invalid/Rejected Approval (Re-approving rejected approval fails with 409)', async () => {
    const approval = await createApproval({
      executionId: sampleExecution._id,
      stepIndex: 1,
      tool: 'mock_task_creator',
      payload: { title: 'T1', description: 'D1', priority: 'low' },
    });

    await reject(approval._id);

    // Re-approving rejected approval should fail with 409 conflict
    await expect(approve(approval._id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
