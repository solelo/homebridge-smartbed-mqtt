import type { Service } from 'homebridge';
import { EntityHandler, HandlerContext } from './base';
import { DiscoveredEntity } from '../../discovery/types';
/**
 * Maps an HA `cover` entity (the motors smartbed-mqtt exposes for head/foot/tilt/lumbar
 * position) onto a HomeKit WindowCovering service. WindowCovering is the closest native
 * HomeKit primitive with a 0-100 position, works great with Shortcuts/Siri ("set Head to
 * 50%"), and is fully automatable (triggers + targets) in the Home app.
 */
export declare class CoverHandler extends EntityHandler {
    private readonly openPos;
    private readonly closedPos;
    private currentPosition;
    private targetPosition;
    constructor(entity: DiscoveredEntity, ctx: HandlerContext);
    get listenTopics(): string[];
    setupService(): Service | undefined;
    private handleSetTargetPosition;
    onTopicMessage(topic: string, payload: Buffer): void;
    private scaleDeviceToHomekit;
    private scaleHomekitToDevice;
}
