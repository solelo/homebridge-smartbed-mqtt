import { FakePlatformAccessory, makeFakeApi, makeFakeLogger } from './hap';
import { FakeMqttManager } from './mqttManager';

/**
 * Returned loosely-typed (not as the real `HandlerContext`) on purpose: `HandlerContext`
 * pins `mqtt`/`accessory` to the real `homebridge`/`MqttManager` classes, which have
 * private members that make them structurally incompatible with any stand-in — including
 * our own fakes. `any` lets call sites pass this straight into handler constructors while
 * still freely asserting on `ctx.mqtt.published`, `ctx.accessory.services`, etc.
 */
export function makeContext(): any {
  const api = makeFakeApi();
  const accessory = new FakePlatformAccessory('My Bed', 'uuid:bed1');
  const mqtt = new FakeMqttManager();
  return {
    api,
    log: makeFakeLogger(),
    mqtt,
    accessory,
  };
}
