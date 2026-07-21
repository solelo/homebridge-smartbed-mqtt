/**
 * Plugin-wide constants.
 */

/** Must match the "pluginAlias" in config.schema.json and the name registered in index.ts */
export const PLATFORM_NAME = 'SmartBedMqtt';

/** Must match the "name" field in package.json */
export const PLUGIN_NAME = 'homebridge-smartbed-mqtt';

/** Default Home Assistant MQTT discovery topic prefix used by smartbed-mqtt. */
export const DEFAULT_DISCOVERY_PREFIX = 'homeassistant';

/** Default MQTT broker port for mqtt:// */
export const DEFAULT_MQTT_PORT = 1883;

/** Default MQTT broker port for mqtts:// (TLS) */
export const DEFAULT_MQTT_TLS_PORT = 8883;

/**
 * How long (ms) we wait after the last discovery/state message for a device before we
 * consider the initial discovery "settled" and publish the accessory. This lets us batch
 * up all the entities smartbed-mqtt announces for a single bed instead of flickering
 * services in and out one at a time.
 */
export const DISCOVERY_SETTLE_MS = 1500;

/**
 * If a device's availability topic has not reported "online" within this window, we mark
 * every service on the accessory as not responding rather than silently going stale.
 */
export const AVAILABILITY_STALE_MS = 5 * 60 * 1000;

/** Hard cap on incoming MQTT payload size we will attempt to JSON.parse (bytes). */
export const MAX_PAYLOAD_BYTES = 256 * 1024;
