const { checkToolCallPolicy, requiresApproval } = require('../src/engine/policyChecker');

const mockSkillVersion = {
  allowedTools: ['calculator', 'document_search', 'record_lookup'],
  approvalRequiredActions: ['mock_task_creator'],
  maxSteps: 5,
};

const runningExecution = { status: 'RUNNING', currentStep: 0 };
const cancelledExecution = { status: 'CANCELLED', currentStep: 0 };
const atLimitExecution = { status: 'RUNNING', currentStep: 5 };

describe('Policy Checker — Tool Authorization', () => {
  test('allows an authorized, registered tool', () => {
    const result = checkToolCallPolicy({
      toolName: 'calculator',
      skillVersion: mockSkillVersion,
      execution: runningExecution,
    });
    expect(result.allowed).toBe(true);
  });

  test('rejects a tool not in the global registry', () => {
    const result = checkToolCallPolicy({
      toolName: 'send_email',
      skillVersion: mockSkillVersion,
      execution: runningExecution,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/does not exist in the tool registry/);
  });

  test('rejects a registered tool not in allowedTools', () => {
    const result = checkToolCallPolicy({
      toolName: 'mock_task_creator',
      skillVersion: mockSkillVersion,
      execution: runningExecution,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not authorized for this skill/);
  });

  test('rejects tool call on cancelled execution', () => {
    const result = checkToolCallPolicy({
      toolName: 'calculator',
      skillVersion: mockSkillVersion,
      execution: cancelledExecution,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cancelled/i);
  });

  test('rejects tool call when max steps exceeded', () => {
    const result = checkToolCallPolicy({
      toolName: 'calculator',
      skillVersion: mockSkillVersion,
      execution: atLimitExecution,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/maximum step limit/i);
  });
});

describe('Policy Checker — Multi-Skill Authorization Isolation (Security Test)', () => {
  const skillA = {
    name: 'Customer Issue Resolver',
    allowedTools: ['document_search', 'record_lookup', 'mock_task_creator'],
    approvalRequiredActions: ['mock_task_creator'],
    maxSteps: 8,
  };

  const skillB = {
    name: 'Internal Policy Assistant',
    allowedTools: ['document_search'],
    approvalRequiredActions: [],
    maxSteps: 5,
  };

  test('Skill A is permitted to use document_search, record_lookup, and mock_task_creator', () => {
    const checkDoc = checkToolCallPolicy({ toolName: 'document_search', skillVersion: skillA, execution: runningExecution });
    const checkRec = checkToolCallPolicy({ toolName: 'record_lookup', skillVersion: skillA, execution: runningExecution });
    const checkTask = checkToolCallPolicy({ toolName: 'mock_task_creator', skillVersion: skillA, execution: runningExecution });

    expect(checkDoc.allowed).toBe(true);
    expect(checkRec.allowed).toBe(true);
    expect(checkTask.allowed).toBe(true);
  });

  test('Skill B is permitted to use document_search', () => {
    const checkDoc = checkToolCallPolicy({ toolName: 'document_search', skillVersion: skillB, execution: runningExecution });
    expect(checkDoc.allowed).toBe(true);
  });

  test('Backend Policy Checker strictly REJECTS mock_task_creator attempt from Skill B', () => {
    const checkUnauthorizedTask = checkToolCallPolicy({
      toolName: 'mock_task_creator',
      skillVersion: skillB,
      execution: runningExecution,
    });

    expect(checkUnauthorizedTask.allowed).toBe(false);
    expect(checkUnauthorizedTask.reason).toMatch(/not authorized for this skill/i);
  });

  test('Backend Policy Checker strictly REJECTS record_lookup attempt from Skill B', () => {
    const checkUnauthorizedLookup = checkToolCallPolicy({
      toolName: 'record_lookup',
      skillVersion: skillB,
      execution: runningExecution,
    });

    expect(checkUnauthorizedLookup.allowed).toBe(false);
    expect(checkUnauthorizedLookup.reason).toMatch(/not authorized for this skill/i);
  });
});

describe('Policy Checker — Approval Check', () => {
  const skillWithApproval = {
    allowedTools: ['mock_task_creator'],
    approvalRequiredActions: ['mock_task_creator'],
    maxSteps: 10,
  };

  test('identifies approval-required tool', () => {
    expect(requiresApproval('mock_task_creator', skillWithApproval)).toBe(true);
  });

  test('does not require approval for read tools', () => {
    const skillReadOnly = {
      allowedTools: ['calculator'],
      approvalRequiredActions: [],
      maxSteps: 10,
    };
    expect(requiresApproval('calculator', skillReadOnly)).toBe(false);
  });
});
