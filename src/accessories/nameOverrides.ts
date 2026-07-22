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
export function applyNameOverrides(rawName: string, overrides: NameOverrideRule[] | undefined): string {
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
export function sanitizeNameOverrides(raw: unknown): NameOverrideRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const rules: NameOverrideRule[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).match === 'string' &&
      typeof (entry as Record<string, unknown>).name === 'string' &&
      (entry as Record<string, unknown>).match &&
      (entry as Record<string, unknown>).name
    ) {
      rules.push({ match: (entry as Record<string, unknown>).match as string, name: (entry as Record<string, unknown>).name as string });
    }
  }
  return rules;
}
