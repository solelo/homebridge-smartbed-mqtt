import { DiscoveredEntity } from '../discovery/types';
import { EntityHandler, HandlerContext } from './handlers/base';
import { CoverHandler } from './handlers/coverHandler';
import { SwitchHandler, BinarySensorHandler } from './handlers/switchHandler';
import { LightHandler } from './handlers/lightHandler';
import { ButtonHandler } from './handlers/buttonHandler';
import { SensorHandler, sensorIsSupported } from './handlers/sensorHandler';
import { NumberHandler } from './handlers/numberHandler';
import { SelectHandler } from './handlers/selectHandler';

/**
 * Central place mapping an HA discovery `component` (+ `device_class` where relevant) to
 * the HomeKit-facing handler that will represent it. Returning `undefined` means "we
 * intentionally don't expose this entity" — always accompanied by a log line explaining
 * why, so a missing tile is never a silent mystery.
 */
export function createHandler(entity: DiscoveredEntity, ctx: HandlerContext): EntityHandler | undefined {
  switch (entity.component) {
    case 'cover':
      return new CoverHandler(entity, ctx);
    case 'switch':
      return new SwitchHandler(entity, ctx);
    case 'light':
      return new LightHandler(entity, ctx);
    case 'button':
      return new ButtonHandler(entity, ctx);
    case 'number':
      return new NumberHandler(entity, ctx);
    case 'select':
      return new SelectHandler(entity, ctx);
    case 'binary_sensor':
      return new BinarySensorHandler(entity, ctx);
    case 'sensor':
      if (!sensorIsSupported(entity.config.device_class)) {
        ctx.log.warn(
          `[${entity.deviceName}] Sensor "${entity.objectId}" (device_class: ${entity.config.device_class ?? 'none'}) has no ` +
            'HomeKit equivalent and will not be exposed. Supported: temperature, humidity, carbon_dioxide.',
        );
        return undefined;
      }
      if (ctx.hiddenSensorClasses?.has(entity.config.device_class!)) {
        ctx.log.debug(
          `[${entity.deviceName}] Sensor "${entity.objectId}" (device_class: ${entity.config.device_class}) is hidden by config.`,
        );
        return undefined;
      }
      return new SensorHandler(entity, ctx);
    case 'fan':
      ctx.log.warn(
        `[${entity.deviceName}] Entity "${entity.objectId}" uses the "fan" component, which smartbed-mqtt does not currently ` +
          'publish for bed entities; skipping.',
      );
      return undefined;
    default:
      ctx.log.warn(`[${entity.deviceName}] Unrecognized entity component "${entity.component}" for "${entity.objectId}"; skipping.`);
      return undefined;
  }
}
