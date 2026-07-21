import type { Service } from 'homebridge';
import { EntityHandler } from './base';
/**
 * Maps an HA `switch` entity (under-bed light toggle, snore-response toggle, safety
 * light, etc.) onto a HomeKit Switch service. Switches are both automation triggers and
 * automation targets in the Home app, so these compose naturally with scenes.
 */
export declare class SwitchHandler extends EntityHandler {
    private isOn;
    get listenTopics(): string[];
    setupService(): Service | undefined;
    onTopicMessage(topic: string, payload: Buffer): void;
}
/**
 * Maps a read-only HA `binary_sensor` (e.g. presence-adjacent diagnostics some bed
 * integrations expose) onto a HomeKit ContactSensor. We deliberately don't try to infer
 * every possible `device_class` -> HomeKit sensor-type mapping; contact sensor is a safe,
 * generic "open/closed"-style boolean that shows up cleanly in the Home app and can drive
 * automations either way.
 */
export declare class BinarySensorHandler extends EntityHandler {
    private detected;
    get listenTopics(): string[];
    setupService(): Service | undefined;
    onTopicMessage(topic: string, payload: Buffer): void;
}
