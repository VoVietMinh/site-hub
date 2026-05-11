"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripFences = stripFences;
exports.generate = generate;
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../config"));
function stripFences(s) {
    if (typeof s !== 'string')
        return String(s);
    return s
        .replace(/^\s*\`\`\`(?:html|HTML|json|JSON)?\s*\n?/, '')
        .replace(/\n?\s*\`\`\`\s*$/, '')
        .trim();
}
async function generate(prompt, opts = {}) {
    const key = config_1.default.ai.apiKey;
    if (!key)
        throw new Error('AI_API_KEY not set -- cannot call Gemini.');
    const model = config_1.default.ai.model || 'gemini-2.0-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        model + ':generateContent?key=' + key;
    const generationConfig = {};
    if (opts.json) {
        generationConfig['responseMimeType'] = 'application/json';
        if (opts.jsonSchema)
            generationConfig['responseSchema'] = opts.jsonSchema;
    }
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
    };
    if (Object.keys(generationConfig).length)
        body['generationConfig'] = generationConfig;
    const resp = await axios_1.default.post(url, body, { timeout: 120000 });
    const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text)
        throw new Error('Gemini returned empty response');
    if (opts.json) {
        try {
            return JSON.parse(text);
        }
        catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m)
                return JSON.parse(m[0]);
            throw new Error('Gemini JSON mode returned non-parseable text: ' + text.slice(0, 300));
        }
    }
    return stripFences(text);
}
//# sourceMappingURL=llm.js.map