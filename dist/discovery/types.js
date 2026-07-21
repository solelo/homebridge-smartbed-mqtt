"use strict";
/**
 * Types describing the subset of the Home Assistant MQTT Discovery schema that
 * smartbed-mqtt (and HA MQTT integrations in general) publish. We intentionally only
 * model the fields we act on. Unknown/extra fields are ignored, never trusted blindly.
 *
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownComponent = isKnownComponent;
exports.deviceKeyFromIdentifiers = deviceKeyFromIdentifiers;
const KNOWN_COMPONENTS = new Set([
    'cover',
    'switch',
    'light',
    'button',
    'sensor',
    'binary_sensor',
    'number',
    'select',
    'fan',
]);
function isKnownComponent(value) {
    return KNOWN_COMPONENTS.has(value);
}
/**
 * Derive a stable device key from an HA `device.identifiers` field, which may be a
 * single string, an array of strings, or (per spec) an array of [domain, id] tuples
 * serialized as arrays. We defensively coerce whatever we get into a single string.
 */
function deviceKeyFromIdentifiers(identifiers) {
    if (!identifiers) {
        return undefined;
    }
    if (typeof identifiers === 'string') {
        return identifiers;
    }
    if (Array.isArray(identifiers) && identifiers.length > 0) {
        // Flatten in case of nested [domain, id] tuples and join deterministically.
        const flat = identifiers.flat(2).map((v) => String(v));
        return flat.join(':');
    }
    return undefined;
}
//# sourceMappingURL=types.js.map