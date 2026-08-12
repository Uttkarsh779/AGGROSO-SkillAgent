const { evaluate } = require('mathjs');

/**
 * Calculator tool — safely evaluates mathematical expressions using mathjs.
 * mathjs provides a sandboxed math parser; no eval() or Function() is used.
 *
 * Input:  { expression: string }
 * Output: { result: number }
 */
const calculator = {
  name: 'calculator',
  description:
    'Evaluates a mathematical expression and returns the numeric result. ' +
    'Supports arithmetic, percentages, rounding, and basic math functions. ' +
    'Example: "125 * 18", "sqrt(144)", "round(3.14159, 2)".',
  readWrite: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The mathematical expression to evaluate',
      },
    },
    required: ['expression'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: { type: 'number' },
    },
  },

  async execute({ expression }) {
    if (!expression || typeof expression !== 'string') {
      throw Object.assign(new Error('expression must be a non-empty string'), {
        retryable: false,
      });
    }

    // mathjs evaluate is sandboxed — no access to Node.js globals
    const result = evaluate(expression);

    if (typeof result !== 'number' && typeof result !== 'bigint') {
      throw Object.assign(
        new Error(`Expression did not produce a numeric result: ${result}`),
        { retryable: false }
      );
    }

    return { result: Number(result) };
  },
};

module.exports = calculator;
