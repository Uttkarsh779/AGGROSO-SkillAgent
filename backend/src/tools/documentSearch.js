const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');

// Load all documents at startup
const documents = {};

function loadDocuments() {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const name = file.replace('.md', '');
    documents[name] = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8');
  }
}

loadDocuments();

/**
 * Simple keyword search: scores each document by keyword frequency.
 * Returns the top results with relevant excerpt.
 */
function scoreDocument(content, query) {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  const contentLower = content.toLowerCase();
  let score = 0;
  for (const word of words) {
    // Count occurrences of each keyword
    const occurrences = (contentLower.match(new RegExp(word, 'g')) || []).length;
    score += occurrences;
  }
  return score;
}

function extractExcerpt(content, query, maxLength = 500) {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  const lines = content.split('\n');
  let bestLine = '';
  let bestScore = 0;

  for (const line of lines) {
    if (line.trim().length < 10) continue;
    let lineScore = 0;
    const lineLower = line.toLowerCase();
    for (const word of words) {
      if (lineLower.includes(word)) lineScore++;
    }
    if (lineScore > bestScore) {
      bestScore = lineScore;
      bestLine = line;
    }
  }

  // Return best matching section
  const startIdx = content.indexOf(bestLine);
  if (startIdx === -1) return content.substring(0, maxLength);

  const excerpt = content.substring(
    Math.max(0, startIdx - 100),
    Math.min(content.length, startIdx + maxLength)
  );
  return excerpt.trim();
}

/**
 * Document Search tool
 *
 * Input:  { query: string, topK?: number }
 * Output: { results: [{ document: string, excerpt: string, score: number }] }
 */
const documentSearch = {
  name: 'document_search',
  description:
    'Searches the internal knowledge base for relevant policies, guidelines, and rules. ' +
    'Available documents: refund_policy, billing_policy, support_guidelines, escalation_rules. ' +
    'Use this to find relevant policies before making decisions.',
  readWrite: 'read',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — describe what information you are looking for',
      },
      topK: {
        type: 'number',
        description: 'Number of top results to return (default: 2, max: 4)',
      },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            document: { type: 'string' },
            excerpt: { type: 'string' },
            score: { type: 'number' },
          },
        },
      },
    },
  },

  async execute(args = {}) {
    const query = typeof args === 'string' ? args : (args.query || args.q || args.search || args.topic);
    const topK = args.topK || 2;

    if (!query || typeof query !== 'string') {
      return {
        results: [],
        error: 'query parameter is required. Example: {"query": "billing policy"}',
      };
    }

    const k = Math.min(Math.max(1, topK), 4);
    const scored = Object.entries(documents).map(([name, content]) => ({
      document: name,
      score: scoreDocument(content, query),
      excerpt: extractExcerpt(content, query),
    }));

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, k).filter((r) => r.score > 0);

    if (results.length === 0) {
      return {
        results: [],
        message: 'No relevant documents found for the given query',
      };
    }

    return { results };
  },
};

module.exports = documentSearch;
