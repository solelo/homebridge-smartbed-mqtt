import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
export interface SmartBedPlatformConfig extends PlatformConfig {
    mqttHost?: string;
    mqttPort?: number;
    mqttUsername?: string;
    mqttPassword?: string;
    mqttUseTls?: boolean;
    mqttCaFile?: string;
    mqttCertFile?: string;
    mqttKeyFile?: string;
    mqttAllowInsecureTls?: boolean;
    discoveryPrefix?: string;
    includeDevices?: string[];
    excludeDevices?: string[];
    entityNameOverrides?: Array<{
        match: string;
        name: string;
    }>;
}
export declare class SmartBedMqttPlatform implements DynamicPlatformPlugin {
    private readonly log;
    private readonly config;
    private readonly api;
    private readonly cachedAccessories;
    private readonly claimedUuids;
    private mqttManager?;
    private discoveryManager?;
    constructor(log: Logger, config: SmartBedPlatformConfig, api: API);
    /** Required by DynamicPlatformPlugin: Homebridge hands us every accessory it had cached. */
    configureAccessory(accessory: PlatformAccessory): void;
    private start;
    private buildDeviceFilter;
    private pruneStaleAccessories;
}
