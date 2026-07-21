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
export type TemplateValue = string | number | boolean | null;
interface ParsedTemplate {
    /** Dot/bracket path into the parsed JSON payload, e.g. ['foo', 'bar']. Empty = raw value. */
    path: string[];
    /** Optional trailing filter. */
    filter?: 'int' | 'float' | 'round';
    roundDigits?: number;
    /** True if this is the `{{ 1 if X else 0 }}` boolean-coercion pattern. */
    booleanCoerce?: boolean;
}
/**
 * Attempt to parse a value_template string into our tiny grammar. Returns `undefined`
 * (never throws) if the template is outside what we support.
 */
export declare function parseTemplate(template: string | undefined): ParsedTemplate | undefined;
/**
 * Resolve a parsed template against a raw MQTT payload string. `rawPayload` is used
 * directly for the bare `{{ value }}` case; otherwise it is JSON-parsed for
 * `value_json.*` access. Never throws — returns `undefined` on any failure.
 */
export declare function resolveTemplate(parsed: ParsedTemplate, rawPayload: string): TemplateValue | undefined;
export {};
