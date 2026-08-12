const { GoogleGenAI } = require('@google/genai');

let client = null;

function getGeminiClient() {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

function getModelName() {
  return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

module.exports = { getGeminiClient, getModelName };
