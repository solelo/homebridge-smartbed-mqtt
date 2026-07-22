import type { API, Logger, PlatformAccessory, Service } from 'homebridge';
import { MqttManager } from '../../mqtt/mqttManager';
import { DiscoveredEntity } from '../../discovery/types';
import { TemplateValue } from '../../discovery/templateResolver';
import { NameOverrideRule } from '../nameOverrides';
export interface HandlerContext {
    api: API;
    log: Logger;
    mqtt: MqttManager;
    accessory: PlatformAccessory;
    nameOverrides?: NameOverrideRule[];
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
export declare abstract class EntityHandler {
    protected service?: Service;
    protected available: boolean;
    readonly entity: DiscoveredEntity;
    protected readonly ctx: HandlerContext;
    constructor(entity: DiscoveredEntity, ctx: HandlerContext);
    /** Build (or fetch an existing) Service on the accessory and wire characteristics. */
    abstract setupService(): Service | undefined;
    /** Called for every message on a topic this handler cares about. */
    abstract onTopicMessage(topic: string, payload: Buffer): void;
    /** The set of MQTT topics (state/position/brightness/etc.) this handler listens on. */
    abstract get listenTopics(): string[];
    handleAvailability(available: boolean): void;
    protected resolveValue(templateStr: string | undefined, payload: Buffer): TemplateValue | undefined;
    protected publish(topic: string | undefined, payload: string): void;
    /** Human-friendly name for the HAP service (falls back sensibly). */
    protected friendlyName(): string;
}
