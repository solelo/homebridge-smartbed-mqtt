import { EventEmitter } from 'events';
import { BedAccessoryManager } from '../src/accessories/bedAccessoryManager';
import { DeviceEntities } from '../src/discovery/discoveryManager';
import { makeFakeApi, makeFakeLogger, Characteristic, Service } from './mocks/hap';
import { FakeMqttManager } from './mocks/mqttManager';
import { makeEntity } from './mocks/entity';

class FakeDiscoveryManager extends EventEmitter {}

function setup() {
  const api = makeFakeApi();
  const log = makeFakeLogger();
  const mqtt = new FakeMqttManager();
  const discovery = new FakeDiscoveryManager();
  const cachedAccessories = new Map<string, any>();
  const registerAccessories = jest.fn();
  const unregisterAccessories = jest.fn();
  const claimedUuids = new Set<string>();
  const claimAccessory = jest.fn((accessory: any) => {
    claimedUuids.add(accessory.UUID);
  });

  const manager = new BedAccessoryManager(
    api as any,
    log as any,
    mqtt as any,
    discovery as any,
    cachedAccessories,
    registerAccessories,
    unregisterAccessories,
    claimAccessory,
  );

  return {
    api,
    log,
    mqtt,
    discovery,
    cachedAccessories,
    registerAccessories,
    unregisterAccessories,
    claimAccessory,
    claimedUuids,
    manager,
  };
}

function device(overrides: Partial<DeviceEntities> = {}): DeviceEntities {
  return {
    deviceKey: 'bed1',
    deviceName: 'My Bed',
    manufacturer: 'ACME',
    model: 'Model X',
    entities: [
      makeEntity('switch', 'light', {
        name: 'Light',
        state_topic: 'bed1/light/state',
        command_topic: 'bed1/light/set',
      }),
    ],
    ...overrides,
  };
}

describe('BedAccessoryManager', () => {
  it('creates and registers a new accessory the first time a device settles', () => {
    const { discovery, registerAccessories } = setup();
    discovery.emit('deviceSettled', device());
    expect(registerAccessories).toHaveBeenCalledTimes(1);
    const [[accessories]] = registerAccessories.mock.calls;
    expect(accessories[0].displayName).toBe('My Bed');
  });

  it('sets AccessoryInformation from the device metadata', () => {
    const { discovery, registerAccessories } = setup();
    discovery.emit('deviceSettled', device());
    const accessory = registerAccessories.mock.calls[0][0][0];
    const info = accessory.getService(Service.AccessoryInformation);
    expect(info.getCharacteristic(Characteristic.Manufacturer).value).toBe('ACME');
    expect(info.getCharacteristic(Characteristic.Model).value).toBe('Model X');
    expect(info.getCharacteristic(Characteristic.SerialNumber).value).toBe('bed1');
  });

  it('reattaches (does not re-register) a cached accessory matching the device UUID', () => {
    const { api, discovery, cachedAccessories, registerAccessories } = setup();
    const uuid = api.hap.uuid.generate('smartbed-mqtt:bed1');
    const cached = new api.platformAccessory('Old Name', uuid);
    cachedAccessories.set(uuid, cached);

    discovery.emit('deviceSettled', device());

    expect(registerAccessories).not.toHaveBeenCalled();
  });

  it('claims a reattached-from-cache accessory just like a newly-registered one (regression: previously only new accessories were claimed, so every cached bed would get pruned ~45s after each Homebridge restart)', () => {
    const { api, discovery, cachedAccessories, claimedUuids } = setup();
    const uuid = api.hap.uuid.generate('smartbed-mqtt:bed1');
    const cached = new api.platformAccessory('Old Name', uuid);
    cachedAccessories.set(uuid, cached);

    discovery.emit('deviceSettled', device());

    expect(claimedUuids.has(uuid)).toBe(true);
  });

  it('claims a brand-new accessory too', () => {
    const { api, discovery, claimedUuids } = setup();
    discovery.emit('deviceSettled', device());
    const uuid = api.hap.uuid.generate('smartbed-mqtt:bed1');
    expect(claimedUuids.has(uuid)).toBe(true);
  });

  it('routes an MQTT state message to the correct handler via the state-topic index', () => {
    const { discovery, mqtt, registerAccessories } = setup();
    discovery.emit('deviceSettled', device());
    const accessory = registerAccessories.mock.calls[0][0][0];

    mqtt.emitMessage('bed1/light/state', 'ON');

    const service = accessory.getServiceById(Service.Switch, 'light');
    expect(service.getCharacteristic(Characteristic.On).value).toBe(true);
  });

  it('detaches entities that disappear from a later settle batch for the same device', () => {
    const { discovery, registerAccessories } = setup();
    discovery.emit('deviceSettled', device());
    const accessory = registerAccessories.mock.calls[0][0][0];
    expect(accessory.getServiceById(Service.Switch, 'light')).toBeDefined();

    discovery.emit('deviceSettled', device({ entities: [] }));
    expect(accessory.getServiceById(Service.Switch, 'light')).toBeUndefined();
  });

  it('removes the accessory entirely on deviceRemoved', () => {
    const { discovery, registerAccessories, unregisterAccessories } = setup();
    discovery.emit('deviceSettled', device());
    const accessory = registerAccessories.mock.calls[0][0][0];

    discovery.emit('deviceRemoved', 'bed1');
    expect(unregisterAccessories).toHaveBeenCalledWith([accessory]);
  });

  it('removes just one entity service on entityRemoved without tearing down the whole accessory', () => {
    const { discovery, registerAccessories, unregisterAccessories } = setup();
    const twoEntityDevice = device({
      entities: [
        makeEntity('switch', 'light', { state_topic: 'bed1/light/state' }),
        makeEntity('switch', 'fan', { state_topic: 'bed1/fan/state' }),
      ],
    });
    discovery.emit('deviceSettled', twoEntityDevice);
    const accessory = registerAccessories.mock.calls[0][0][0];

    discovery.emit('entityRemoved', 'bed1', 'homeassistant/switch/bed1/light/config');

    expect(accessory.getServiceById(Service.Switch, 'light')).toBeUndefined();
    expect(accessory.getServiceById(Service.Switch, 'fan')).toBeDefined();
    expect(unregisterAccessories).not.toHaveBeenCalled();
  });

  it('marks a service StatusFault when its availability_topic reports the unavailable payload', () => {
    const { discovery, mqtt, registerAccessories } = setup();
    const d = device({
      entities: [
        makeEntity('switch', 'light', {
          state_topic: 'bed1/light/state',
          availability_topic: 'bed1/light/avail',
          payload_available: 'online',
          payload_not_available: 'offline',
        }),
      ],
    });
    discovery.emit('deviceSettled', d);
    const accessory = registerAccessories.mock.calls[0][0][0];
    const service = accessory.getServiceById(Service.Switch, 'light');
    service.getCharacteristic(Characteristic.StatusFault); // touch it so the mock tracks it

    mqtt.emitMessage('bed1/light/avail', 'offline');
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.GENERAL_FAULT);

    mqtt.emitMessage('bed1/light/avail', 'online');
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.NO_FAULT);
  });

  it('marks availability stale (offline) after AVAILABILITY_STALE_MS with no report', () => {
    jest.useFakeTimers();
    const { discovery, mqtt, registerAccessories } = setup();
    const d = device({
      entities: [
        makeEntity('switch', 'light', {
          state_topic: 'bed1/light/state',
          availability_topic: 'bed1/light/avail',
        }),
      ],
    });
    discovery.emit('deviceSettled', d);
    const accessory = registerAccessories.mock.calls[0][0][0];
    const service = accessory.getServiceById(Service.Switch, 'light');
    service.getCharacteristic(Characteristic.StatusFault);

    mqtt.emitMessage('bed1/light/avail', 'online');
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.NO_FAULT);

    jest.advanceTimersByTime(5 * 60 * 1000 + 60_000);
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.GENERAL_FAULT);
    jest.useRealTimers();
  });

  it('ignores an availability payload that matches neither payload_available nor payload_not_available', () => {
    const { discovery, mqtt, registerAccessories } = setup();
    const d = device({
      entities: [
        makeEntity('switch', 'light', {
          state_topic: 'bed1/light/state',
          availability_topic: 'bed1/light/avail',
        }),
      ],
    });
    discovery.emit('deviceSettled', d);
    const accessory = registerAccessories.mock.calls[0][0][0];
    const service = accessory.getServiceById(Service.Switch, 'light');
    service.getCharacteristic(Characteristic.StatusFault);

    expect(() => mqtt.emitMessage('bed1/light/avail', 'garbage-payload')).not.toThrow();
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBeUndefined();
  });
});
