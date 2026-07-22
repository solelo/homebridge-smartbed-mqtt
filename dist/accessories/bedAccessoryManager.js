"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedAccessoryManager = void 0;
const handlerFactory_1 = require("./handlerFactory");
const settings_1 = require("../settings");
/**
 * Owns the mapping between smartbed-mqtt "devices" (one per physical/virtual bed) and
 * Homebridge PlatformAccessories: creating them, attaching/removing HAP services as
 * entities come and go, and fanning out incoming MQTT messages to the right handler(s).
 */
class BedAccessoryManager {
    constructor(api, log, mqtt, discovery, cachedAccessories, registerAccessories, unregisterAccessories, claimAccessory, nameOverrides = []) {
        this.api = api;
        this.log = log;
        this.mqtt = mqtt;
        this.discovery = discovery;
        this.cachedAccessories = cachedAccessories;
        this.registerAccessories = registerAccessories;
        this.unregisterAccessories = unregisterAccessories;
        this.claimAccessory = claimAccessory;
        this.nameOverrides = nameOverrides;
        this.devices = new Map();
        /** topic -> handlers listening on it, across every device (state/position/etc.) */
        this.stateTopicIndex = new Map();
        /** topic -> entities whose availability is reported on it */
        this.availabilityTopicIndex = new Map();
        this.lastSeenOnline = new Map(); // availability_topic -> ms
        this.mqtt.onMessage((topic, payload) => this.routeMessage(topic, payload));
        this.discovery.on('deviceSettled', (device) => this.onDeviceSettled(device));
        this.discovery.on('deviceRemoved', (deviceKey) => this.onDeviceRemoved(deviceKey));
        this.discovery.on('entityRemoved', (deviceKey, configTopic) => this.onEntityRemoved(deviceKey, configTopic));
        setInterval(() => this.checkStaleAvailability(), 60_000).unref();
    }
    uuidFor(deviceKey) {
        return this.api.hap.uuid.generate(`smartbed-mqtt:${deviceKey}`);
    }
    onDeviceSettled(device) {
        const uuid = this.uuidFor(device.deviceKey);
        let state = this.devices.get(device.deviceKey);
        if (!state) {
            const existingCached = this.cachedAccessories.get(uuid);
            const accessory = existingCached ?? new this.api.platformAccessory(device.deviceName, uuid);
            accessory.context.deviceKey = device.deviceKey;
            state = { accessory, handlers: new Map() };
            this.devices.set(device.deviceKey, state);
            if (!existingCached) {
                this.log.info(`Discovered new bed "${device.deviceName}" — adding to HomeKit.`);
                this.registerAccessories([accessory]);
            }
            else {
                this.log.info(`Reattached bed "${device.deviceName}" from cache.`);
            }
            // A cached accessory that gets reattached here (rather than freshly registered)
            // still needs to be marked "claimed" — otherwise the platform's stale-accessory
            // pruning (which only ever sees registerAccessories calls for *new* accessories)
            // would remove every previously-known bed ~45s after each Homebridge restart.
            this.claimAccessory(accessory);
        }
        this.setAccessoryInformation(state.accessory, device);
        const seenConfigTopics = new Set();
        for (const entity of device.entities) {
            seenConfigTopics.add(entity.configTopic);
            this.attachEntity(state, entity);
        }
        // Anything previously attached but no longer present in this settle batch (e.g. the
        // add-on restarted with a different feature set) should be cleaned up too.
        for (const configTopic of Array.from(state.handlers.keys())) {
            if (!seenConfigTopics.has(configTopic)) {
                this.detachEntity(state, configTopic);
            }
        }
        state.accessory.context.deviceName = device.deviceName;
    }
    attachEntity(state, entity) {
        const existing = state.handlers.get(entity.configTopic);
        if (existing) {
            // Entity config hasn't structurally changed from our perspective (topics/component
            // are immutable once discovered); nothing further to do.
            return;
        }
        const ctx = {
            api: this.api,
            log: this.log,
            mqtt: this.mqtt,
            accessory: state.accessory,
            nameOverrides: this.nameOverrides,
        };
        const handler = (0, handlerFactory_1.createHandler)(entity, ctx);
        if (!handler) {
            return;
        }
        const service = handler.setupService();
        if (!service) {
            return;
        }
        state.handlers.set(entity.configTopic, handler);
        for (const topic of handler.listenTopics) {
            this.indexTopic(this.stateTopicIndex, topic, handler);
        }
        if (entity.config.availability_topic) {
            const list = this.availabilityTopicIndex.get(entity.config.availability_topic) ?? [];
            list.push(entity);
            this.availabilityTopicIndex.set(entity.config.availability_topic, list);
        }
    }
    detachEntity(state, configTopic) {
        const handler = state.handlers.get(configTopic);
        if (!handler) {
            return;
        }
        state.handlers.delete(configTopic);
        for (const topic of handler.listenTopics) {
            const list = this.stateTopicIndex.get(topic);
            if (list) {
                this.stateTopicIndex.set(topic, list.filter((h) => h !== handler));
            }
        }
        const maybeDestroy = handler;
        maybeDestroy.destroy?.();
        // Remove every HAP service this handler owns. Handlers key their service subtype(s)
        // on the entity's objectId (SelectHandler adds a ":<option>" suffix for its per-option
        // switches) — NOT on the MQTT config topic — so we must match on that, not configTopic.
        const objectId = handler.entity.objectId;
        for (const service of state.accessory.services) {
            if (service.subtype && (service.subtype === objectId || service.subtype.startsWith(`${objectId}:`))) {
                state.accessory.removeService(service);
            }
        }
        const availabilityTopic = handler.entity.config.availability_topic;
        if (availabilityTopic) {
            const list = this.availabilityTopicIndex.get(availabilityTopic);
            if (list) {
                const filtered = list.filter((e) => e.configTopic !== configTopic);
                if (filtered.length > 0) {
                    this.availabilityTopicIndex.set(availabilityTopic, filtered);
                }
                else {
                    this.availabilityTopicIndex.delete(availabilityTopic);
                    this.lastSeenOnline.delete(availabilityTopic);
                }
            }
        }
    }
    onEntityRemoved(deviceKey, configTopic) {
        const state = this.devices.get(deviceKey);
        if (!state) {
            return;
        }
        this.log.info(`Entity "${configTopic}" was retracted by smartbed-mqtt; removing its HomeKit service.`);
        this.detachEntity(state, configTopic);
    }
    onDeviceRemoved(deviceKey) {
        const state = this.devices.get(deviceKey);
        if (!state) {
            return;
        }
        this.log.info(`Bed "${state.accessory.displayName}" was fully retracted by smartbed-mqtt; removing from HomeKit.`);
        for (const configTopic of Array.from(state.handlers.keys())) {
            this.detachEntity(state, configTopic);
        }
        this.unregisterAccessories([state.accessory]);
        this.devices.delete(deviceKey);
    }
    setAccessoryInformation(accessory, device) {
        const { Service, Characteristic } = this.api.hap;
        const info = accessory.getService(Service.AccessoryInformation) ?? accessory.addService(Service.AccessoryInformation);
        info
            .setCharacteristic(Characteristic.Name, device.deviceName)
            .setCharacteristic(Characteristic.Manufacturer, device.manufacturer ?? 'smartbed-mqtt')
            .setCharacteristic(Characteristic.Model, device.model ?? 'Smart Bed')
            .setCharacteristic(Characteristic.SerialNumber, device.deviceKey);
    }
    indexTopic(index, topic, handler) {
        const list = index.get(topic) ?? [];
        if (!list.includes(handler)) {
            list.push(handler);
        }
        index.set(topic, list);
    }
    routeMessage(topic, payload) {
        const stateHandlers = this.stateTopicIndex.get(topic);
        if (stateHandlers) {
            for (const handler of stateHandlers) {
                handler.onTopicMessage(topic, payload);
            }
        }
        const availabilityEntities = this.availabilityTopicIndex.get(topic);
        if (availabilityEntities) {
            this.lastSeenOnline.set(topic, Date.now());
            const raw = payload.toString('utf8').trim();
            for (const entity of availabilityEntities) {
                const availablePayload = entity.config.payload_available ?? 'online';
                const unavailablePayload = entity.config.payload_not_available ?? 'offline';
                let available;
                if (raw === availablePayload) {
                    available = true;
                }
                else if (raw === unavailablePayload) {
                    available = false;
                }
                if (available === undefined) {
                    continue;
                }
                const state = this.devices.get(entity.deviceKey);
                const handler = state?.handlers.get(entity.configTopic);
                handler?.handleAvailability(available);
            }
        }
    }
    checkStaleAvailability() {
        const now = Date.now();
        for (const [topic, lastSeen] of this.lastSeenOnline.entries()) {
            if (now - lastSeen < settings_1.AVAILABILITY_STALE_MS) {
                continue;
            }
            const entities = this.availabilityTopicIndex.get(topic) ?? [];
            for (const entity of entities) {
                const state = this.devices.get(entity.deviceKey);
                const handler = state?.handlers.get(entity.configTopic);
                handler?.handleAvailability(false);
            }
        }
    }
}
exports.BedAccessoryManager = BedAccessoryManager;
//# sourceMappingURL=bedAccessoryManager.js.map