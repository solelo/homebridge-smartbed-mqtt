"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttManager = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const fs_1 = require("fs");
const settings_1 = require("../settings");
/**
 * Thin, defensive wrapper around the `mqtt` client: centralizes connection options
 * (including TLS/auth), enforces a payload size ceiling before handing bytes to
 * subscribers, and exposes a single place to reason about reconnect/error handling so a
 * flaky broker or Wi-Fi drop can never crash the Homebridge process.
 */
class MqttManager {
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.handlers = [];
        this.connected = false;
        /** Every topic we've ever been asked to subscribe to, so we can restore them after a reconnect. */
        this.subscribedTopics = new Set();
    }
    onMessage(handler) {
        this.handlers.push(handler);
    }
    isConnected() {
        return this.connected;
    }
    connect() {
        const protocol = this.config.useTls ? 'mqtts' : 'mqtt';
        const port = this.config.port ?? (this.config.useTls ? settings_1.DEFAULT_MQTT_TLS_PORT : settings_1.DEFAULT_MQTT_PORT);
        const options = {
            host: this.config.host,
            port,
            protocol,
            username: this.config.username || undefined,
            password: this.config.password || undefined,
            clientId: this.config.clientId ?? `homebridge-smartbed-mqtt_${Math.random().toString(16).slice(2, 10)}`,
            reconnectPeriod: 5000,
            connectTimeout: 15000,
            clean: true,
            rejectUnauthorized: !this.config.allowInsecureTls,
        };
        if (this.config.useTls) {
            try {
                if (this.config.caFile) {
                    options.ca = (0, fs_1.readFileSync)(this.config.caFile);
                }
                if (this.config.certFile) {
                    options.cert = (0, fs_1.readFileSync)(this.config.certFile);
                }
                if (this.config.keyFile) {
                    options.key = (0, fs_1.readFileSync)(this.config.keyFile);
                }
            }
            catch (err) {
                this.log.error(`Failed to read TLS certificate file(s) for MQTT connection: ${err.message}. ` +
                    'Check the caFile/certFile/keyFile paths in your config.');
            }
            if (this.config.allowInsecureTls) {
                this.log.warn('MQTT TLS certificate validation is DISABLED (allowInsecureTls: true). ' +
                    'This is insecure and should only be used temporarily against a broker you control. ' +
                    'Traffic could be intercepted or tampered with by anything on your network path.');
            }
        }
        this.log.info(`Connecting to MQTT broker at ${protocol}://${this.config.host}:${port}...`);
        const client = mqtt_1.default.connect(options);
        this.client = client;
        client.on('connect', () => {
            this.connected = true;
            this.log.info('Connected to MQTT broker.');
            // `clean: true` means the broker forgets our subscriptions across disconnects, and
            // mqtt.js does not automatically restore them — without this, a broker restart or a
            // brief network blip would silently and permanently stop all discovery/state
            // updates until Homebridge itself was restarted.
            if (this.subscribedTopics.size > 0) {
                for (const topic of this.subscribedTopics) {
                    this.subscribeInternal(topic);
                }
                this.log.debug(`Restored ${this.subscribedTopics.size} MQTT subscription(s) after (re)connect.`);
            }
        });
        client.on('reconnect', () => {
            this.log.debug('Reconnecting to MQTT broker...');
        });
        client.on('close', () => {
            if (this.connected) {
                this.log.warn('MQTT connection closed. Will keep retrying in the background.');
            }
            this.connected = false;
        });
        client.on('offline', () => {
            this.connected = false;
        });
        client.on('error', (err) => {
            // Never let an MQTT-level error take down the whole Homebridge process.
            this.log.error(`MQTT client error: ${err.message}`);
        });
        client.on('message', (topic, payload) => {
            if (payload.length > settings_1.MAX_PAYLOAD_BYTES) {
                this.log.warn(`Ignoring oversized MQTT payload (${payload.length} bytes) on topic "${topic}".`);
                return;
            }
            for (const handler of this.handlers) {
                try {
                    handler(topic, payload);
                }
                catch (err) {
                    // A malformed/unexpected payload from a single entity must never take down
                    // processing for every other bed and sensor sharing this connection.
                    this.log.error(`Error handling MQTT message on "${topic}": ${err.message}`);
                }
            }
        });
    }
    subscribe(topic) {
        if (!this.client) {
            throw new Error('MqttManager.connect() must be called before subscribe().');
        }
        this.subscribedTopics.add(topic);
        this.subscribeInternal(topic);
    }
    subscribeInternal(topic) {
        if (!this.client) {
            return;
        }
        this.client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
                this.log.error(`Failed to subscribe to "${topic}": ${err.message}`);
            }
            else {
                this.log.debug(`Subscribed to "${topic}".`);
            }
        });
    }
    publish(topic, payload, retain = false) {
        if (!this.client || !this.connected) {
            this.log.warn(`Cannot publish to "${topic}": MQTT client is not connected.`);
            return;
        }
        this.client.publish(topic, payload, { qos: 0, retain }, (err) => {
            if (err) {
                this.log.error(`Failed to publish to "${topic}": ${err.message}`);
            }
        });
    }
    async destroy() {
        return new Promise((resolve) => {
            if (!this.client) {
                resolve();
                return;
            }
            this.client.end(false, {}, () => resolve());
        });
    }
}
exports.MqttManager = MqttManager;
//# sourceMappingURL=mqttManager.js.map