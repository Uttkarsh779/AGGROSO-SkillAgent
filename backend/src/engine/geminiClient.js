/**
 * Gemini Client — uses @google/genai SDK with automatic model discovery
 *
 * Compatible with AQ. prefixed keys and current Gemini models.
 */
const { GoogleGenAI } = require('@google/genai');
const { getToolDefinitions } = require('../tools/registry');

const MAX_LLM_RETRIES = 2;

let _ai = null;
let _discoveredModel = null;

function getAI() {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

/**
 * Dynamically discover an active generateContent model for this API key.
 * Caches the result after the first successful lookup.
 */
async function getWorkingModelName() {
  if (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-2.0-flash') {
    return process.env.GEMINI_MODEL;
  }
  if (_discoveredModel) return _discoveredModel;

  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();

    if (data.models && Array.isArray(data.models)) {
      const generateModels = data.models
        .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''));

      console.log(`[GeminiClient] Available generateContent models: ${generateModels.join(', ')}`);

      // Preference order for standard agent execution (2026 models)
      const preferredList = [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-flash-latest',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
      ];

      for (const pref of preferredList) {
        if (generateModels.includes(pref)) {
          _discoveredModel = pref;
          console.log(`[GeminiClient] Selected active model: ${_discoveredModel}`);
          return _discoveredModel;
        }
      }

      if (generateModels.length > 0) {
        _discoveredModel = generateModels[0];
        console.log(`[GeminiClient] Selected active model: ${_discoveredModel}`);
        return _discoveredModel;
      }
    }
  } catch (err) {
    console.warn(`[GeminiClient] Auto-discovery warning: ${err.message}`);
  }

  _discoveredModel = 'gemini-2.0-flash';
  return _discoveredModel;
}

/**
 * Build the system prompt for the agent.
 */
function buildSystemPrompt(skillVersion) {
  const toolDefs = getToolDefinitions(skillVersion.allowedTools);
  const toolList = toolDefs
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  const examplesText =
    skillVersion.examples && skillVersion.examples.length > 0
      ? '\n\nExamples:\n' +
        skillVersion.examples
          .map(
            (e, i) =>
              `Example ${i + 1}:\nInput: ${JSON.stringify(e.input)}\nExpected output: ${JSON.stringify(e.output)}`
          )
          .join('\n\n')
      : '';

  return `You are an AI agent executing a defined skill.

Skill Purpose: ${skillVersion.instructions}
${examplesText}

Available Tools:
${toolList}

IMPORTANT RESPONSE FORMAT:
You must ALWAYS respond with valid JSON only. No markdown, no code fences, no extra text. Just raw JSON.

Use one of these two formats:

1. To call a tool:
{"type":"tool_call","tool":"<tool_name>","arguments":{<tool arguments>},"reason":"<brief explanation>"}

2. To provide the final answer:
{"type":"final","output":"<your final response to the user>"}

Rules:
- Only use tools from the available tools list above.
- Do not call the same tool with identical arguments twice unless the result was an error.
- When you have sufficient information to answer, use the "final" type.
- Be concise and factual. Do not fabricate data — only use information from tool results.
- Your ENTIRE response must be a single valid JSON object. Nothing else.`;
}

/**
 * Extract and validate JSON from Gemini response text.
 */
function extractJson(text) {
  if (!text || !text.trim()) {
    throw new Error('Empty response from Gemini');
  }

  let cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON found in response: "${text.substring(0, 300)}"`);
  }

  const jsonStr = cleaned.substring(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e.message}. Raw: "${jsonStr.substring(0, 200)}"`);
  }

  if (!['tool_call', 'final'].includes(parsed.type)) {
    throw new Error(`Invalid type "${parsed.type}". Expected "tool_call" or "final"`);
  }
  if (parsed.type === 'tool_call' && !parsed.tool) {
    throw new Error('tool_call missing "tool" field');
  }
  if (parsed.type === 'final' && parsed.output === undefined) {
    throw new Error('final response missing "output" field');
  }

  return parsed;
}

function buildContents(conversationHistory) {
  return conversationHistory.map((msg) => ({
    role: msg.role,
    parts: msg.parts.map((p) => ({ text: p.text })),
  }));
}

/**
 * Call Gemini with automatic model discovery and structured output parsing.
 */
async function callGemini(skillVersion, conversationHistory) {
  const ai = getAI();
  const modelName = await getWorkingModelName();
  const systemPrompt = buildSystemPrompt(skillVersion);

  let lastError;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      const contents = buildContents(conversationHistory);

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      });

      const text = response.text;
      const parsed = extractJson(text);
      return parsed;

    } catch (err) {
      lastError = err;

      if (attempt < MAX_LLM_RETRIES) {
        const delay = 500 * (attempt + 1);
        console.warn(
          `[GeminiClient] Attempt ${attempt + 1} with model "${modelName}" failed: ${err.message}`,
          err.cause || ''
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const causeDetails = lastError.cause
    ? ` [Cause: ${lastError.cause.code || lastError.cause.message || JSON.stringify(lastError.cause)}]`
    : '';
  throw Object.assign(
    new Error(`Gemini call failed after ${MAX_LLM_RETRIES + 1} attempts: ${lastError.message}${causeDetails}`),
    { retryable: false }
  );
}

module.exports = { callGemini, buildSystemPrompt, getWorkingModelName };
