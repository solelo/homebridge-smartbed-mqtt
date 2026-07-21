import type { Logger } from 'homebridge';
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
export declare class MqttManager {
    private readonly config;
    private readonly log;
    private client?;
    private readonly handlers;
    private connected;
    /** Every topic we've ever been asked to subscribe to, so we can restore them after a reconnect. */
    private readonly subscribedTopics;
    constructor(config: MqttManagerConfig, log: Logger);
    onMessage(handler: MessageHandler): void;
    isConnected(): boolean;
    connect(): void;
    subscribe(topic: string): void;
    private subscribeInternal;
    publish(topic: string, payload: string, retain?: boolean): void;
    destroy(): Promise<void>;
}
