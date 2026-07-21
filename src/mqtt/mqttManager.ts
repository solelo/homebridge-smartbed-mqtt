import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import type { Logger } from 'homebridge';
import { readFileSync } from 'fs';
import { DEFAULT_MQTT_PORT, DEFAULT_MQTT_TLS_PORT, MAX_PAYLOAD_BYTES } from '../settings';

export interface MqttManagerConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  useTls?: boolean;
  /** Path to a CA certificate file for verifying a private/self-signed broker. */
  caFile?: string;
  /** Path to a client certificate for mutual TLS. */
  certFile?: string;
  /** Path to a client private key for mutual TLS. */
  keyFile?: string;
  /**
   * Only ever disable certificate validation for a broker you control on a trusted
   * network, and only if you understand the risk: this allows MITM interception of
   * every command sent to your bed and every discovery payload received from it.
   */
  allowInsecureTls?: boolean;
  clientId?: string;
}

export type MessageHandler = (topic: string, payload: Buffer) => void;

/**
 * Thin, defensive wrapper around the `mqtt` client: centralizes connection options
 * (including TLS/auth), enforces a payload size ceiling before handing bytes to
 * subscribers, and exposes a single place to reason about reconnect/error handling so a
 * flaky broker or Wi-Fi drop can never crash the Homebridge process.
 */
export class MqttManager {
  private client?: MqttClient;
  private readonly handlers: MessageHandler[] = [];
  private connected = false;
  /** Every topic we've ever been asked to subscribe to, so we can restore them after a reconnect. */
  private readonly subscribedTopics = new Set<string>();

  constructor(
    private readonly config: MqttManagerConfig,
    private readonly log: Logger,
  ) {}

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  connect(): void {
    const protocol = this.config.useTls ? 'mqtts' : 'mqtt';
    const port = this.config.port ?? (this.config.useTls ? DEFAULT_MQTT_TLS_PORT : DEFAULT_MQTT_PORT);

    const options: IClientOptions = {
      host: this.config.host,
      port,
      protocol,
      username: this.config.username || undefined,
      password: this.config.password || undefined,
      clientId:
        this.config.clientId ?? `homebridge-smartbed-mqtt_${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
      clean: true,
      rejectUnauthorized: !this.config.allowInsecureTls,
    };

    if (this.config.useTls) {
      try {
        if (this.config.caFile) {
          options.ca = readFileSync(this.config.caFile);
        }
        if (this.config.certFile) {
          options.cert = readFileSync(this.config.certFile);
        }
        if (this.config.keyFile) {
          options.key = readFileSync(this.config.keyFile);
        }
      } catch (err) {
        this.log.error(
          `Failed to read TLS certificate file(s) for MQTT connection: ${(err as Error).message}. ` +
            'Check the caFile/certFile/keyFile paths in your config.',
        );
      }
      if (this.config.allowInsecureTls) {
        this.log.warn(
          'MQTT TLS certificate validation is DISABLED (allowInsecureTls: true). ' +
            'This is insecure and should only be used temporarily against a broker you control. ' +
            'Traffic could be intercepted or tampered with by anything on your network path.',
        );
      }
    }

    this.log.info(`Connecting to MQTT broker at ${protocol}://${this.config.host}:${port}...`);
    const client = mqtt.connect(options);
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
      if (payload.length > MAX_PAYLOAD_BYTES) {
        this.log.warn(`Ignoring oversized MQTT payload (${payload.length} bytes) on topic "${topic}".`);
        return;
      }
      for (const handler of this.handlers) {
        try {
          handler(topic, payload);
        } catch (err) {
          // A malformed/unexpected payload from a single entity must never take down
          // processing for every other bed and sensor sharing this connection.
          this.log.error(`Error handling MQTT message on "${topic}": ${(err as Error).message}`);
        }
      }
    });
  }

  subscribe(topic: string): void {
    if (!this.client) {
      throw new Error('MqttManager.connect() must be called before subscribe().');
    }
    this.subscribedTopics.add(topic);
    this.subscribeInternal(topic);
  }

  private subscribeInternal(topic: string): void {
    if (!this.client) {
      return;
    }
    this.client.subscribe(topic, { qos: 0 }, (err) => {
      if (err) {
        this.log.error(`Failed to subscribe to "${topic}": ${err.message}`);
      } else {
        this.log.debug(`Subscribed to "${topic}".`);
      }
    });
  }

  publish(topic: string, payload: string, retain = false): void {
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

  async destroy(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }
      this.client.end(false, {}, () => resolve());
    });
  }
}
