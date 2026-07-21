import { SensorHandler, sensorIsSupported } from '../../src/accessories/handlers/sensorHandler';
import { makeContext } from '../mocks/context';
import { makeEntity } from '../mocks/entity';
import { Characteristic, asFake } from '../mocks/hap';

describe('sensorIsSupported', () => {
  it('supports only temperature, humidity, and carbon_dioxide', () => {
    expect(sensorIsSupported('temperature')).toBe(true);
    expect(sensorIsSupported('humidity')).toBe(true);
    expect(sensorIsSupported('carbon_dioxide')).toBe(true);
    expect(sensorIsSupported('voc')).toBe(false);
    expect(sensorIsSupported(undefined)).toBe(false);
  });
});

describe('SensorHandler', () => {
  it('maps a temperature sensor to CurrentTemperature', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'temp', { state_topic: 'bed1/temp/state', device_class: 'temperature' });
    const handler = new SensorHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/temp/state', Buffer.from('21.5'));
    expect(service.getCharacteristic(Characteristic.CurrentTemperature).value).toBe(21.5);
  });

  it('maps a humidity sensor to CurrentRelativeHumidity', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'hum', { state_topic: 'bed1/hum/state', device_class: 'humidity' });
    const handler = new SensorHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/hum/state', Buffer.from('55'));
    expect(service.getCharacteristic(Characteristic.CurrentRelativeHumidity).value).toBe(55);
  });

  it('maps carbon_dioxide to both level and a normal/abnormal detected flag at the 1000ppm threshold', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'co2', { state_topic: 'bed1/co2/state', device_class: 'carbon_dioxide' });
    const handler = new SensorHandler(entity, ctx);
    const service = asFake(handler.setupService());

    handler.onTopicMessage('bed1/co2/state', Buffer.from('800'));
    expect(service.getCharacteristic(Characteristic.CarbonDioxideLevel).value).toBe(800);
    expect(service.getCharacteristic(Characteristic.CarbonDioxideDetected).value).toBe(
      Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL,
    );

    handler.onTopicMessage('bed1/co2/state', Buffer.from('1200'));
    expect(service.getCharacteristic(Characteristic.CarbonDioxideDetected).value).toBe(
      Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL,
    );
  });

  it('returns undefined (does not create a service) for an unsupported device_class', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'voc', { state_topic: 'bed1/voc/state', device_class: 'volatile_organic_compounds' });
    const handler = new SensorHandler(entity, ctx);
    expect(handler.setupService()).toBeUndefined();
    expect(ctx.log.warn).toHaveBeenCalled();
  });

  it('ignores a non-numeric reading', () => {
    const ctx = makeContext();
    const entity = makeEntity('sensor', 'temp', { state_topic: 'bed1/temp/state', device_class: 'temperature' });
    const handler = new SensorHandler(entity, ctx);
    const service = asFake(handler.setupService());
    handler.onTopicMessage('bed1/temp/state', Buffer.from('not-a-number'));
    expect(service.getCharacteristic(Characteristic.CurrentTemperature).value).toBeUndefined();
  });
});
