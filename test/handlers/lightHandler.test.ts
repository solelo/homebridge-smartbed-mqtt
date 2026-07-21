import { LightHandler } from '../../src/accessories/handlers/lightHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('LightHandler', () => {
  it('does not expose a Brightness characteristic when no brightness_command_topic is published', () => {
    const ctx = makeContext();
    const entity = makeEntity('light', 'underbed', { command_topic: 'bed1/light/set' });
    const handler = new LightHandler(entity, ctx);
    const service = asFake(handler.setupService());
    expect(service.testCharacteristic(Characteristic.Brightness)).toBe(false);
  });

  it('exposes Brightness and scales device <-> HomeKit percent when brightness_command_topic is present', async () => {
    const ctx = makeContext();
    const entity = makeEntity('light', 'underbed', {
      command_topic: 'bed1/light/set',
      brightness_command_topic: 'bed1/light/brightness/set',
      brightness_state_topic: 'bed1/light/brightness/state',
      brightness_scale: 255,
    });
    const handler = new LightHandler(entity, ctx);
    const service = asFake(handler.setupService());
    expect(service.testCharacteristic(Characteristic.Brightness)).toBe(true);

    await service.getCharacteristic(Characteristic.Brightness).triggerSet(50);
    expect(ctx.mqtt.published).toEqual([
      { topic: 'bed1/light/brightness/set', payload: '128', retain: false },
    ]);

    handler.onTopicMessage('bed1/light/brightness/state', Buffer.from('255'));
    expect(service.getCharacteristic(Characteristic.Brightness).value).toBe(100);
  });

  it('turns on/off via state_topic and command payloads', async () => {
    const ctx = makeContext();
    const entity = makeEntity('light', 'underbed', {
      command_topic: 'bed1/light/set',
      state_topic: 'bed1/light/state',
      payload_on: 'ON',
      payload_off: 'OFF',
    });
    const handler = new LightHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/light/set', payload: 'ON', retain: false }]);

    handler.onTopicMessage('bed1/light/state', Buffer.from('ON'));
    expect(service.getCharacteristic(Characteristic.On).value).toBe(true);
  });

  it('ignores a non-finite brightness state payload', () => {
    const ctx = makeContext();
    const entity = makeEntity('light', 'underbed', {
      brightness_command_topic: 'bed1/light/brightness/set',
      brightness_state_topic: 'bed1/light/brightness/state',
    });
    const handler = new LightHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/light/brightness/state', Buffer.from('garbage'));
    expect(service.getCharacteristic(Characteristic.Brightness).value).toBeUndefined();
  });
});
