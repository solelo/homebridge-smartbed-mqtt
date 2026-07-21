import { createHandler } from '../src/accessories/handlerFactory';
import { CoverHandler } from '../src/accessories/handlers/coverHandler';
import { SwitchHandler, BinarySensorHandler } from '../src/accessories/handlers/switchHandler';
import { LightHandler } from '../src/accessories/handlers/lightHandler';
import { ButtonHandler } from '../src/accessories/handlers/buttonHandler';
import { SensorHandler } from '../src/accessories/handlers/sensorHandler';
import { NumberHandler } from '../src/accessories/handlers/numberHandler';
import { SelectHandler } from '../src/accessories/handlers/selectHandler';
import { makeContext } from './mocks/context';
import { makeEntity } from './mocks/entity';
import { HaComponent } from '../src/discovery/types';

describe('createHandler', () => {
  const cases: Array<[HaComponent, unknown]> = [
    ['cover', CoverHandler],
    ['switch', SwitchHandler],
    ['light', LightHandler],
    ['button', ButtonHandler],
    ['number', NumberHandler],
    ['select', SelectHandler],
    ['binary_sensor', BinarySensorHandler],
  ];

  it.each(cases)('maps %s to the correct handler class', (component, expectedCtor) => {
    const ctx = makeContext();
    const entity = makeEntity(component, 'obj1', {});
    const handler = createHandler(entity, ctx);
    expect(handler).toBeInstanceOf(expectedCtor as any);
  });

  it('maps a sensor with a supported device_class to SensorHandler', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'temp', { device_class: 'temperature' });
    expect(createHandler(entity, ctx)).toBeInstanceOf(SensorHandler);
  });

  it('returns undefined and logs for a sensor with an unsupported device_class', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'voc', { device_class: 'voc' });
    expect(createHandler(entity, ctx)).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalled();
  });

  it('returns undefined and logs for the fan component (not published by smartbed-mqtt)', () => {
    const ctx = makeContext();
    const entity = makeEntity('fan', 'obj1', {});
    expect(createHandler(entity, ctx)).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalled();
  });

  it('returns undefined and logs for a completely unrecognized component', () => {
    const ctx = makeContext();
    const entity = makeEntity('unknown_component' as HaComponent, 'obj1', {});
    expect(createHandler(entity, ctx)).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalled();
  });
});
