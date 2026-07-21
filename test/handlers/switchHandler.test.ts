import { SwitchHandler, BinarySensorHandler } from '../../src/accessories/handlers/switchHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('SwitchHandler', () => {
  it('publishes payload_on/payload_off on set, and reflects state_topic updates on get', async () => {
    const ctx = makeContext();
    const entity = makeEntity('switch', 'light', {
      name: 'Under-bed light',
      state_topic: 'bed1/light/state',
      command_topic: 'bed1/light/set',
      payload_on: 'ON',
      payload_off: 'OFF',
    });
    const handler = new SwitchHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/light/set', payload: 'ON', retain: false }]);

    handler.onTopicMessage('bed1/light/state', Buffer.from('ON'));
    expect(await service.getCharacteristic(Characteristic.On).triggerGet()).toBe(true);

    handler.onTopicMessage('bed1/light/state', Buffer.from('OFF'));
    expect(await service.getCharacteristic(Characteristic.On).triggerGet()).toBe(false);
  });

  it('only updates optimistic local state when optimistic:true is configured', async () => {
    const ctx = makeContext();
    const entity = makeEntity('switch', 'light', {
      command_topic: 'bed1/light/set',
      optimistic: true,
    });
    const handler = new SwitchHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(await service.getCharacteristic(Characteristic.On).triggerGet()).toBe(true);
  });

  it('ignores messages on unrelated topics', () => {
    const ctx = makeContext();
    const entity = makeEntity('switch', 'light', { state_topic: 'bed1/light/state' });
    const handler = new SwitchHandler(entity, ctx);
    handler.setupService();
    expect(() => handler.onTopicMessage('unrelated/topic', Buffer.from('ON'))).not.toThrow();
  });

  it('reuses an existing service by subtype instead of adding a duplicate', () => {
    const ctx = makeContext();
    const entity = makeEntity('switch', 'light', {});
    new SwitchHandler(entity, ctx).setupService();
    new SwitchHandler(entity, ctx).setupService();
    const matching = ctx.accessory.services.filter((s: any) => s.subtype === 'light');
    expect(matching).toHaveLength(1);
  });

  it('surfaces availability via StatusFault when the service supports it', () => {
    const ctx = makeContext();
    const entity = makeEntity('switch', 'light', {});
    const handler = new SwitchHandler(entity, ctx);
    const service = asFake(handler.setupService());
    // Switch service in this mock doesn't declare StatusFault until first touched;
    // exercise it explicitly the way a real HAP Switch service with that optional
    // characteristic would.
    service.getCharacteristic(Characteristic.StatusFault);
    handler.handleAvailability(false);
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.GENERAL_FAULT);
    handler.handleAvailability(true);
    expect(service.getCharacteristic(Characteristic.StatusFault).value).toBe(Characteristic.StatusFault.NO_FAULT);
  });
});

describe('BinarySensorHandler', () => {
  it('maps payload_on to CONTACT_NOT_DETECTED and anything else to CONTACT_DETECTED', () => {
    const ctx = makeContext();
    const entity = makeEntity('binary_sensor', 'presence', {
      state_topic: 'bed1/presence/state',
      payload_on: 'ON',
    });
    const handler = new BinarySensorHandler(entity, ctx);
    const service = asFake(handler.setupService());

    handler.onTopicMessage('bed1/presence/state', Buffer.from('ON'));
    expect(service.getCharacteristic(Characteristic.ContactSensorState).value).toBe(
      Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    );

    handler.onTopicMessage('bed1/presence/state', Buffer.from('OFF'));
    expect(service.getCharacteristic(Characteristic.ContactSensorState).value).toBe(
      Characteristic.ContactSensorState.CONTACT_DETECTED,
    );
  });

  it('ignores an update with an unsupported value_template rather than throwing', () => {
    const ctx = makeContext();
    const entity = makeEntity('binary_sensor', 'presence', {
      state_topic: 'bed1/presence/state',
      value_template: '{{ value_json.foo() }}',
    });
    const handler = new BinarySensorHandler(entity, ctx);
    handler.setupService();
    expect(() => handler.onTopicMessage('bed1/presence/state', Buffer.from('ON'))).not.toThrow();
    expect(ctx.log.warn).toHaveBeenCalled();
  });
});
