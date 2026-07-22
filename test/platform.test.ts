import { EventEmitter } from 'events';

class FakeMqttClient extends EventEmitter {
  subscribe = jest.fn((_topic: string, _opts: unknown, cb: (err?: Error) => void) => cb());
  publish = jest.fn((_topic: string, _payload: string, _opts: unknown, cb: (err?: Error) => void) => cb());
  end = jest.fn((_force: boolean, _opts: unknown, cb: () => void) => cb());
}

let lastClient: FakeMqttClient;
const connectMock = jest.fn(() => {
  lastClient = new FakeMqttClient();
  return lastClient;
});
jest.mock('mqtt', () => ({ connect: () => connectMock() }));

import { SmartBedMqttPlatform, SmartBedPlatformConfig } from '../src/platform';
import { makeFakeApi, makeFakeLogger, Service } from './mocks/hap';

// Matches platform.ts's default accessoryPruneMinutes (5) when not overridden by config.
const DEFAULT_PRUNE_MS = 5 * 60_000;
const DISCOVERY_SETTLE_MS = 1500;

function setup(config: SmartBedPlatformConfig) {
  const api = makeFakeApi();
  const log = makeFakeLogger();
  const platform = new SmartBedMqttPlatform(log as any, config, api as any);
  return { api, log, platform };
}

describe('SmartBedMqttPlatform', () => {
  beforeEach(() => {
    connectMock.mockClear();
  });

  it('refuses to start (and never touches MQTT) when mqttHost is not configured', () => {
    jest.useFakeTimers();
    const { api, log } = setup({ platform: 'SmartBedMqtt', name: 'test' });
    api.emit('didFinishLaunching');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('No "mqttHost"'));
    expect(connectMock).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('discovers a new bed and registers it once its discovery message settles', () => {
    jest.useFakeTimers();
    const { api } = setup({ platform: 'SmartBedMqtt', name: 'test', mqttHost: 'broker.local' });
    api.emit('didFinishLaunching');
    expect(connectMock).toHaveBeenCalledTimes(1);

    lastClient.emit(
      'message',
      'homeassistant/switch/bed1/light/config',
      Buffer.from(JSON.stringify({ name: 'Light', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);

    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    const [, , accessories] = api.registerPlatformAccessories.mock.calls[0];
    expect(accessories[0].displayName).toBe('My Bed');
    jest.useRealTimers();
  });

  it('excludeDevices filters out a matching bed name entirely', () => {
    jest.useFakeTimers();
    const { api } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      excludeDevices: ['guest'],
    });
    api.emit('didFinishLaunching');
    lastClient.emit(
      'message',
      'homeassistant/switch/bed1/light/config',
      Buffer.from(JSON.stringify({ device: { identifiers: 'bed1', name: 'Guest Room Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('includeDevices restricts registration to only matching bed names', () => {
    jest.useFakeTimers();
    const { api } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      includeDevices: ['master'],
    });
    api.emit('didFinishLaunching');
    lastClient.emit(
      'message',
      'homeassistant/switch/bed1/light/config',
      Buffer.from(JSON.stringify({ device: { identifiers: 'bed1', name: 'Guest Room Bed' } })),
    );
    lastClient.emit(
      'message',
      'homeassistant/switch/bed2/light/config',
      Buffer.from(JSON.stringify({ device: { identifiers: 'bed2', name: 'Master Bedroom Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    expect(api.registerPlatformAccessories.mock.calls[0][2][0].displayName).toBe('Master Bedroom Bed');
    jest.useRealTimers();
  });

  it('excludeEntities hides a matching control while keeping the rest of the bed', () => {
    jest.useFakeTimers();
    const { api } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      excludeEntities: ['snore relief'],
    });
    api.emit('didFinishLaunching');
    lastClient.emit(
      'message',
      'homeassistant/switch/bed1/snore/config',
      Buffer.from(JSON.stringify({ name: 'Snore Relief Vibration', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    lastClient.emit(
      'message',
      'homeassistant/cover/bed1/head/config',
      Buffer.from(JSON.stringify({ name: 'Head Motor', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    const accessory = api.registerPlatformAccessories.mock.calls[0][2][0];
    expect(accessory.services.some((s: any) => s.displayName === 'Snore Relief Vibration')).toBe(false);
    expect(accessory.services.some((s: any) => s.displayName === 'Head Motor')).toBe(true);
    jest.useRealTimers();
  });

  it('hideTemperatureSensor/hideHumiditySensor/hideCo2Sensor omit only the matching sensor types', () => {
    jest.useFakeTimers();
    const { api } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      hideTemperatureSensor: true,
      hideCo2Sensor: true,
    });
    api.emit('didFinishLaunching');
    lastClient.emit(
      'message',
      'homeassistant/sensor/bed1/temp/config',
      Buffer.from(JSON.stringify({ device_class: 'temperature', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    lastClient.emit(
      'message',
      'homeassistant/sensor/bed1/humidity/config',
      Buffer.from(JSON.stringify({ device_class: 'humidity', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    lastClient.emit(
      'message',
      'homeassistant/sensor/bed1/co2/config',
      Buffer.from(JSON.stringify({ device_class: 'carbon_dioxide', device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);

    const accessory = api.registerPlatformAccessories.mock.calls[0][2][0];
    const serviceUuids = accessory.services.map((s: any) => s.UUID);
    expect(serviceUuids).not.toContain(Service.TemperatureSensor.UUID);
    expect(serviceUuids).not.toContain(Service.CarbonDioxideSensor.UUID);
    expect(serviceUuids).toContain(Service.HumiditySensor.UUID);
    jest.useRealTimers();
  });

  it('prunes a cached accessory that is never re-claimed within the grace period', () => {
    jest.useFakeTimers();
    const { api, platform } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      accessoryPruneMinutes: 1,
    });
    const staleUuid = api.hap.uuid.generate('smartbed-mqtt:long-gone-bed');
    const staleAccessory = new api.platformAccessory('Long Gone Bed', staleUuid);
    platform.configureAccessory(staleAccessory as any);

    api.emit('didFinishLaunching');
    jest.advanceTimersByTime(60_000 + 1);

    expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-smartbed-mqtt',
      'SmartBedMqtt',
      [staleAccessory],
    );
    jest.useRealTimers();
  });

  it('does not prune a cached accessory whose device re-settles before the grace period ends', () => {
    jest.useFakeTimers();
    const { api, platform } = setup({
      platform: 'SmartBedMqtt',
      name: 'test',
      mqttHost: 'broker.local',
      accessoryPruneMinutes: 1,
    });
    const uuid = api.hap.uuid.generate('smartbed-mqtt:bed1');
    const cached = new api.platformAccessory('My Bed', uuid);
    platform.configureAccessory(cached as any);

    api.emit('didFinishLaunching');
    lastClient.emit(
      'message',
      'homeassistant/switch/bed1/light/config',
      Buffer.from(JSON.stringify({ device: { identifiers: 'bed1', name: 'My Bed' } })),
    );
    jest.advanceTimersByTime(DISCOVERY_SETTLE_MS);
    jest.advanceTimersByTime(60_000 + 1);

    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('defaults the grace period to 5 minutes when accessoryPruneMinutes is not configured (regression: 45s was too short for BLE beds that can take minutes to reconnect)', () => {
    jest.useFakeTimers();
    const { api, platform } = setup({ platform: 'SmartBedMqtt', name: 'test', mqttHost: 'broker.local' });
    const staleUuid = api.hap.uuid.generate('smartbed-mqtt:slow-reconnect-bed');
    const staleAccessory = new api.platformAccessory('Slow Reconnect Bed', staleUuid);
    platform.configureAccessory(staleAccessory as any);

    api.emit('didFinishLaunching');

    jest.advanceTimersByTime(45_000);
    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_PRUNE_MS - 45_000 + 1);
    expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-smartbed-mqtt',
      'SmartBedMqtt',
      [staleAccessory],
    );
    jest.useRealTimers();
  });

  it('destroys the MQTT connection on shutdown without throwing', async () => {
    jest.useFakeTimers();
    const { api } = setup({ platform: 'SmartBedMqtt', name: 'test', mqttHost: 'broker.local' });
    api.emit('didFinishLaunching');
    api.emit('shutdown');
    jest.useRealTimers();
    await Promise.resolve();
    expect(lastClient.end).toHaveBeenCalled();
  });
});
