import { deviceKeyFromIdentifiers, isKnownComponent } from '../src/discovery/types';

describe('isKnownComponent', () => {
  it('accepts every documented HA component', () => {
    for (const c of ['cover', 'switch', 'light', 'button', 'sensor', 'binary_sensor', 'number', 'select', 'fan']) {
      expect(isKnownComponent(c)).toBe(true);
    }
  });

  it('rejects unknown/hostile component strings', () => {
    for (const c of ['climate', '__proto__', 'CoVeR', '', 'switch;DROP TABLE', 'a'.repeat(10000)]) {
      expect(isKnownComponent(c)).toBe(false);
    }
  });
});

describe('deviceKeyFromIdentifiers', () => {
  it('returns undefined for missing identifiers', () => {
    expect(deviceKeyFromIdentifiers(undefined)).toBeUndefined();
  });

  it('passes through a single string identifier', () => {
    expect(deviceKeyFromIdentifiers('bed-123')).toBe('bed-123');
  });

  it('joins an array of string identifiers', () => {
    expect(deviceKeyFromIdentifiers(['bed-123', 'zone-a'])).toBe('bed-123:zone-a');
  });

  it('flattens nested [domain, id] tuples per the HA spec', () => {
    expect(deviceKeyFromIdentifiers([['smartbed-mqtt', 'bed-123']] as unknown as string[])).toBe(
      'smartbed-mqtt:bed-123',
    );
  });

  it('returns undefined for an empty array', () => {
    expect(deviceKeyFromIdentifiers([])).toBeUndefined();
  });
});
