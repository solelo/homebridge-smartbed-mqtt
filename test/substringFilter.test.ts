import { buildSubstringFilter } from '../src/discovery/substringFilter';

describe('buildSubstringFilter', () => {
  it('returns undefined when neither include nor exclude is configured', () => {
    expect(buildSubstringFilter(undefined, undefined)).toBeUndefined();
    expect(buildSubstringFilter([], [])).toBeUndefined();
  });

  it('excludes anything matching an exclude rule, case-insensitively', () => {
    const filter = buildSubstringFilter(undefined, ['snore relief'])!;
    expect(filter('Snore Relief Vibration')).toBe(false);
    expect(filter('SNORE RELIEF TILT')).toBe(false);
    expect(filter('Head Motor')).toBe(true);
  });

  it('only includes things matching an include rule when one is set', () => {
    const filter = buildSubstringFilter(['head', 'foot'], undefined)!;
    expect(filter('Head Motor')).toBe(true);
    expect(filter('Foot Motor')).toBe(true);
    expect(filter('Massage Wave')).toBe(false);
  });

  it('applies exclude even when the value also matches an include rule', () => {
    const filter = buildSubstringFilter(['motor'], ['foot'])!;
    expect(filter('Head Motor')).toBe(true);
    expect(filter('Foot Motor')).toBe(false);
  });

  it('trims and drops empty strings from both lists', () => {
    const filter = buildSubstringFilter(['  ', ''], ['  snore  '])!;
    // include list collapses to empty (only blanks), so it should not restrict anything
    expect(filter('Head Motor')).toBe(true);
    expect(filter('Snore Relief')).toBe(false);
  });
});
