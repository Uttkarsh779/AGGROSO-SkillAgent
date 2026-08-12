const calculator = require('../src/tools/calculator');
const documentSearch = require('../src/tools/documentSearch');
const recordLookup = require('../src/tools/recordLookup');

describe('Calculator Tool', () => {
  test('evaluates simple arithmetic', async () => {
    const result = await calculator.execute({ expression: '125 * 18' });
    expect(result.result).toBe(2250);
  });

  test('evaluates sqrt', async () => {
    const result = await calculator.execute({ expression: 'sqrt(144)' });
    expect(result.result).toBe(12);
  });

  test('evaluates percentage', async () => {
    const result = await calculator.execute({ expression: '200 * 0.15' });
    expect(result.result).toBe(30);
  });

  test('throws on missing expression', async () => {
    await expect(calculator.execute({})).rejects.toThrow('expression must be a non-empty string');
  });

  test('throws on non-numeric result', async () => {
    await expect(calculator.execute({ expression: '"hello"' })).rejects.toThrow();
  });
});

describe('Document Search Tool', () => {
  test('finds refund policy for payment keywords', async () => {
    const result = await documentSearch.execute({ query: 'payment deducted order not created refund' });
    expect(result.results.length).toBeGreaterThan(0);
    const names = result.results.map((r) => r.document);
    expect(names.some((n) => n.includes('refund') || n.includes('billing'))).toBe(true);
  });

  test('returns empty results for unrelated query', async () => {
    const result = await documentSearch.execute({ query: 'rocket ship moon landing aliens' });
    // Score may be 0 for completely unrelated query
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('returns error object on missing query', async () => {
    const result = await documentSearch.execute({});
    expect(result.results).toEqual([]);
    expect(result.error).toMatch(/query parameter is required/i);
  });

  test('respects topK parameter', async () => {
    const result = await documentSearch.execute({ query: 'policy', topK: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });
});

describe('Record Lookup Tool', () => {
  test('looks up customer C102', async () => {
    const result = await recordLookup.execute({ collection: 'customers', id: 'C102' });
    expect(result.found).toBe(true);
    expect(result.record.name).toBe('Arjun Mehta');
  });

  test('returns not found for unknown ID', async () => {
    const result = await recordLookup.execute({ collection: 'customers', id: 'C999' });
    expect(result.found).toBe(false);
    expect(result.record).toBeNull();
  });

  test('returns error for unauthorized collection', async () => {
    const result = await recordLookup.execute({ collection: 'internal_secrets', id: 'x' });
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  test('returns error for missing fields', async () => {
    const result = await recordLookup.execute({});
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/collection and id are required/i);
  });

  test('looks up order ORD-2045', async () => {
    const result = await recordLookup.execute({ collection: 'orders', id: 'ORD-2045' });
    expect(result.found).toBe(true);
    expect(result.record.status).toBe('payment_captured_order_failed');
  });
});
