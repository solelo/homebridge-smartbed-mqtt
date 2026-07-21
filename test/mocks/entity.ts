import { DiscoveredEntity, HaComponent, HaDiscoveryConfig } from '../../src/discovery/types';

export function makeEntity(
  component: HaComponent,
  objectId: string,
  config: HaDiscoveryConfig,
  overrides: Partial<DiscoveredEntity> = {},
): DiscoveredEntity {
  return {
    configTopic: `homeassistant/${component}/bed1/${objectId}/config`,
    component,
    objectId,
    nodeId: 'bed1',
    config,
    deviceKey: 'bed1',
    deviceName: 'My Bed',
    lastSeen: Date.now(),
    ...overrides,
  };
}
