import { GoogleGenAI } from '@google/genai';
import config from '../config';

interface GenerateOptions {
  json?: boolean;
  jsonSchema?: Record<string, unknown>;
}

export function stripFences(s: unknown): string {
  if (typeof s !== 'string') return String(s);
  return s
    .replace(/^\s*```(?:html|HTML|json|JSON)?\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
}

export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<unknown> {
  const key = config.ai.apiKey;
  if (!key) throw new Error('AI_API_KEY not set -- cannot call Gemini.');

  const ai = new GoogleGenAI({ apiKey: key });
  const model = config.ai.model || 'gemini-2.0-flash';

  const genConfig: Record<string, unknown> = {};
  if (opts.json) {
    genConfig['responseMimeType'] = 'application/json';
    if (opts.jsonSchema) genConfig['responseSchema'] = opts.jsonSchema;
  }

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    ...(Object.keys(genConfig).length ? { config: genConfig } : {}),
  });

  const text = response.text;
  if (!text) throw new Error('Gemini returned empty response');

  if (opts.json) {
    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Gemini JSON mode returned non-parseable text: ' + text.slice(0, 300));
    }
  }

  return stripFences(text);
}
