import { SelectHandler } from '../../src/accessories/handlers/selectHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, Service } from '../mocks/hap';

describe('SelectHandler', () => {
  jest.useFakeTimers();

  it('creates one momentary switch per option', () => {
    const ctx = makeContext();
    const entity = makeEntity('select', 'pattern', {
      command_topic: 'bed1/pattern/set',
      options: ['Wave', 'Pulse', 'Off'],
    });
    const handler = new SelectHandler(entity, ctx);
    handler.setupService();
    const switches = ctx.accessory.services.filter((s: any) => s.UUID === Service.Switch.UUID);
    expect(switches).toHaveLength(3);
  });

  it('publishes the option and auto-resets the switch after ~1s', async () => {
    const ctx = makeContext();
    const entity = makeEntity('select', 'pattern', {
      command_topic: 'bed1/pattern/set',
      options: ['Wave', 'Pulse'],
    });
    const handler = new SelectHandler(entity, ctx);
    handler.setupService();

    const waveSwitch = ctx.accessory.services.find((s: any) => s.subtype === 'pattern:Wave')!;
    await waveSwitch.getCharacteristic(Characteristic.On).triggerSet(true);

    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/pattern/set', payload: 'Wave', retain: false }]);
    expect(waveSwitch.getCharacteristic(Characteristic.On).value).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(waveSwitch.getCharacteristic(Characteristic.On).value).toBe(false);
  });

  it('does not publish when a switch is toggled off directly (only "on" triggers selection)', async () => {
    const ctx = makeContext();
    const entity = makeEntity('select', 'pattern', { command_topic: 'bed1/pattern/set', options: ['Wave'] });
    const handler = new SelectHandler(entity, ctx);
    handler.setupService();
    const waveSwitch = ctx.accessory.services.find((s: any) => s.subtype === 'pattern:Wave')!;
    await waveSwitch.getCharacteristic(Characteristic.On).triggerSet(false);
    expect(ctx.mqtt.published).toHaveLength(0);
  });

  it('skips the entity entirely (returns undefined) when no options are published', () => {
    const ctx = makeContext();
    const entity = makeEntity('select', 'pattern', { command_topic: 'bed1/pattern/set', options: [] });
    const handler = new SelectHandler(entity, ctx);
    expect(handler.setupService()).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalled();
  });

  it('destroy() clears pending reset timers without throwing', () => {
    const ctx = makeContext();
    const entity = makeEntity('select', 'pattern', { command_topic: 'bed1/pattern/set', options: ['Wave'] });
    const handler = new SelectHandler(entity, ctx);
    handler.setupService();
    const waveSwitch = ctx.accessory.services.find((s: any) => s.subtype === 'pattern:Wave')!;
    waveSwitch.getCharacteristic(Characteristic.On).triggerSet(true);
    expect(() => handler.destroy()).not.toThrow();
  });
});
