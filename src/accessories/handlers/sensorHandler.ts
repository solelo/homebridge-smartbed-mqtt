import type { Service } from 'homebridge';
import { EntityHandler } from './base';

/**
 * Maps an HA `sensor` entity onto the closest native HomeKit sensor service, based on
 * `device_class`. HomeKit only has a handful of first-class sensor types, so device
 * classes without one (e.g. "voc") are reported as unsupported by `SensorHandler.supports`
 * rather than silently dropped or force-fit into the wrong service.
 */
const SUPPORTED_DEVICE_CLASSES = new Set(['temperature', 'humidity', 'carbon_dioxide']);

export function sensorIsSupported(deviceClass: string | undefined): boolean {
  return Boolean(deviceClass && SUPPORTED_DEVICE_CLASSES.has(deviceClass));
}

export class SensorHandler extends EntityHandler {
  private value = 0;

  get listenTopics(): string[] {
    return this.entity.config.state_topic ? [this.entity.config.state_topic] : [];
  }

  setupService(): Service | undefined {
    const { Service: S, Characteristic } = this.ctx.api.hap;
    const subtype = this.entity.objectId;
    const deviceClass = this.entity.config.device_class;

    let service: Service | undefined;
    switch (deviceClass) {
      case 'temperature':
        service =
          this.ctx.accessory.getServiceById(S.TemperatureSensor, subtype) ??
          this.ctx.accessory.addService(S.TemperatureSensor, this.friendlyName(), subtype);
        service.getCharacteristic(Characteristic.CurrentTemperature).onGet(() => this.value);
        break;
      case 'humidity':
        service =
          this.ctx.accessory.getServiceById(S.HumiditySensor, subtype) ??
          this.ctx.accessory.addService(S.HumiditySensor, this.friendlyName(), subtype);
        service.getCharacteristic(Characteristic.CurrentRelativeHumidity).onGet(() => this.value);
        break;
      case 'carbon_dioxide':
        service =
          this.ctx.accessory.getServiceById(S.CarbonDioxideSensor, subtype) ??
          this.ctx.accessory.addService(S.CarbonDioxideSensor, this.friendlyName(), subtype);
        service.getCharacteristic(Characteristic.CarbonDioxideLevel).onGet(() => this.value);
        service.getCharacteristic(Characteristic.CarbonDioxideDetected).onGet(() => (this.value > 1000 ? 1 : 0));
        break;
      default:
        this.ctx.log.warn(
          `[${this.entity.deviceName}] Sensor "${this.entity.objectId}" has device_class "${deviceClass}", which has no ` +
            'native HomeKit equivalent, so it will not be exposed.',
        );
        return undefined;
    }

    service.setCharacteristic(Characteristic.Name, this.friendlyName());
    this.service = service;
    return service;
  }

  onTopicMessage(topic: string, payload: Buffer): void {
    if (topic !== this.entity.config.state_topic) {
      return;
    }
    const raw = this.resolveValue(this.entity.config.value_template, payload);
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return;
    }
    this.value = num;

    const { Characteristic } = this.ctx.api.hap;
    switch (this.entity.config.device_class) {
      case 'temperature':
        this.service?.updateCharacteristic(Characteristic.CurrentTemperature, num);
        break;
      case 'humidity':
        this.service?.updateCharacteristic(Characteristic.CurrentRelativeHumidity, num);
        break;
      case 'carbon_dioxide':
        this.service?.updateCharacteristic(Characteristic.CarbonDioxideLevel, num);
        this.service?.updateCharacteristic(Characteristic.CarbonDioxideDetected, num > 1000 ? 1 : 0);
        break;
      default:
        break;
    }
  }
}
