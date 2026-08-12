const { validateSkillForPublish } = require('../src/validators/skillValidator');

const validSkill = {
  instructions: 'You are a helpful customer support agent that resolves billing issues.',
  inputSchema: {
    type: 'object',
    properties: { customerId: { type: 'string' } },
    required: ['customerId'],
  },
  outputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
  },
  allowedTools: ['record_lookup', 'document_search'],
  approvalRequiredActions: [],
  maxSteps: 5,
  examples: [],
};

describe('Skill Validator', () => {
  test('valid skill passes validation', () => {
    const { valid, errors } = validateSkillForPublish(validSkill);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('fails when instructions are missing', () => {
    const { valid, errors } = validateSkillForPublish({ ...validSkill, instructions: '' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('Instructions'))).toBe(true);
  });

  test('fails when allowedTools is empty', () => {
    const { valid, errors } = validateSkillForPublish({ ...validSkill, allowedTools: [] });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('At least one allowed tool'))).toBe(true);
  });

  test('fails when allowedTools contains unknown tool', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      allowedTools: ['record_lookup', 'unknown_tool'],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('unknown_tool'))).toBe(true);
  });

  test('fails when approvalRequiredActions contains non-allowed tool', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      approvalRequiredActions: ['calculator'], // not in allowedTools
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('approvalRequiredActions'))).toBe(true);
  });

  test('fails when approval action is a read-only tool', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      allowedTools: ['calculator'],
      approvalRequiredActions: ['calculator'], // calculator is read-only
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('read-only'))).toBe(true);
  });

  test('fails when maxSteps is 0', () => {
    const { valid, errors } = validateSkillForPublish({ ...validSkill, maxSteps: 0 });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('maxSteps'))).toBe(true);
  });

  test('fails when maxSteps exceeds 50', () => {
    const { valid, errors } = validateSkillForPublish({ ...validSkill, maxSteps: 100 });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('maxSteps'))).toBe(true);
  });

  test('fails when inputSchema is not an object type', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      inputSchema: { type: 'string' },
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('inputSchema'))).toBe(true);
  });

  test('fails when example is missing output', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      examples: [{ input: { customerId: 'C102' } }],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('Example'))).toBe(true);
  });

  test('allows mock_task_creator in approvalRequiredActions when it is in allowedTools', () => {
    const { valid, errors } = validateSkillForPublish({
      ...validSkill,
      allowedTools: ['record_lookup', 'mock_task_creator'],
      approvalRequiredActions: ['mock_task_creator'],
    });
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });
});
