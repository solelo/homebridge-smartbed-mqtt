import type { Service } from 'homebridge';
import { EntityHandler } from './base';

/**
 * Maps an HA `switch` entity (under-bed light toggle, snore-response toggle, safety
 * light, etc.) onto a HomeKit Switch service. Switches are both automation triggers and
 * automation targets in the Home app, so these compose naturally with scenes.
 */
export class SwitchHandler extends EntityHandler {
  private isOn = false;

  get listenTopics(): string[] {
    return this.entity.config.state_topic ? [this.entity.config.state_topic] : [];
  }

  setupService(): Service | undefined {
    const { Service: S, Characteristic } = this.ctx.api.hap;
    const subtype = this.entity.objectId;
    const service =
      this.ctx.accessory.getServiceById(S.Switch, subtype) ?? this.ctx.accessory.addService(S.Switch, this.friendlyName(), subtype);
    service.setCharacteristic(Characteristic.Name, this.friendlyName());

    service
      .getCharacteristic(Characteristic.On)
      .onGet(() => this.isOn)
      .onSet((value) => {
        const payload = value ? this.entity.config.payload_on ?? 'ON' : this.entity.config.payload_off ?? 'OFF';
        this.publish(this.entity.config.command_topic, payload);
        if (this.entity.config.optimistic) {
          this.isOn = Boolean(value);
        }
      });

    this.service = service;
    return service;
  }

  onTopicMessage(topic: string, payload: Buffer): void {
    if (topic !== this.entity.config.state_topic) {
      return;
    }
    const raw = this.resolveValue(this.entity.config.value_template, payload);
    if (raw === undefined || raw === null) {
      return;
    }
    const onPayload = this.entity.config.state_on ?? this.entity.config.payload_on ?? 'ON';
    this.isOn = String(raw) === onPayload || raw === true || raw === 1;
    this.service?.updateCharacteristic(this.ctx.api.hap.Characteristic.On, this.isOn);
  }
}

/**
 * Maps a read-only HA `binary_sensor` (e.g. presence-adjacent diagnostics some bed
 * integrations expose) onto a HomeKit ContactSensor. We deliberately don't try to infer
 * every possible `device_class` -> HomeKit sensor-type mapping; contact sensor is a safe,
 * generic "open/closed"-style boolean that shows up cleanly in the Home app and can drive
 * automations either way.
 */
export class BinarySensorHandler extends EntityHandler {
  private detected = false;

  get listenTopics(): string[] {
    return this.entity.config.state_topic ? [this.entity.config.state_topic] : [];
  }

  setupService(): Service | undefined {
    const { Service: S, Characteristic } = this.ctx.api.hap;
    const subtype = this.entity.objectId;
    const service =
      this.ctx.accessory.getServiceById(S.ContactSensor, subtype) ??
      this.ctx.accessory.addService(S.ContactSensor, this.friendlyName(), subtype);
    service.setCharacteristic(Characteristic.Name, this.friendlyName());
    service
      .getCharacteristic(Characteristic.ContactSensorState)
      .onGet(() =>
        this.detected ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED,
      );
    this.service = service;
    return service;
  }

  onTopicMessage(topic: string, payload: Buffer): void {
    if (topic !== this.entity.config.state_topic) {
      return;
    }
    const raw = this.resolveValue(this.entity.config.value_template, payload);
    if (raw === undefined || raw === null) {
      return;
    }
    const onPayload = this.entity.config.payload_on ?? 'ON';
    this.detected = String(raw) === onPayload || raw === true || raw === 1;
    const { Characteristic } = this.ctx.api.hap;
    this.service?.updateCharacteristic(
      Characteristic.ContactSensorState,
      this.detected ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED,
    );
  }
}
