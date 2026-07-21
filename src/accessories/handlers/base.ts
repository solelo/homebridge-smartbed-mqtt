import type { API, Logger, PlatformAccessory, Service } from 'homebridge';
import { MqttManager } from '../../mqtt/mqttManager';
import { DiscoveredEntity } from '../../discovery/types';
import { parseTemplate, resolveTemplate, TemplateValue } from '../../discovery/templateResolver';

export interface HandlerContext {
  api: API;
  log: Logger;
  mqtt: MqttManager;
  accessory: PlatformAccessory;
}

/**
 * Common behaviour shared by every entity -> HomeKit service adapter:
 *  - attaches/reuses a HAP Service on the accessory
 *  - tracks whether the underlying MQTT entity is currently "available"
 *  - provides a safe helper for resolving a `value_template` against an incoming payload
 *
 * Concrete subclasses implement `setupService()` (build the Service + wire onGet/onSet)
 * and `onTopicMessage()` (react to a subscribed state topic).
 */
export abstract class EntityHandler {
  protected service?: Service;
  protected available = true;
  readonly entity: DiscoveredEntity;
  protected readonly ctx: HandlerContext;

  constructor(entity: DiscoveredEntity, ctx: HandlerContext) {
    this.entity = entity;
    this.ctx = ctx;
  }

  /** Build (or fetch an existing) Service on the accessory and wire characteristics. */
  abstract setupService(): Service | undefined;

  /** Called for every message on a topic this handler cares about. */
  abstract onTopicMessage(topic: string, payload: Buffer): void;

  /** The set of MQTT topics (state/position/brightness/etc.) this handler listens on. */
  abstract get listenTopics(): string[];

  handleAvailability(available: boolean): void {
    this.available = available;
    if (!this.service) {
      return;
    }
    // HAP has no first-class "unavailable" flag for most services; the convention used
    // throughout this plugin is to surface it via StatusFault where the service supports
    // it, which HomeKit clients render as a warning triangle rather than silently
    // showing stale state as if it were current.
    const { Characteristic } = this.ctx.api.hap;
    if (this.service.testCharacteristic(Characteristic.StatusFault)) {
      this.service.updateCharacteristic(
        Characteristic.StatusFault,
        available ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT,
      );
    }
  }

  protected resolveValue(templateStr: string | undefined, payload: Buffer): TemplateValue | undefined {
    const parsed = parseTemplate(templateStr);
    if (!parsed) {
      this.ctx.log.warn(
        `[${this.entity.deviceName}] Unsupported value_template on "${this.entity.objectId}": "${templateStr}". ` +
          'Skipping this update. Please report this bed/entity so support can be added.',
      );
      return undefined;
    }
    return resolveTemplate(parsed, payload.toString('utf8'));
  }

  protected publish(topic: string | undefined, payload: string): void {
    if (!topic) {
      this.ctx.log.warn(
        `[${this.entity.deviceName}] Tried to send a command for "${this.entity.objectId}" but no command topic was published for it.`,
      );
      return;
    }
    this.ctx.mqtt.publish(topic, payload, false);
  }

  /** Human-friendly name for the HAP service (falls back sensibly). */
  protected friendlyName(): string {
    return this.entity.config.name || this.entity.objectId;
  }
}
