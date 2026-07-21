import type { Service } from 'homebridge';
import { EntityHandler } from './base';
/**
 * Maps an HA `select` entity (e.g. massage wave pattern) onto one momentary Switch per
 * option. HomeKit has no native multi-choice picker in the stock Home app, so rather than
 * skip the entity entirely we expose "Bed Massage Pattern: Wave", "...: Pulse", etc. as
 * individual tappable/automatable switches — selecting one publishes that option.
 */
export declare class SelectHandler extends EntityHandler {
    private resetTimers;
    private services;
    get listenTopics(): string[];
    setupService(): Service | undefined;
    private selectOption;
    onTopicMessage(): void;
    destroy(): void;
}
