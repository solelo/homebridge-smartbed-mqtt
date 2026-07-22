import { CoverHandler } from '../../src/accessories/handlers/coverHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('CoverHandler', () => {
  jest.useFakeTimers();

  it('scales an absolute device position into a 0-100 HomeKit position', () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      position_topic: 'bed1/head/position',
      position_open: 100,
      position_closed: 0,
    });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    handler.onTopicMessage('bed1/head/position', Buffer.from('50'));
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBe(50);
    expect(service.getCharacteristic(Characteristic.TargetPosition).value).toBe(50);
  });

  it('scales correctly for an inverted or offset device range', () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      position_topic: 'bed1/head/position',
      position_open: 0,
      position_closed: 90,
    });
    const handler = new CoverHandler(entity, ctx);
    handler.setupService();
    handler.onTopicMessage('bed1/head/position', Buffer.from('45'));
    const service = (handler as any).service;
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBe(50);
  });

  it('publishes a scaled absolute position to set_position_topic on TargetPosition set', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      set_position_topic: 'bed1/head/set',
      position_open: 100,
      position_closed: 0,
    });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(75);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/head/set', payload: '75', retain: false }]);
  });

  it('falls back to OPEN/CLOSE payloads near the extremes when there is no set_position_topic', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      command_topic: 'bed1/head/cmd',
      payload_open: 'OPEN',
      payload_close: 'CLOSE',
    });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(95);
    expect(ctx.mqtt.published.at(-1)).toEqual({ topic: 'bed1/head/cmd', payload: 'OPEN', retain: false });

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(5);
    expect(ctx.mqtt.published.at(-1)).toEqual({ topic: 'bed1/head/cmd', payload: 'CLOSE', retain: false });
  });

  it('treats every position as open/close around the 50% midpoint, so no drag is ever a no-op', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      command_topic: 'bed1/head/cmd',
      payload_open: 'OPEN',
      payload_close: 'CLOSE',
    });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(50);
    expect(ctx.mqtt.published.at(-1)).toEqual({ topic: 'bed1/head/cmd', payload: 'OPEN', retain: false });

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(49);
    expect(ctx.mqtt.published.at(-1)).toEqual({ topic: 'bed1/head/cmd', payload: 'CLOSE', retain: false });
  });

  it('warns without publishing when the direction requested has no payload configured at all', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', {
      command_topic: 'bed1/head/cmd',
      payload_open: 'OPEN',
      // payload_close intentionally omitted
    });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(20);
    expect(ctx.mqtt.published).toHaveLength(0);
    expect(ctx.log.warn).toHaveBeenCalled();
  });

  it('optimistically reflects target as current after the settle delay if no real update arrives', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', { set_position_topic: 'bed1/head/set' });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(60);
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBeUndefined();
    jest.advanceTimersByTime(4000);
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBe(60);
  });

  it('does not clobber current position if a newer target superseded the optimistic one', async () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', { set_position_topic: 'bed1/head/set' });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());

    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(60);
    jest.advanceTimersByTime(2000);
    await service.getCharacteristic(Characteristic.TargetPosition).triggerSet(80);
    jest.advanceTimersByTime(2000); // first timer (for 60) fires now, should be a no-op
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBeUndefined();
    jest.advanceTimersByTime(2000); // second timer (for 80) fires
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBe(80);
  });

  it('ignores a non-numeric position payload rather than throwing or setting NaN', () => {
    const ctx = makeContext();
    const entity = makeEntity('cover', 'head', { position_topic: 'bed1/head/position' });
    const handler = new CoverHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/head/position', Buffer.from('not-a-number'));
    expect(service.getCharacteristic(Characteristic.CurrentPosition).value).toBeUndefined();
  });
});
