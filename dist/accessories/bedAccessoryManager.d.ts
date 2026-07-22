import type { API, Logger, PlatformAccessory } from 'homebridge';
import { MqttManager } from '../mqtt/mqttManager';
import { DiscoveryManager } from '../discovery/discoveryManager';
import { NameOverrideRule } from './nameOverrides';
/**
 * Owns the mapping between smartbed-mqtt "devices" (one per physical/virtual bed) and
 * Homebridge PlatformAccessories: creating them, attaching/removing HAP services as
 * entities come and go, and fanning out incoming MQTT messages to the right handler(s).
 */
export declare class BedAccessoryManager {
    private readonly api;
    private readonly log;
    private readonly mqtt;
    private readonly discovery;
    private readonly cachedAccessories;
    private readonly registerAccessories;
    private readonly unregisterAccessories;
    private readonly claimAccessory;
    private readonly nameOverrides;
    private readonly hiddenSensorClasses;
    private readonly devices;
    /** topic -> handlers listening on it, across every device (state/position/etc.) */
    private readonly stateTopicIndex;
    /** topic -> entities whose availability is reported on it */
    private readonly availabilityTopicIndex;
    private readonly lastSeenOnline;
    constructor(api: API, log: Logger, mqtt: MqttManager, discovery: DiscoveryManager, cachedAccessories: Map<string, PlatformAccessory>, registerAccessories: (accessories: PlatformAccessory[]) => void, unregisterAccessories: (accessories: PlatformAccessory[]) => void, claimAccessory: (accessory: PlatformAccessory) => void, nameOverrides?: NameOverrideRule[], hiddenSensorClasses?: Set<string>);
    private uuidFor;
    private onDeviceSettled;
    private attachEntity;
    private detachEntity;
    private onEntityRemoved;
    private onDeviceRemoved;
    private setAccessoryInformation;
    private indexTopic;
    private routeMessage;
    private checkStaleAvailability;
}
