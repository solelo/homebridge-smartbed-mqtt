"use strict";
/**
 * A deliberately tiny, *non-evaluating* resolver for the small subset of Home Assistant
 * `value_template` Jinja2 expressions that MQTT-discovery publishers commonly use, e.g.:
 *
 *   {{ value }}
 *   {{ value_json.foo }}
 *   {{ value_json.foo.bar }}
 *   {{ value_json['foo'] }}
 *   {{ value_json.foo | int }}
 *   {{ value_json.foo | float }}
 *   {{ value_json.foo | round(1) }}
 *   {{ 1 if value_json.foo else 0 }}   (only the boolean-coercion ternary form)
 *
 * We intentionally do NOT implement a general Jinja2 engine and never `eval`/`new
 * Function` the template string — templates arrive over the network inside a broker
 * payload and must be treated as untrusted input. Anything outside this tiny grammar is
 * reported as unsupported so the caller can skip the entity and log a clear warning
 * rather than silently mis-rendering state (or worse, executing it).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTemplate = parseTemplate;
exports.resolveTemplate = resolveTemplate;
const SIMPLE_VALUE_JSON = /^\{\{\s*value_json((?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[['"][^'"]+['"]\])*)\s*(\|\s*(int|float|round)(\((\d+)\))?\s*)?\}\}$/;
const SIMPLE_VALUE = /^\{\{\s*value\s*\}\}$/;
const BOOLEAN_COERCE = /^\{\{\s*1\s+if\s+value_json((?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[['"][^'"]+['"]\])*)\s+else\s+0\s*\}\}$/;
function splitPath(rawPath) {
    if (!rawPath) {
        return [];
    }
    const parts = [];
    const re = /\.([a-zA-Z_][a-zA-Z0-9_]*)|\[['"]([^'"]+)['"]\]/g;
    let match;
    while ((match = re.exec(rawPath)) !== null) {
        parts.push(match[1] ?? match[2]);
    }
    return parts;
}
/**
 * Attempt to parse a value_template string into our tiny grammar. Returns `undefined`
 * (never throws) if the template is outside what we support.
 */
function parseTemplate(template) {
    if (!template) {
        return { path: [] };
    }
    const trimmed = template.trim();
    if (SIMPLE_VALUE.test(trimmed)) {
        return { path: [] };
    }
    const boolMatch = BOOLEAN_COERCE.exec(trimmed);
    if (boolMatch) {
        return { path: splitPath(boolMatch[1]), booleanCoerce: true };
    }
    const match = SIMPLE_VALUE_JSON.exec(trimmed);
    if (match) {
        const path = splitPath(match[1]);
        const filter = match[3];
        const roundDigits = match[5] ? parseInt(match[5], 10) : undefined;
        return { path, filter, roundDigits };
    }
    return undefined;
}
function getPath(obj, path) {
    let cur = obj;
    for (const key of path) {
        if (cur === null || cur === undefined || typeof cur !== 'object') {
            return undefined;
        }
        cur = cur[key];
    }
    return cur;
}
/**
 * Resolve a parsed template against a raw MQTT payload string. `rawPayload` is used
 * directly for the bare `{{ value }}` case; otherwise it is JSON-parsed for
 * `value_json.*` access. Never throws — returns `undefined` on any failure.
 */
function resolveTemplate(parsed, rawPayload) {
    if (parsed.path.length === 0 && !parsed.filter && !parsed.booleanCoerce) {
        return rawPayload;
    }
    let json;
    try {
        json = JSON.parse(rawPayload);
    }
    catch {
        return undefined;
    }
    const value = getPath(json, parsed.path);
    if (parsed.booleanCoerce) {
        return isTruthy(value) ? 1 : 0;
    }
    if (value === undefined) {
        return undefined;
    }
    switch (parsed.filter) {
        case 'int': {
            const n = typeof value === 'number' ? value : parseFloat(String(value));
            return Number.isFinite(n) ? Math.trunc(n) : undefined;
        }
        case 'float': {
            const n = typeof value === 'number' ? value : parseFloat(String(value));
            return Number.isFinite(n) ? n : undefined;
        }
        case 'round': {
            const n = typeof value === 'number' ? value : parseFloat(String(value));
            if (!Number.isFinite(n)) {
                return undefined;
            }
            const digits = parsed.roundDigits ?? 0;
            const factor = Math.pow(10, digits);
            return Math.round(n * factor) / factor;
        }
        default:
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                return value;
            }
            // Object/array leaf with no filter — not representable as a scalar HomeKit value.
            return undefined;
    }
}
function isTruthy(value) {
    if (value === undefined || value === null || value === false) {
        return false;
    }
    if (value === '' || value === 0) {
        return false;
    }
    return true;
}
//# sourceMappingURL=templateResolver.js.map