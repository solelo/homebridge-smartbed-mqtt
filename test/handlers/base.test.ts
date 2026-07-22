import type { Service } from 'homebridge';
import { EntityHandler } from '../../src/accessories/handlers/base';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Service as FakeServiceCtor } from '../mocks/hap';

class TestHandler extends EntityHandler {
  get listenTopics(): string[] {
    return [];
  }
  setupService(): Service | undefined {
    const service = this.ctx.accessory.addService(FakeServiceCtor.Switch as any, this.friendlyName(), this.entity.objectId);
    this.service = service;
    return service;
  }
  onTopicMessage(): void {
    // unused in these tests
  }
  publicResolveValue(templateStr: string | undefined, payload: Buffer) {
    return this.resolveValue(templateStr, payload);
  }
  publicPublish(topic: string | undefined, payload: string) {
    return this.publish(topic, payload);
  }
}

describe('EntityHandler base behavior', () => {
  it('friendlyName() prefers config.name, falls back to objectId', () => {
    const ctx = makeContext();
    const named = new TestHandler(makeEntity('switch', 'obj1', { name: 'Nice Name' }), ctx);
    expect((named as any).friendlyName()).toBe('Nice Name');

    const unnamed = new TestHandler(makeEntity('switch', 'obj2', {}), ctx);
    expect((unnamed as any).friendlyName()).toBe('obj2');
  });

  it('friendlyName() applies a matching nameOverrides rule from the platform config', () => {
    const ctx = makeContext();
    ctx.nameOverrides = [{ match: 'adruno', name: 'Bed Controller' }];
    const handler = new TestHandler(makeEntity('switch', 'obj1', { name: 'Adruno Sensor 1' }), ctx);
    expect((handler as any).friendlyName()).toBe('Bed Controller');
  });

  it('resolveValue logs a warning and returns undefined for an unsupported template', () => {
    const ctx = makeContext();
    const handler = new TestHandler(makeEntity('switch', 'obj1', {}), ctx);
    const result = handler.publicResolveValue('{{ value_json.a if value_json.b else value_json.c }}', Buffer.from('{}'));
    expect(result).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalledWith(expect.stringContaining('Unsupported value_template'));
  });

  it('resolveValue resolves a supported template against the payload', () => {
    const ctx = makeContext();
    const handler = new TestHandler(makeEntity('switch', 'obj1', {}), ctx);
    const result = handler.publicResolveValue('{{ value_json.x }}', Buffer.from(JSON.stringify({ x: 7 })));
    expect(result).toBe(7);
  });

  it('publish() warns and does not call mqtt.publish when there is no command topic', () => {
    const ctx = makeContext();
    const handler = new TestHandler(makeEntity('switch', 'obj1', {}), ctx);
    handler.publicPublish(undefined, 'ON');
    expect(ctx.mqtt.published).toHaveLength(0);
    expect(ctx.log.warn).toHaveBeenCalledWith(expect.stringContaining('no command topic'));
  });

  it('publish() forwards to mqtt.publish when a topic is present', () => {
    const ctx = makeContext();
    const handler = new TestHandler(makeEntity('switch', 'obj1', {}), ctx);
    handler.publicPublish('bed1/obj1/set', 'ON');
    expect(ctx.mqtt.published).toEqual([{ topic: 'bed1/obj1/set', payload: 'ON', retain: false }]);
  });

  it('handleAvailability is a no-op if setupService() was never called', () => {
    const ctx = makeContext();
    const handler = new TestHandler(makeEntity('switch', 'obj1', {}), ctx);
    expect(() => handler.handleAvailability(false)).not.toThrow();
  });
});
