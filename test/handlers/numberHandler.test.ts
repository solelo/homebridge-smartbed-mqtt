import { NumberHandler } from '../../src/accessories/handlers/numberHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('NumberHandler', () => {
  it('maps the min/max device range onto a 0-100 RotationSpeed percentage', () => {
    const ctx = makeContext();
    const entity = makeEntity('number', 'intensity', { state_topic: 'bed1/intensity/state', min: 0, max: 10 });
    const handler = new NumberHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/intensity/state', Buffer.from('5'));
    expect(service.getCharacteristic(Characteristic.RotationSpeed).value).toBe(50);
    expect(service.getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.ACTIVE);
  });

  it('reports INACTIVE when percent is zero', () => {
    const ctx = makeContext();
    const entity = makeEntity('number', 'intensity', { state_topic: 'bed1/intensity/state', min: 0, max: 10 });
    const handler = new NumberHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/intensity/state', Buffer.from('0'));
    expect(service.getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.INACTIVE);
  });

  it('publishes a scaled device value on RotationSpeed set', async () => {
    const ctx = makeContext();
    const entity = makeEntity('number', 'intensity', { command_topic: 'bed1/intensity/set', min: 0, max: 10 });
    const handler = new NumberHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.RotationSpeed).triggerSet(50);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/intensity/set', payload: '5', retain: false }]);
  });

  it('publishes the minimum value when switched Active -> INACTIVE', async () => {
    const ctx = makeContext();
    const entity = makeEntity('number', 'intensity', { command_topic: 'bed1/intensity/set', min: 2, max: 10 });
    const handler = new NumberHandler(entity, ctx);
    const service = asFake(handler.setupService());
    await service.getCharacteristic(Characteristic.Active).triggerSet(Characteristic.Active.INACTIVE);
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/intensity/set', payload: '2', retain: false }]);
  });

  it('ignores non-numeric state updates', () => {
    const ctx = makeContext();
    const entity = makeEntity('number', 'intensity', { state_topic: 'bed1/intensity/state' });
    const handler = new NumberHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/intensity/state', Buffer.from('nope'));
    expect(service.getCharacteristic(Characteristic.RotationSpeed).value).toBeUndefined();
  });
});
