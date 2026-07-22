"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryManager = void 0;
const events_1 = require("events");
const types_1 = require("./types");
const settings_1 = require("../settings");
/** Config fields that name a topic we should subscribe to (device -> us). */
const LISTEN_TOPIC_KEYS = [
    'state_topic',
    'availability_topic',
    'position_topic',
    'brightness_state_topic',
    'tilt_status_topic',
    'percentage_state_topic',
];
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
class DiscoveryManager extends events_1.EventEmitter {
    constructor(mqtt, log, discoveryPrefix, deviceFilter, entityFilter) {
        super();
        this.mqtt = mqtt;
        this.log = log;
        this.discoveryPrefix = discoveryPrefix;
        this.deviceFilter = deviceFilter;
        this.entityFilter = entityFilter;
        /** deviceKey -> (configTopic -> entity) */
        this.devices = new Map();
        /** configTopic -> deviceKey, so we can find/remove an entity when its config is retracted */
        this.entityDeviceIndex = new Map();
        this.settleTimers = new Map();
        this.subscribedTopics = new Set();
    }
    start() {
        const noNode = `${this.discoveryPrefix}/+/+/config`;
        const withNode = `${this.discoveryPrefix}/+/+/+/config`;
        this.mqtt.subscribe(noNode);
        this.mqtt.subscribe(withNode);
        this.mqtt.onMessage((topic, payload) => this.handleMessage(topic, payload));
        this.log.info(`Listening for smartbed-mqtt discovery messages under "${this.discoveryPrefix}/..."`);
    }
    handleMessage(topic, payload) {
        if (topic.endsWith('/config') && topic.startsWith(`${this.discoveryPrefix}/`)) {
            this.handleDiscoveryMessage(topic, payload);
        }
        // Non-config messages (state/availability/etc.) are consumed directly by the
        // accessory handlers, which subscribe to `mqtt.onMessage` themselves.
    }
    handleDiscoveryMessage(topic, payload) {
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
        let config;
        try {
            config = JSON.parse(payload.toString('utf8'));
        }
        catch {
            this.log.warn(`Ignoring malformed (non-JSON) discovery payload on "${topic}".`);
            return;
        }
        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
            this.log.warn(`Ignoring discovery payload on "${topic}": expected a JSON object.`);
            return;
        }
        const deviceKey = (0, types_1.deviceKeyFromIdentifiers)(config.device?.identifiers) ?? `${nodeId ?? objectId}`;
        const deviceName = config.device?.name ?? nodeId ?? objectId;
        if (this.deviceFilter && !this.deviceFilter(deviceName)) {
            this.log.debug(`Skipping entity for "${deviceName}" (excluded by device filter).`);
            return;
        }
        const entityName = config.name || objectId;
        if (this.entityFilter && !this.entityFilter(entityName)) {
            this.log.debug(`Skipping entity "${entityName}" for "${deviceName}" (excluded by entity filter).`);
            return;
        }
        const entity = {
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
    parseConfigTopic(topic) {
        const parts = topic.split('/');
        // <prefix>/<component>/<object_id>/config  (4 parts)
        // <prefix>/<component>/<node_id>/<object_id>/config (5 parts)
        if (parts.length === 4 && parts[3] === 'config') {
            const [, component, objectId] = parts;
            if (!(0, types_1.isKnownComponent)(component)) {
                return undefined;
            }
            return { component, objectId };
        }
        if (parts.length === 5 && parts[4] === 'config') {
            const [, component, nodeId, objectId] = parts;
            if (!(0, types_1.isKnownComponent)(component)) {
                return undefined;
            }
            return { component, objectId, nodeId };
        }
        return undefined;
    }
    storeEntity(entity) {
        let deviceMap = this.devices.get(entity.deviceKey);
        if (!deviceMap) {
            deviceMap = new Map();
            this.devices.set(entity.deviceKey, deviceMap);
        }
        deviceMap.set(entity.configTopic, entity);
        this.entityDeviceIndex.set(entity.configTopic, entity.deviceKey);
    }
    subscribeEntityTopics(entity) {
        for (const key of LISTEN_TOPIC_KEYS) {
            const value = entity.config[key];
            if (typeof value === 'string' && value.length > 0 && !this.subscribedTopics.has(value)) {
                this.subscribedTopics.add(value);
                this.mqtt.subscribe(value);
            }
        }
    }
    removeEntity(configTopic) {
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
        }
        else {
            this.scheduleSettle(deviceKey);
        }
    }
    scheduleSettle(deviceKey) {
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
            const device = {
                deviceKey,
                deviceName: first.deviceName,
                manufacturer: first.manufacturer,
                model: first.model,
                entities,
            };
            this.emit('deviceSettled', device);
        }, settings_1.DISCOVERY_SETTLE_MS);
        this.settleTimers.set(deviceKey, timer);
    }
    /** Returns a snapshot of every currently-known device, e.g. for diagnostics/logging. */
    listDevices() {
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
exports.DiscoveryManager = DiscoveryManager;
//# sourceMappingURL=discoveryManager.js.map