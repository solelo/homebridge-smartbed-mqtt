import { EventEmitter } from 'events';
import type { Logger } from 'homebridge';
import { MqttManager } from '../mqtt/mqttManager';
import { DiscoveredEntity } from './types';
export interface DeviceEntities {
    deviceKey: string;
    deviceName: string;
    manufacturer?: string;
    model?: string;
    entities: DiscoveredEntity[];
}
/**
 * Subscribes to the Home Assistant MQTT discovery tree (`<prefix>/+/+/config` and
 * `<prefix>/+/+/+/config`) that smartbed-mqtt publishes, and turns the raw discovery
 * messages into `DeviceEntities` groups — one per physical bed — that the accessory layer
 * turns into HomeKit accessories. This is what lets a single plugin support every bed
 * brand the add-on supports: we never hard-code a bed protocol, only the generic HA
 * discovery contract smartbed-mqtt already speaks.
 *
 * Events:
 *  - 'deviceSettled' (device: DeviceEntities)   — fired (debounced) after new/changed entities
 *  - 'deviceRemoved' (deviceKey: string)         — fired once a device has zero entities left
 *  - 'entityRemoved' (deviceKey, configTopic)    — fired when a single entity is retracted
 */
export declare class DiscoveryManager extends EventEmitter {
    private readonly mqtt;
    private readonly log;
    private readonly discoveryPrefix;
    private readonly deviceFilter?;
    /** deviceKey -> (configTopic -> entity) */
    private readonly devices;
    /** configTopic -> deviceKey, so we can find/remove an entity when its config is retracted */
    private readonly entityDeviceIndex;
    private readonly settleTimers;
    private readonly subscribedTopics;
    constructor(mqtt: MqttManager, log: Logger, discoveryPrefix: string, deviceFilter?: ((deviceName: string) => boolean) | undefined);
    start(): void;
    private handleMessage;
    private handleDiscoveryMessage;
    private parseConfigTopic;
    private storeEntity;
    private subscribeEntityTopics;
    private removeEntity;
    private scheduleSettle;
    /** Returns a snapshot of every currently-known device, e.g. for diagnostics/logging. */
    listDevices(): DeviceEntities[];
}
