import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { MqttManager } from './mqtt/mqttManager';
import { DiscoveryManager } from './discovery/discoveryManager';
import { BedAccessoryManager } from './accessories/bedAccessoryManager';
import { sanitizeNameOverrides } from './accessories/nameOverrides';
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
  entityNameOverrides?: Array<{ match: string; name: string }>;
}

/** How long we wait after startup before pruning cached accessories nothing re-claimed. */
const STALE_ACCESSORY_PRUNE_MS = 45_000;

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

    const deviceFilter = this.buildDeviceFilter();

    this.discoveryManager = new DiscoveryManager(
      this.mqttManager,
      this.log,
      this.config.discoveryPrefix?.trim() || DEFAULT_DISCOVERY_PREFIX,
      deviceFilter,
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
    );

    // Accessories that came from the Homebridge cache get "claimed" the moment their
    // owning device settles for the first time (see BedAccessoryManager.onDeviceSettled,
    // which re-uses cached accessories rather than creating new ones). Anything still
    // unclaimed after a grace period belongs to a bed that's no longer being published by
    // smartbed-mqtt (renamed, removed, add-on reconfigured) and should be removed.
    setTimeout(() => this.pruneStaleAccessories(), STALE_ACCESSORY_PRUNE_MS);

    this.mqttManager.connect();
    this.discoveryManager.start();
  }

  private buildDeviceFilter(): ((deviceName: string) => boolean) | undefined {
    const include = this.config.includeDevices?.map((s) => s.toLowerCase().trim()).filter(Boolean);
    const exclude = this.config.excludeDevices?.map((s) => s.toLowerCase().trim()).filter(Boolean);

    if ((!include || include.length === 0) && (!exclude || exclude.length === 0)) {
      return undefined;
    }

    return (deviceName: string) => {
      const name = deviceName.toLowerCase();
      if (include && include.length > 0 && !include.some((s) => name.includes(s))) {
        return false;
      }
      if (exclude && exclude.some((s) => name.includes(s))) {
        return false;
      }
      return true;
    };
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
