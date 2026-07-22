"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartBedMqttPlatform = void 0;
const mqttManager_1 = require("./mqtt/mqttManager");
const discoveryManager_1 = require("./discovery/discoveryManager");
const bedAccessoryManager_1 = require("./accessories/bedAccessoryManager");
const nameOverrides_1 = require("./accessories/nameOverrides");
const substringFilter_1 = require("./discovery/substringFilter");
const settings_1 = require("./settings");
/**
 * Default minutes to wait after startup before pruning cached accessories nothing has
 * re-claimed. BLE-connected beds in particular can take well over a minute to reconnect
 * and get rediscovered after a restart — too short a window here causes a still-valid bed
 * to be permanently unregistered from HomeKit just because it hadn't reconnected yet,
 * requiring smartbed-mqtt itself to restart before it can reappear (toggling the bed
 * elsewhere only sends a state update, not a fresh discovery message, so it won't recover
 * on its own once pruned).
 */
const DEFAULT_ACCESSORY_PRUNE_MINUTES = 5;
class SmartBedMqttPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.cachedAccessories = new Map();
        this.claimedUuids = new Set();
        this.api.on('didFinishLaunching', () => this.start());
        this.api.on('shutdown', () => {
            this.mqttManager?.destroy().catch(() => undefined);
        });
    }
    /** Required by DynamicPlatformPlugin: Homebridge hands us every accessory it had cached. */
    configureAccessory(accessory) {
        this.log.debug(`Restoring cached accessory: ${accessory.displayName}`);
        this.cachedAccessories.set(accessory.UUID, accessory);
    }
    start() {
        if (!this.config.mqttHost) {
            this.log.error('No "mqttHost" configured for the Smart Bed MQTT platform. Add your MQTT broker\'s address in the ' +
                'plugin settings (Homebridge Config UI X) and restart Homebridge.');
            return;
        }
        this.mqttManager = new mqttManager_1.MqttManager({
            host: this.config.mqttHost,
            port: this.config.mqttPort,
            username: this.config.mqttUsername,
            password: this.config.mqttPassword,
            useTls: this.config.mqttUseTls,
            caFile: this.config.mqttCaFile,
            certFile: this.config.mqttCertFile,
            keyFile: this.config.mqttKeyFile,
            allowInsecureTls: this.config.mqttAllowInsecureTls,
        }, this.log);
        const deviceFilter = (0, substringFilter_1.buildSubstringFilter)(this.config.includeDevices, this.config.excludeDevices);
        const entityFilter = (0, substringFilter_1.buildSubstringFilter)(this.config.includeEntities, this.config.excludeEntities);
        this.discoveryManager = new discoveryManager_1.DiscoveryManager(this.mqttManager, this.log, this.config.discoveryPrefix?.trim() || settings_1.DEFAULT_DISCOVERY_PREFIX, deviceFilter, entityFilter);
        new bedAccessoryManager_1.BedAccessoryManager(this.api, this.log, this.mqttManager, this.discoveryManager, this.cachedAccessories, (accessories) => {
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, accessories);
        }, (accessories) => {
            for (const accessory of accessories) {
                this.claimedUuids.delete(accessory.UUID);
                this.cachedAccessories.delete(accessory.UUID);
            }
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, accessories);
        }, (accessory) => {
            this.claimedUuids.add(accessory.UUID);
        }, (0, nameOverrides_1.sanitizeNameOverrides)(this.config.entityNameOverrides), this.buildHiddenSensorClasses());
        // Accessories that came from the Homebridge cache get "claimed" the moment their
        // owning device settles for the first time (see BedAccessoryManager.onDeviceSettled,
        // which re-uses cached accessories rather than creating new ones). Anything still
        // unclaimed after a grace period belongs to a bed that's no longer being published by
        // smartbed-mqtt (renamed, removed, add-on reconfigured) and should be removed.
        const pruneMinutes = this.config.accessoryPruneMinutes ?? DEFAULT_ACCESSORY_PRUNE_MINUTES;
        setTimeout(() => this.pruneStaleAccessories(), pruneMinutes * 60_000);
        this.mqttManager.connect();
        this.discoveryManager.start();
    }
    buildHiddenSensorClasses() {
        const hidden = new Set();
        if (this.config.hideTemperatureSensor) {
            hidden.add('temperature');
        }
        if (this.config.hideHumiditySensor) {
            hidden.add('humidity');
        }
        if (this.config.hideCo2Sensor) {
            hidden.add('carbon_dioxide');
        }
        return hidden;
    }
    pruneStaleAccessories() {
        const stale = [];
        for (const [uuid, accessory] of this.cachedAccessories.entries()) {
            if (!this.claimedUuids.has(uuid)) {
                stale.push(accessory);
            }
        }
        if (stale.length === 0) {
            return;
        }
        for (const accessory of stale) {
            this.log.info(`Removing cached accessory "${accessory.displayName}" — smartbed-mqtt has not re-announced it since Homebridge started.`);
            this.cachedAccessories.delete(accessory.UUID);
        }
        this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, stale);
    }
}
exports.SmartBedMqttPlatform = SmartBedMqttPlatform;
//# sourceMappingURL=platform.js.map