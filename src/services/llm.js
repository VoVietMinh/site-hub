'use strict';

/**
 * Gemini LLM wrapper.
 *
 * generate(prompt)              → raw text (strips ```html fences)
 * generate(prompt, {json:true}) → parsed object (Gemini JSON mode)
 */

const axios  = require('axios');
const config = require('../config');

// ---------------------------------------------------------------------------
// Fence stripper — remove ```html / ``` wrappers Gemini sometimes emits
// ---------------------------------------------------------------------------
function stripFences(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/^\s*```(?:html|HTML|json|JSON)?\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Core generate
// ---------------------------------------------------------------------------
async function generate(prompt, opts) {
  opts = opts || {};
  const key = config.ai.apiKey;
  if (!key) throw new Error('AI_API_KEY not set — cannot call Gemini.');

  const model = config.ai.model || 'gemini-2.0-flash';
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model + ':generateContent?key=' + key;

  const generationConfig = {};
  if (opts.json) {
    generationConfig.responseMimeType = 'application/json';
    if (opts.jsonSchema) generationConfig.responseSchema = opts.jsonSchema;
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

  const resp = await axios.post(url, body, { timeout: 120000 });
  const text =
    resp.data &&
    resp.data.candidates &&
    resp.data.candidates[0] &&
    resp.data.candidates[0].content &&
    resp.data.candidates[0].content.parts &&
    resp.data.candidates[0].content.parts[0] &&
    resp.data.candidates[0].content.parts[0].text;

  if (!text) throw new Error('Gemini returned empty response');

  if (opts.json) {
    try {
      return JSON.parse(text);
    } catch (_) {
      // fallback: try to extract JSON object from text
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Gemini JSON mode returned non-parseable text: ' + text.slice(0, 300));
    }
  }

  return stripFences(text);
}

module.exports = { generate, stripFences };
