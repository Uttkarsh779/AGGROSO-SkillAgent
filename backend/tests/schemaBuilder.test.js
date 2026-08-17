const {
  fieldsToSchema,
  schemaToFields,
  validateFieldDefinitions,
  normalizeToCanonicalSchema,
} = require('../src/validators/schemaBuilder');

describe('Schema Builder — Deterministic Schema Generation', () => {
  test('generates correct schema for string (Text & Long text) fields', () => {
    const fields = [
      { name: 'customerId', description: 'Customer identifier', type: 'Text', required: true },
      { name: 'issue', description: 'Issue description', type: 'Long text', required: true },
    ];
    const schema = fieldsToSchema(fields);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer identifier' },
        issue: { type: 'string', description: 'Issue description (Long text)' },
      },
      required: ['customerId', 'issue'],
    });
  });

  test('generates correct schema for number fields', () => {
    const fields = [
      { name: 'amount', description: 'Transaction amount', type: 'Number', required: true },
    ];
    const schema = fieldsToSchema(fields);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Transaction amount' },
      },
      required: ['amount'],
    });
  });

  test('generates correct schema for boolean fields', () => {
    const fields = [
      { name: 'isUrgent', description: 'Is urgent ticket', type: 'Boolean', required: false },
    ];
    const schema = fieldsToSchema(fields);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        isUrgent: { type: 'boolean', description: 'Is urgent ticket' },
      },
    });
    expect(schema.required).toBeUndefined();
  });

  test('generates correct schema for date fields', () => {
    const fields = [
      { name: 'incidentDate', description: 'Date of incident', type: 'Date', required: true },
    ];
    const schema = fieldsToSchema(fields);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        incidentDate: { type: 'string', description: 'Date of incident (Date YYYY-MM-DD)' },
      },
      required: ['incidentDate'],
    });
  });

  test('handles mixed required and optional fields correctly', () => {
    const fields = [
      { name: 'id', type: 'Text', required: true },
      { name: 'notes', type: 'Text', required: false },
      { name: 'count', type: 'Number', required: true },
    ];
    const schema = fieldsToSchema(fields);

    expect(schema.required).toEqual(['id', 'count']);
    expect(Object.keys(schema.properties)).toEqual(['id', 'notes', 'count']);
  });

  test('handles empty fields array gracefully', () => {
    expect(fieldsToSchema([])).toEqual({ type: 'object', properties: {} });
    expect(fieldsToSchema(null)).toEqual({ type: 'object', properties: {} });
  });

  test('rejects duplicate field names during validation', () => {
    const fields = [
      { name: 'Customer ID', type: 'Text' },
      { name: 'customer_id', type: 'Text' },
    ];
    const { valid, errors } = validateFieldDefinitions(fields);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  test('rejects invalid field names during validation', () => {
    const fields = [{ name: 'invalid@name#', type: 'Text' }];
    const { valid, errors } = validateFieldDefinitions(fields);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  test('rejects invalid field type during validation', () => {
    const fields = [{ name: 'test', type: 'UnknownType' }];
    const { valid, errors } = validateFieldDefinitions(fields);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('invalid'))).toBe(true);
  });

  test('schemaToFields parses canonical JSON Schema back to field definitions', () => {
    const canonicalSchema = {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Unique customer identifier' },
        refundAmount: { type: 'number', description: 'Amount to refund' },
        isResolved: { type: 'boolean', description: 'Resolution status' },
      },
      required: ['customerId', 'refundAmount'],
    };

    const fields = schemaToFields(canonicalSchema);
    expect(fields).toEqual([
      { name: 'customerId', description: 'Unique customer identifier', type: 'Text', required: true },
      { name: 'refundAmount', description: 'Amount to refund', type: 'Number', required: true },
      { name: 'isResolved', description: 'Resolution status', type: 'Boolean', required: false },
    ]);
  });

  test('normalizeToCanonicalSchema handles field array, wrapped fields, and existing schema', () => {
    const fieldsInput = [
      { name: 'query', description: 'Search term', type: 'Text', required: true },
    ];
    const canonical1 = normalizeToCanonicalSchema(fieldsInput);
    expect(canonical1.properties.query.type).toBe('string');
    expect(canonical1.required).toEqual(['query']);

    const wrappedInput = { fields: fieldsInput };
    const canonical2 = normalizeToCanonicalSchema(wrappedInput);
    expect(canonical2).toEqual(canonical1);

    const schemaInput = {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search term' } },
      required: ['query'],
    };
    const canonical3 = normalizeToCanonicalSchema(schemaInput);
    expect(canonical3).toEqual(schemaInput);
  });

  test('proves equivalent field definitions produce equivalent canonical schemas', () => {
    const definitionA = [
      { name: 'Customer ID', description: 'Unique ID', type: 'Text', required: true },
      { name: 'Issue', description: 'Problem description', type: 'Long text', required: true },
    ];

    const definitionB = [
      { name: 'customerId', description: 'Unique ID', type: 'Text', required: true },
      { name: 'issue', description: 'Problem description', type: 'Long text', required: true },
    ];

    const schemaA = fieldsToSchema(definitionA);
    const schemaB = fieldsToSchema(definitionB);

    expect(schemaA).toEqual(schemaB);
  });
});
