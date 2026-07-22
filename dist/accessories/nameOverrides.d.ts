/**
 * Different smartbed-mqtt bed integrations name their entities very differently — some
 * (e.g. Reverie) publish reasonably readable names, others pass through raw/technical
 * names (a BLE chip's advertised device name, an internal characteristic label, etc.)
 * that mean nothing in the Home app. Rather than special-case every bed brand/integration
 * smartbed-mqtt supports, this lets a user remap any control's displayed name themselves.
 */
export interface NameOverrideRule {
    /** Case-insensitive substring to match against the entity's raw HA name or object id. */
    match: string;
    /** Display name to use in HomeKit when this rule matches. */
    name: string;
}
/** First matching rule wins; the raw name passes through unchanged if nothing matches. */
export declare function applyNameOverrides(rawName: string, overrides: NameOverrideRule[] | undefined): string;
/**
 * Config arrives as untyped JSON off disk — sanitize it defensively rather than trusting
 * every entry has the shape we expect.
 */
export declare function sanitizeNameOverrides(raw: unknown): NameOverrideRule[];
