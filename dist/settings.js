"use strict";
/**
 * Plugin-wide constants.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PAYLOAD_BYTES = exports.AVAILABILITY_STALE_MS = exports.DISCOVERY_SETTLE_MS = exports.DEFAULT_MQTT_TLS_PORT = exports.DEFAULT_MQTT_PORT = exports.DEFAULT_DISCOVERY_PREFIX = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
/** Must match the "pluginAlias" in config.schema.json and the name registered in index.ts */
exports.PLATFORM_NAME = 'SmartBedMqtt';
/** Must match the "name" field in package.json */
exports.PLUGIN_NAME = 'homebridge-smartbed-mqtt';
/** Default Home Assistant MQTT discovery topic prefix used by smartbed-mqtt. */
exports.DEFAULT_DISCOVERY_PREFIX = 'homeassistant';
/** Default MQTT broker port for mqtt:// */
exports.DEFAULT_MQTT_PORT = 1883;
/** Default MQTT broker port for mqtts:// (TLS) */
exports.DEFAULT_MQTT_TLS_PORT = 8883;
/**
 * How long (ms) we wait after the last discovery/state message for a device before we
 * consider the initial discovery "settled" and publish the accessory. This lets us batch
 * up all the entities smartbed-mqtt announces for a single bed instead of flickering
 * services in and out one at a time.
 */
exports.DISCOVERY_SETTLE_MS = 1500;
/**
 * If a device's availability topic has not reported "online" within this window, we mark
 * every service on the accessory as not responding rather than silently going stale.
 */
exports.AVAILABILITY_STALE_MS = 5 * 60 * 1000;
/** Hard cap on incoming MQTT payload size we will attempt to JSON.parse (bytes). */
exports.MAX_PAYLOAD_BYTES = 256 * 1024;
//# sourceMappingURL=settings.js.map