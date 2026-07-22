/**
 * Builds a case-insensitive substring include/exclude matcher, shared between the
 * whole-bed device filter and the per-entity/control filter. Returns `undefined` when
 * neither list is configured, so callers can skip filtering entirely rather than running
 * a no-op matcher on every discovery message.
 */
export function buildSubstringFilter(
  include: string[] | undefined,
  exclude: string[] | undefined,
): ((value: string) => boolean) | undefined {
  const inc = include?.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const exc = exclude?.map((s) => s.toLowerCase().trim()).filter(Boolean);

  if ((!inc || inc.length === 0) && (!exc || exc.length === 0)) {
    return undefined;
  }

  return (value: string) => {
    const lower = value.toLowerCase();
    if (inc && inc.length > 0 && !inc.some((s) => lower.includes(s))) {
      return false;
    }
    if (exc && exc.some((s) => lower.includes(s))) {
      return false;
    }
    return true;
  };
}
