import { DiscoveryManager } from '../src/discovery/discoveryManager';
import { FakeMqttManager } from './mocks/mqttManager';
import { makeFakeLogger } from './mocks/hap';

function setup(deviceFilter?: (name: string) => boolean, entityFilter?: (name: string) => boolean) {
  const mqtt = new FakeMqttManager();
  const log = makeFakeLogger();
  const manager = new DiscoveryManager(mqtt as any, log as any, 'homeassistant', deviceFilter, entityFilter);
  manager.start();
  return { mqtt, log, manager };
}

describe('DiscoveryManager', () => {
  jest.useFakeTimers();

  it('subscribes to both the node-less and node-scoped discovery wildcards', () => {
    const { mqtt } = setup();
    expect(mqtt.subscribedTopics.has('homeassistant/+/+/config')).toBe(true);
    expect(mqtt.subscribedTopics.has('homeassistant/+/+/+/config')).toBe(true);
  });

  it('emits deviceSettled after the debounce window once entities stop changing', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);

    mqtt.emitMessage(
      'homeassistant/switch/bed1/light/config',
      JSON.stringify({
        name: 'Under-bed light',
        state_topic: 'bed1/light/state',
        command_topic: 'bed1/light/set',
        device: { identifiers: ['bed1'], name: 'My Bed' },
      }),
    );

    expect(onSettled).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1500);
    expect(onSettled).toHaveBeenCalledTimes(1);
    const device = onSettled.mock.calls[0][0];
    expect(device.deviceKey).toBe('bed1');
    expect(device.deviceName).toBe('My Bed');
    expect(device.entities).toHaveLength(1);
  });

  it('debounces multiple rapid entities for the same device into a single settle event', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);

    mqtt.emitMessage(
      'homeassistant/switch/bed1/a/config',
      JSON.stringify({ device: { identifiers: 'bed1' }, state_topic: 'bed1/a/state' }),
    );
    jest.advanceTimersByTime(1000);
    mqtt.emitMessage(
      'homeassistant/switch/bed1/b/config',
      JSON.stringify({ device: { identifiers: 'bed1' }, state_topic: 'bed1/b/state' }),
    );
    jest.advanceTimersByTime(1499);
    expect(onSettled).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0].entities).toHaveLength(2);
  });

  it('ignores malformed (non-JSON) discovery payloads without throwing', () => {
    const { mqtt, log } = setup();
    expect(() => mqtt.emitMessage('homeassistant/switch/bed1/x/config', 'not json{')).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('malformed'));
  });

  it('ignores non-object JSON payloads (arrays, primitives)', () => {
    const { mqtt, log } = setup();
    mqtt.emitMessage('homeassistant/switch/bed1/x/config', '[1,2,3]');
    mqtt.emitMessage('homeassistant/switch/bed1/y/config', '"just a string"');
    mqtt.emitMessage('homeassistant/switch/bed1/z/config', 'null');
    expect(log.warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('expected a JSON object'))).toHaveLength(3);
  });

  it('ignores discovery topics for unrecognized components', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage('homeassistant/climate/bed1/x/config', JSON.stringify({ device: { identifiers: 'bed1' } }));
    jest.advanceTimersByTime(2000);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('ignores non-config topics entirely', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage('homeassistant/switch/bed1/x/state', 'ON');
    jest.advanceTimersByTime(2000);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('treats an empty payload as retraction and emits deviceRemoved once the last entity is gone', () => {
    const { mqtt, manager } = setup();
    const onRemoved = jest.fn();
    const onEntityRemoved = jest.fn();
    manager.on('deviceRemoved', onRemoved);
    manager.on('entityRemoved', onEntityRemoved);

    mqtt.emitMessage(
      'homeassistant/switch/bed1/x/config',
      JSON.stringify({ device: { identifiers: 'bed1' }, state_topic: 'bed1/x/state' }),
    );
    jest.advanceTimersByTime(1500);

    mqtt.emitMessage('homeassistant/switch/bed1/x/config', '');
    expect(onEntityRemoved).toHaveBeenCalledWith('bed1', 'homeassistant/switch/bed1/x/config');
    expect(onRemoved).toHaveBeenCalledWith('bed1');
  });

  it('re-settles (rather than removing the device) when one of several entities is retracted', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    const onRemoved = jest.fn();
    manager.on('deviceSettled', onSettled);
    manager.on('deviceRemoved', onRemoved);

    mqtt.emitMessage('homeassistant/switch/bed1/a/config', JSON.stringify({ device: { identifiers: 'bed1' } }));
    mqtt.emitMessage('homeassistant/switch/bed1/b/config', JSON.stringify({ device: { identifiers: 'bed1' } }));
    jest.advanceTimersByTime(1500);
    onSettled.mockClear();

    mqtt.emitMessage('homeassistant/switch/bed1/a/config', '');
    jest.advanceTimersByTime(1500);

    expect(onRemoved).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0].entities).toHaveLength(1);
  });

  it('applies the device filter, skipping excluded devices entirely', () => {
    const { mqtt, manager } = setup((name) => !name.toLowerCase().includes('guest'));
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage(
      'homeassistant/switch/bed1/x/config',
      JSON.stringify({ device: { identifiers: 'bed1', name: 'Guest Room Bed' } }),
    );
    jest.advanceTimersByTime(1500);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('applies the entity filter, excluding one control while keeping the rest of the device', () => {
    const { mqtt, manager } = setup(undefined, (name) => !name.toLowerCase().includes('snore relief'));
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage(
      'homeassistant/switch/bed1/snore/config',
      JSON.stringify({ name: 'Snore Relief Vibration', device: { identifiers: 'bed1' } }),
    );
    mqtt.emitMessage(
      'homeassistant/cover/bed1/head/config',
      JSON.stringify({ name: 'Head Motor', device: { identifiers: 'bed1' } }),
    );
    jest.advanceTimersByTime(1500);
    expect(onSettled).toHaveBeenCalledTimes(1);
    const entities = onSettled.mock.calls[0][0].entities;
    expect(entities).toHaveLength(1);
    expect(entities[0].config.name).toBe('Head Motor');
  });

  it('falls back to matching the entity filter against objectId when no name is published', () => {
    const { mqtt, manager } = setup(undefined, (name) => !name.toLowerCase().includes('snoretilt'));
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage(
      'homeassistant/switch/bed1/snoretilt/config',
      JSON.stringify({ device: { identifiers: 'bed1' } }),
    );
    jest.advanceTimersByTime(1500);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('subscribes to every listen-topic field an entity declares', () => {
    const { mqtt } = setup();
    mqtt.emitMessage(
      'homeassistant/cover/bed1/head/config',
      JSON.stringify({
        device: { identifiers: 'bed1' },
        position_topic: 'bed1/head/position',
        availability_topic: 'bed1/head/avail',
      }),
    );
    expect(mqtt.subscribedTopics.has('bed1/head/position')).toBe(true);
    expect(mqtt.subscribedTopics.has('bed1/head/avail')).toBe(true);
  });

  it('derives a fallback device key from nodeId/objectId when no device.identifiers is present', () => {
    const { mqtt, manager } = setup();
    const onSettled = jest.fn();
    manager.on('deviceSettled', onSettled);
    mqtt.emitMessage('homeassistant/switch/nodeA/objX/config', JSON.stringify({}));
    jest.advanceTimersByTime(1500);
    expect(onSettled.mock.calls[0][0].deviceKey).toBe('nodeA');
  });
});
