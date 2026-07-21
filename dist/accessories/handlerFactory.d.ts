import { DiscoveredEntity } from '../discovery/types';
import { EntityHandler, HandlerContext } from './handlers/base';
/**
 * Central place mapping an HA discovery `component` (+ `device_class` where relevant) to
 * the HomeKit-facing handler that will represent it. Returning `undefined` means "we
 * intentionally don't expose this entity" — always accompanied by a log line explaining
 * why, so a missing tile is never a silent mystery.
 */
export declare function createHandler(entity: DiscoveredEntity, ctx: HandlerContext): EntityHandler | undefined;
