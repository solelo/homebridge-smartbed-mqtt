import type { Service } from 'homebridge';
import { EntityHandler, HandlerContext } from './base';
import { DiscoveredEntity } from '../../discovery/types';
/** Maps an HA `light` entity (under-bed lighting) onto a HomeKit Lightbulb service. */
export declare class LightHandler extends EntityHandler {
    private isOn;
    private brightnessPct;
    private readonly scale;
    constructor(entity: DiscoveredEntity, ctx: HandlerContext);
    get listenTopics(): string[];
    get supportsBrightness(): boolean;
    setupService(): Service | undefined;
    onTopicMessage(topic: string, payload: Buffer): void;
}
