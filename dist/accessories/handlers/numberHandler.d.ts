import type { Service } from 'homebridge';
import { EntityHandler, HandlerContext } from './base';
import { DiscoveredEntity } from '../../discovery/types';
/**
 * Maps an HA `number` entity (massage intensity, timers, etc.) onto a HomeKit Fanv2
 * service using RotationSpeed as a 0-100 proxy for the underlying min/max range. A fan
 * tile with a speed slider is the closest native HomeKit control for "how strong", and —
 * unlike Lightbulb+Brightness — doesn't visually imply the bed has a light on this motor.
 */
export declare class NumberHandler extends EntityHandler {
    private percent;
    private readonly min;
    private readonly max;
    constructor(entity: DiscoveredEntity, ctx: HandlerContext);
    get listenTopics(): string[];
    setupService(): Service | undefined;
    onTopicMessage(topic: string, payload: Buffer): void;
}
