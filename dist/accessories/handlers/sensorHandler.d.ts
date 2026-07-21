import type { Service } from 'homebridge';
import { EntityHandler } from './base';
export declare function sensorIsSupported(deviceClass: string | undefined): boolean;
export declare class SensorHandler extends EntityHandler {
    private value;
    get listenTopics(): string[];
    setupService(): Service | undefined;
    onTopicMessage(topic: string, payload: Buffer): void;
}
