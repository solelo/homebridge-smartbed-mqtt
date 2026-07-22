import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { MqttManager } from './mqtt/mqttManager';
import { DiscoveryManager } from './discovery/discoveryManager';
import { BedAccessoryManager } from './accessories/bedAccessoryManager';
import { sanitizeNameOverrides } from './accessories/nameOverrides';
import { buildSubstringFilter } from './discovery/substringFilter';
import { DEFAULT_DISCOVERY_PREFIX, PLATFORM_NAME, PLUGIN_NAME } from './settings';

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
  includeEntities?: string[];
  excludeEntities?: string[];
  entityNameOverrides?: Array<{ match: string; name: string }>;
  hideTemperatureSensor?: boolean;
  hideHumiditySensor?: boolean;
  hideCo2Sensor?: boolean;
  accessoryPruneMinutes?: number;
}

/**
 * Default minutes to wait after startup before pruning cached accessories nothing has
 * re-claimed. BLE-connected beds in particular can take well over a minute to reconnect
 * and get rediscovered after a restart — too short a window here causes a still-valid bed
 * to be permanently unregistered from HomeKit just because it hadn't reconnected yet,
 * requiring smartbed-mqtt itself to restart before it can reappear (toggling the bed
 * elsewhere only sends a state update, not a fresh discovery message, so it won't recover
 * on its own once pruned).
 */
const DEFAULT_ACCESSORY_PRUNE_MINUTES = 5;

export class SmartBedMqttPlatform implements DynamicPlatformPlugin {
  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly claimedUuids = new Set<string>();
  private mqttManager?: MqttManager;
  private discoveryManager?: DiscoveryManager;

  constructor(
    private readonly log: Logger,
    private readonly config: SmartBedPlatformConfig,
    private readonly api: API,
  ) {
    this.api.on('didFinishLaunching', () => this.start());
    this.api.on('shutdown', () => {
      this.mqttManager?.destroy().catch(() => undefined);
    });
  }

  /** Required by DynamicPlatformPlugin: Homebridge hands us every accessory it had cached. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug(`Restoring cached accessory: ${accessory.displayName}`);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private start(): void {
    if (!this.config.mqttHost) {
      this.log.error(
        'No "mqttHost" configured for the Smart Bed MQTT platform. Add your MQTT broker\'s address in the ' +
          'plugin settings (Homebridge Config UI X) and restart Homebridge.',
      );
      return;
    }

    this.mqttManager = new MqttManager(
      {
        host: this.config.mqttHost,
        port: this.config.mqttPort,
        username: this.config.mqttUsername,
        password: this.config.mqttPassword,
        useTls: this.config.mqttUseTls,
        caFile: this.config.mqttCaFile,
        certFile: this.config.mqttCertFile,
        keyFile: this.config.mqttKeyFile,
        allowInsecureTls: this.config.mqttAllowInsecureTls,
      },
      this.log,
    );

    const deviceFilter = buildSubstringFilter(this.config.includeDevices, this.config.excludeDevices);
    const entityFilter = buildSubstringFilter(this.config.includeEntities, this.config.excludeEntities);

    this.discoveryManager = new DiscoveryManager(
      this.mqttManager,
      this.log,
      this.config.discoveryPrefix?.trim() || DEFAULT_DISCOVERY_PREFIX,
      deviceFilter,
      entityFilter,
    );

    new BedAccessoryManager(
      this.api,
      this.log,
      this.mqttManager,
      this.discoveryManager,
      this.cachedAccessories,
      (accessories) => {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
      },
      (accessories) => {
        for (const accessory of accessories) {
          this.claimedUuids.delete(accessory.UUID);
          this.cachedAccessories.delete(accessory.UUID);
        }
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
      },
      (accessory) => {
        this.claimedUuids.add(accessory.UUID);
      },
      sanitizeNameOverrides(this.config.entityNameOverrides),
      this.buildHiddenSensorClasses(),
    );

    // Accessories that came from the Homebridge cache get "claimed" the moment their
    // owning device settles for the first time (see BedAccessoryManager.onDeviceSettled,
    // which re-uses cached accessories rather than creating new ones). Anything still
    // unclaimed after a grace period belongs to a bed that's no longer being published by
    // smartbed-mqtt (renamed, removed, add-on reconfigured) and should be removed.
    const pruneMinutes = this.config.accessoryPruneMinutes ?? DEFAULT_ACCESSORY_PRUNE_MINUTES;
    setTimeout(() => this.pruneStaleAccessories(), pruneMinutes * 60_000);

    this.mqttManager.connect();
    this.discoveryManager.start();
  }

  private buildHiddenSensorClasses(): Set<string> {
    const hidden = new Set<string>();
    if (this.config.hideTemperatureSensor) {
      hidden.add('temperature');
    }
    if (this.config.hideHumiditySensor) {
      hidden.add('humidity');
    }
    if (this.config.hideCo2Sensor) {
      hidden.add('carbon_dioxide');
    }
    return hidden;
  }

  private pruneStaleAccessories(): void {
    const stale: PlatformAccessory[] = [];
    for (const [uuid, accessory] of this.cachedAccessories.entries()) {
      if (!this.claimedUuids.has(uuid)) {
        stale.push(accessory);
      }
    }
    if (stale.length === 0) {
      return;
    }
    for (const accessory of stale) {
      this.log.info(
        `Removing cached accessory "${accessory.displayName}" — smartbed-mqtt has not re-announced it since Homebridge started.`,
      );
      this.cachedAccessories.delete(accessory.UUID);
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
  }
}
