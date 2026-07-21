import { EventEmitter } from 'events';
import type { Logger } from 'homebridge';
import { MqttManager } from '../mqtt/mqttManager';
import { DiscoveredEntity, HaComponent, HaDiscoveryConfig, deviceKeyFromIdentifiers, isKnownComponent } from './types';
import { DISCOVERY_SETTLE_MS } from '../settings';

/** Config fields that name a topic we should subscribe to (device -> us). */
const LISTEN_TOPIC_KEYS: (keyof HaDiscoveryConfig)[] = [
  'state_topic',
  'availability_topic',
  'position_topic',
  'brightness_state_topic',
  'tilt_status_topic',
  'percentage_state_topic',
];

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
export class DiscoveryManager extends EventEmitter {
  /** deviceKey -> (configTopic -> entity) */
  private readonly devices = new Map<string, Map<string, DiscoveredEntity>>();
  /** configTopic -> deviceKey, so we can find/remove an entity when its config is retracted */
  private readonly entityDeviceIndex = new Map<string, string>();
  private readonly settleTimers = new Map<string, NodeJS.Timeout>();
  private readonly subscribedTopics = new Set<string>();

  constructor(
    private readonly mqtt: MqttManager,
    private readonly log: Logger,
    private readonly discoveryPrefix: string,
    private readonly deviceFilter?: (deviceName: string) => boolean,
  ) {
    super();
  }

  start(): void {
    const noNode = `${this.discoveryPrefix}/+/+/config`;
    const withNode = `${this.discoveryPrefix}/+/+/+/config`;
    this.mqtt.subscribe(noNode);
    this.mqtt.subscribe(withNode);
    this.mqtt.onMessage((topic, payload) => this.handleMessage(topic, payload));
    this.log.info(`Listening for smartbed-mqtt discovery messages under "${this.discoveryPrefix}/..."`);
  }

  private handleMessage(topic: string, payload: Buffer): void {
    if (topic.endsWith('/config') && topic.startsWith(`${this.discoveryPrefix}/`)) {
      this.handleDiscoveryMessage(topic, payload);
    }
    // Non-config messages (state/availability/etc.) are consumed directly by the
    // accessory handlers, which subscribe to `mqtt.onMessage` themselves.
  }

  private handleDiscoveryMessage(topic: string, payload: Buffer): void {
    const parsedTopic = this.parseConfigTopic(topic);
    if (!parsedTopic) {
      return;
    }
    const { component, objectId, nodeId } = parsedTopic;

    // An empty/retained-empty payload is HA's convention for "this entity no longer exists".
    if (payload.length === 0) {
      this.removeEntity(topic);
      return;
    }

    let config: HaDiscoveryConfig;
    try {
      config = JSON.parse(payload.toString('utf8'));
    } catch {
      this.log.warn(`Ignoring malformed (non-JSON) discovery payload on "${topic}".`);
      return;
    }

    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      this.log.warn(`Ignoring discovery payload on "${topic}": expected a JSON object.`);
      return;
    }

    const deviceKey = deviceKeyFromIdentifiers(config.device?.identifiers) ?? `${nodeId ?? objectId}`;
    const deviceName = config.device?.name ?? nodeId ?? objectId;

    if (this.deviceFilter && !this.deviceFilter(deviceName)) {
      this.log.debug(`Skipping entity for "${deviceName}" (excluded by device filter).`);
      return;
    }

    const entity: DiscoveredEntity = {
      configTopic: topic,
      component,
      objectId,
      nodeId,
      config,
      deviceKey,
      deviceName,
      manufacturer: config.device?.manufacturer,
      model: config.device?.model,
      lastSeen: Date.now(),
    };

    this.storeEntity(entity);
    this.subscribeEntityTopics(entity);
    this.scheduleSettle(deviceKey);
  }

  private parseConfigTopic(
    topic: string,
  ): { component: HaComponent; objectId: string; nodeId?: string } | undefined {
    const parts = topic.split('/');
    // <prefix>/<component>/<object_id>/config  (4 parts)
    // <prefix>/<component>/<node_id>/<object_id>/config (5 parts)
    if (parts.length === 4 && parts[3] === 'config') {
      const [, component, objectId] = parts;
      if (!isKnownComponent(component)) {
        return undefined;
      }
      return { component, objectId };
    }
    if (parts.length === 5 && parts[4] === 'config') {
      const [, component, nodeId, objectId] = parts;
      if (!isKnownComponent(component)) {
        return undefined;
      }
      return { component, objectId, nodeId };
    }
    return undefined;
  }

  private storeEntity(entity: DiscoveredEntity): void {
    let deviceMap = this.devices.get(entity.deviceKey);
    if (!deviceMap) {
      deviceMap = new Map();
      this.devices.set(entity.deviceKey, deviceMap);
    }
    deviceMap.set(entity.configTopic, entity);
    this.entityDeviceIndex.set(entity.configTopic, entity.deviceKey);
  }

  private subscribeEntityTopics(entity: DiscoveredEntity): void {
    for (const key of LISTEN_TOPIC_KEYS) {
      const value = entity.config[key];
      if (typeof value === 'string' && value.length > 0 && !this.subscribedTopics.has(value)) {
        this.subscribedTopics.add(value);
        this.mqtt.subscribe(value);
      }
    }
  }

  private removeEntity(configTopic: string): void {
    const deviceKey = this.entityDeviceIndex.get(configTopic);
    if (!deviceKey) {
      return;
    }
    this.entityDeviceIndex.delete(configTopic);
    const deviceMap = this.devices.get(deviceKey);
    if (!deviceMap) {
      return;
    }
    deviceMap.delete(configTopic);
    this.emit('entityRemoved', deviceKey, configTopic);

    if (deviceMap.size === 0) {
      this.devices.delete(deviceKey);
      this.emit('deviceRemoved', deviceKey);
    } else {
      this.scheduleSettle(deviceKey);
    }
  }

  private scheduleSettle(deviceKey: string): void {
    const existing = this.settleTimers.get(deviceKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.settleTimers.delete(deviceKey);
      const deviceMap = this.devices.get(deviceKey);
      if (!deviceMap || deviceMap.size === 0) {
        return;
      }
      const entities = Array.from(deviceMap.values());
      const first = entities[0];
      const device: DeviceEntities = {
        deviceKey,
        deviceName: first.deviceName,
        manufacturer: first.manufacturer,
        model: first.model,
        entities,
      };
      this.emit('deviceSettled', device);
    }, DISCOVERY_SETTLE_MS);
    this.settleTimers.set(deviceKey, timer);
  }

  /** Returns a snapshot of every currently-known device, e.g. for diagnostics/logging. */
  listDevices(): DeviceEntities[] {
    return Array.from(this.devices.entries()).map(([deviceKey, entityMap]) => {
      const entities = Array.from(entityMap.values());
      const first = entities[0];
      return {
        deviceKey,
        deviceName: first?.deviceName ?? deviceKey,
        manufacturer: first?.manufacturer,
        model: first?.model,
        entities,
      };
    });
  }
}
