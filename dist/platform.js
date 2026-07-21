"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartBedMqttPlatform = void 0;
const mqttManager_1 = require("./mqtt/mqttManager");
const discoveryManager_1 = require("./discovery/discoveryManager");
const bedAccessoryManager_1 = require("./accessories/bedAccessoryManager");
const settings_1 = require("./settings");
/** How long we wait after startup before pruning cached accessories nothing re-claimed. */
const STALE_ACCESSORY_PRUNE_MS = 45_000;
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
        const deviceFilter = this.buildDeviceFilter();
        this.discoveryManager = new discoveryManager_1.DiscoveryManager(this.mqttManager, this.log, this.config.discoveryPrefix?.trim() || settings_1.DEFAULT_DISCOVERY_PREFIX, deviceFilter);
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
        });
        // Accessories that came from the Homebridge cache get "claimed" the moment their
        // owning device settles for the first time (see BedAccessoryManager.onDeviceSettled,
        // which re-uses cached accessories rather than creating new ones). Anything still
        // unclaimed after a grace period belongs to a bed that's no longer being published by
        // smartbed-mqtt (renamed, removed, add-on reconfigured) and should be removed.
        setTimeout(() => this.pruneStaleAccessories(), STALE_ACCESSORY_PRUNE_MS);
        this.mqttManager.connect();
        this.discoveryManager.start();
    }
    buildDeviceFilter() {
        const include = this.config.includeDevices?.map((s) => s.toLowerCase().trim()).filter(Boolean);
        const exclude = this.config.excludeDevices?.map((s) => s.toLowerCase().trim()).filter(Boolean);
        if ((!include || include.length === 0) && (!exclude || exclude.length === 0)) {
            return undefined;
        }
        return (deviceName) => {
            const name = deviceName.toLowerCase();
            if (include && include.length > 0 && !include.some((s) => name.includes(s))) {
                return false;
            }
            if (exclude && exclude.some((s) => name.includes(s))) {
                return false;
            }
            return true;
        };
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