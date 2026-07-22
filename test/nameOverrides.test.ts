import { applyNameOverrides, sanitizeNameOverrides } from '../src/accessories/nameOverrides';

describe('applyNameOverrides', () => {
  it('passes the raw name through unchanged when there are no overrides', () => {
    expect(applyNameOverrides('Adruno', undefined)).toBe('Adruno');
    expect(applyNameOverrides('Adruno', [])).toBe('Adruno');
  });

  it('matches case-insensitively as a substring', () => {
    expect(applyNameOverrides('Adruno Sensor 1', [{ match: 'adruno', name: 'Bed Controller' }])).toBe('Bed Controller');
  });

  it('leaves the name unchanged when nothing matches', () => {
    expect(applyNameOverrides('Adruno Sensor 1', [{ match: 'connectivity', name: 'Bed Connection' }])).toBe('Adruno Sensor 1');
  });

  it('uses the first matching rule when multiple would match', () => {
    const overrides = [
      { match: 'sensor', name: 'First Match' },
      { match: 'adruno', name: 'Second Match' },
    ];
    expect(applyNameOverrides('Adruno Sensor 1', overrides)).toBe('First Match');
  });

  it('ignores a rule with an empty match or name', () => {
    expect(applyNameOverrides('Adruno', [{ match: '', name: 'Bed Controller' }])).toBe('Adruno');
    expect(applyNameOverrides('Adruno', [{ match: 'adruno', name: '' }])).toBe('Adruno');
  });
});

describe('sanitizeNameOverrides', () => {
  it('returns an empty array for anything that is not an array', () => {
    expect(sanitizeNameOverrides(undefined)).toEqual([]);
    expect(sanitizeNameOverrides(null)).toEqual([]);
    expect(sanitizeNameOverrides('not an array')).toEqual([]);
    expect(sanitizeNameOverrides({ match: 'x', name: 'y' })).toEqual([]);
  });

  it('keeps only well-formed {match, name} string entries', () => {
    const input = [
      { match: 'adruno', name: 'Bed Controller' },
      { match: 'connectivity', name: 'Bed Connection' },
      { match: 123, name: 'bad match type' },
      { match: 'no name field' },
      null,
      'a string, not an object',
      { match: '', name: 'empty match' },
      { match: 'empty name', name: '' },
    ];
    expect(sanitizeNameOverrides(input)).toEqual([
      { match: 'adruno', name: 'Bed Controller' },
      { match: 'connectivity', name: 'Bed Connection' },
    ]);
  });
});
