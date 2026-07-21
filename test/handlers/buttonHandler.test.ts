import { ButtonHandler } from '../../src/accessories/handlers/buttonHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('ButtonHandler', () => {
  jest.useFakeTimers();

  it('publishes payload_press (or PRESS by default) and auto-resets after ~1s', async () => {
    const ctx = makeContext();
    const entity = makeEntity('button', 'flat_preset', { command_topic: 'bed1/preset/set' });
    const handler = new ButtonHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/preset/set', payload: 'PRESS', retain: false }]);
    expect(service.getCharacteristic(Characteristic.On).value).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(service.getCharacteristic(Characteristic.On).value).toBe(false);
  });

  it('uses a custom payload_press when configured', async () => {
    const ctx = makeContext();
    const entity = makeEntity('button', 'flat_preset', { command_topic: 'bed1/preset/set', payload_press: 'FLAT' });
    const handler = new ButtonHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/preset/set', payload: 'FLAT', retain: false }]);
  });

  it('does not publish when set to off', async () => {
    const ctx = makeContext();
    const entity = makeEntity('button', 'flat_preset', { command_topic: 'bed1/preset/set' });
    const handler = new ButtonHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.On).triggerSet(false);
    expect(ctx.mqtt.published).toHaveLength(0);
  });

  it('destroy() clears the pending reset timer without throwing', async () => {
    const ctx = makeContext();
    const entity = makeEntity('button', 'flat_preset', { command_topic: 'bed1/preset/set' });
    const handler = new ButtonHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(() => handler.destroy()).not.toThrow();
  });

  it('rapid double-press only schedules a single reset from the latest press', async () => {
    const ctx = makeContext();
    const entity = makeEntity('button', 'flat_preset', { command_topic: 'bed1/preset/set' });
    const handler = new ButtonHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    jest.advanceTimersByTime(500);
    await service.getCharacteristic(Characteristic.On).triggerSet(true);
    jest.advanceTimersByTime(500);
    expect(service.getCharacteristic(Characteristic.On).value).toBe(true);
    jest.advanceTimersByTime(500);
    expect(service.getCharacteristic(Characteristic.On).value).toBe(false);
  });
});
