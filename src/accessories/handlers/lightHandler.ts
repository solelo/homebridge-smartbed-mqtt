import type { Service } from 'homebridge';
import { EntityHandler, HandlerContext } from './base';
import { DiscoveredEntity } from '../../discovery/types';

/** Maps an HA `light` entity (under-bed lighting) onto a HomeKit Lightbulb service. */
export class LightHandler extends EntityHandler {
  private isOn = false;
  private brightnessPct = 100;
  private readonly scale: number;

  constructor(entity: DiscoveredEntity, ctx: HandlerContext) {
    super(entity, ctx);
    this.scale = this.entity.config.brightness_scale ?? 255;
  }

  get listenTopics(): string[] {
    const topics: string[] = [];
    if (this.entity.config.state_topic) {
      topics.push(this.entity.config.state_topic);
    }
    if (this.entity.config.brightness_state_topic) {
      topics.push(this.entity.config.brightness_state_topic);
    }
    return topics;
  }

  get supportsBrightness(): boolean {
    return Boolean(this.entity.config.brightness_command_topic);
  }

  setupService(): Service | undefined {
    const { Service: S, Characteristic } = this.ctx.api.hap;
    const subtype = this.entity.objectId;
    const service =
      this.ctx.accessory.getServiceById(S.Lightbulb, subtype) ?? this.ctx.accessory.addService(S.Lightbulb, this.friendlyName(), subtype);
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

    if (this.supportsBrightness) {
      service
        .getCharacteristic(Characteristic.Brightness)
        .onGet(() => this.brightnessPct)
        .onSet((value) => {
          const pct = Number(value);
          const deviceValue = Math.round((pct / 100) * this.scale);
          this.publish(this.entity.config.brightness_command_topic, String(deviceValue));
        });
    }

    this.service = service;
    return service;
  }

  onTopicMessage(topic: string, payload: Buffer): void {
    const { Characteristic } = this.ctx.api.hap;

    if (topic === this.entity.config.state_topic) {
      const raw = this.resolveValue(this.entity.config.value_template, payload);
      if (raw !== undefined && raw !== null) {
        const onPayload = this.entity.config.state_on ?? this.entity.config.payload_on ?? 'ON';
        this.isOn = String(raw) === onPayload || raw === true || raw === 1;
        this.service?.updateCharacteristic(Characteristic.On, this.isOn);
      }
    }

    if (topic === this.entity.config.brightness_state_topic) {
      const raw = this.resolveValue(this.entity.config.brightness_value_template, payload);
      const deviceValue = Number(raw);
      if (Number.isFinite(deviceValue)) {
        this.brightnessPct = Math.round((deviceValue / this.scale) * 100);
        this.service?.updateCharacteristic(Characteristic.Brightness, this.brightnessPct);
      }
    }
  }
}
