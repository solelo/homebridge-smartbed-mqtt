"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyNameOverrides = applyNameOverrides;
exports.sanitizeNameOverrides = sanitizeNameOverrides;
/** First matching rule wins; the raw name passes through unchanged if nothing matches. */
function applyNameOverrides(rawName, overrides) {
    if (!overrides || overrides.length === 0) {
        return rawName;
    }
    const lower = rawName.toLowerCase();
    for (const rule of overrides) {
        if (rule.match && rule.name && lower.includes(rule.match.toLowerCase())) {
            return rule.name;
        }
    }
    return rawName;
}
/**
 * Config arrives as untyped JSON off disk — sanitize it defensively rather than trusting
 * every entry has the shape we expect.
 */
function sanitizeNameOverrides(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const rules = [];
    for (const entry of raw) {
        if (entry &&
            typeof entry === 'object' &&
            typeof entry.match === 'string' &&
            typeof entry.name === 'string' &&
            entry.match &&
            entry.name) {
            rules.push({ match: entry.match, name: entry.name });
        }
    }
    return rules;
}
//# sourceMappingURL=nameOverrides.js.map