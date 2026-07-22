/**
 * Builds a case-insensitive substring include/exclude matcher, shared between the
 * whole-bed device filter and the per-entity/control filter. Returns `undefined` when
 * neither list is configured, so callers can skip filtering entirely rather than running
 * a no-op matcher on every discovery message.
 */
export declare function buildSubstringFilter(include: string[] | undefined, exclude: string[] | undefined): ((value: string) => boolean) | undefined;
