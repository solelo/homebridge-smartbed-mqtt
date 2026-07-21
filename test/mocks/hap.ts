/**
 * Hand-rolled stand-in for the slice of `api.hap` (real hap-nodejs Service/Characteristic
 * classes) and `PlatformAccessory` that this plugin actually touches. We deliberately do
 * not depend on the real hap-nodejs runtime here: its Characteristic get/set dispatch is
 * async wire-protocol machinery (HAP requests/connections) that has nothing to do with the
 * logic this plugin owns. These fakes let tests drive `onGet`/`onSet` handlers directly and
 * assert on `updateCharacteristic` calls, which is what every handler class actually does.
 */

export type GetHandler = () => unknown;
export type SetHandler = (value: unknown) => unknown;

export class FakeCharacteristic {
  value: unknown;
  private getHandler?: GetHandler;
  private setHandler?: SetHandler;

  constructor(public readonly uuid: string) {}

  onGet(handler: GetHandler): this {
    this.getHandler = handler;
    return this;
  }

  onSet(handler: SetHandler): this {
    this.setHandler = handler;
    return this;
  }

  setProps(): this {
    return this;
  }

  /** Test helper: invoke the registered onGet handler (falls back to last-known value). */
  async triggerGet(): Promise<unknown> {
    return this.getHandler ? this.getHandler() : this.value;
  }

  /**
   * Test helper: invoke the registered onSet handler as HomeKit would on a write. Mirrors
   * real hap-nodejs's handleSetRequest, which persists the written value onto the
   * characteristic once the handler resolves without throwing — plugins that rely on that
   * (e.g. a momentary switch that only resets itself back to `false` on a timer) never call
   * `updateCharacteristic` themselves for the initial "on".
   */
  async triggerSet(value: unknown): Promise<void> {
    await this.setHandler?.(value);
    this.value = value;
  }
}

export interface CharacteristicCtor {
  UUID: string;
  [key: string]: unknown;
}

function characteristic(uuid: string, extra: Record<string, unknown> = {}): CharacteristicCtor {
  return { UUID: uuid, ...extra };
}

export const Characteristic = {
  Name: characteristic('name'),
  Manufacturer: characteristic('manufacturer'),
  Model: characteristic('model'),
  SerialNumber: characteristic('serial-number'),
  On: characteristic('on'),
  StatusFault: characteristic('status-fault', { NO_FAULT: 0, GENERAL_FAULT: 1 }),
  ContactSensorState: characteristic('contact-sensor-state', {
    CONTACT_DETECTED: 0,
    CONTACT_NOT_DETECTED: 1,
  }),
  CurrentPosition: characteristic('current-position'),
  TargetPosition: characteristic('target-position'),
  PositionState: characteristic('position-state', { DECREASING: 0, INCREASING: 1, STOPPED: 2 }),
  Brightness: characteristic('brightness'),
  Active: characteristic('active', { INACTIVE: 0, ACTIVE: 1 }),
  RotationSpeed: characteristic('rotation-speed'),
  CurrentTemperature: characteristic('current-temperature'),
  CurrentRelativeHumidity: characteristic('current-relative-humidity'),
  CarbonDioxideLevel: characteristic('co2-level'),
  CarbonDioxideDetected: characteristic('co2-detected', {
    CO2_LEVELS_NORMAL: 0,
    CO2_LEVELS_ABNORMAL: 1,
  }),
};

export class FakeService {
  readonly UUID: string;
  subtype?: string;
  displayName: string;
  private readonly characteristics = new Map<string, FakeCharacteristic>();

  constructor(uuid: string, displayName?: string, subtype?: string) {
    this.UUID = uuid;
    this.displayName = displayName ?? '';
    this.subtype = subtype;
  }

  getCharacteristic(ctor: CharacteristicCtor): FakeCharacteristic {
    let existing = this.characteristics.get(ctor.UUID);
    if (!existing) {
      existing = new FakeCharacteristic(ctor.UUID);
      this.characteristics.set(ctor.UUID, existing);
    }
    return existing;
  }

  setCharacteristic(ctor: CharacteristicCtor, value: unknown): this {
    this.getCharacteristic(ctor).value = value;
    return this;
  }

  updateCharacteristic(ctor: CharacteristicCtor, value: unknown): this {
    this.getCharacteristic(ctor).value = value;
    return this;
  }

  testCharacteristic(ctor: CharacteristicCtor): boolean {
    return this.characteristics.has(ctor.UUID);
  }
}

export interface ServiceCtor {
  UUID: string;
  new (displayName?: string, subtype?: string): FakeService;
}

function serviceCtor(uuid: string): ServiceCtor {
  const ctor = class extends FakeService {
    constructor(displayName?: string, subtype?: string) {
      super(uuid, displayName, subtype);
    }
  };
  (ctor as unknown as { UUID: string }).UUID = uuid;
  return ctor as unknown as ServiceCtor;
}

export const Service = {
  AccessoryInformation: serviceCtor('accessory-information'),
  Switch: serviceCtor('switch'),
  ContactSensor: serviceCtor('contact-sensor'),
  WindowCovering: serviceCtor('window-covering'),
  Lightbulb: serviceCtor('lightbulb'),
  Fanv2: serviceCtor('fanv2'),
  TemperatureSensor: serviceCtor('temperature-sensor'),
  HumiditySensor: serviceCtor('humidity-sensor'),
  CarbonDioxideSensor: serviceCtor('co2-sensor'),
};

export class FakePlatformAccessory {
  readonly UUID: string;
  displayName: string;
  context: Record<string, unknown> = {};
  services: FakeService[] = [];

  constructor(displayName: string, uuid: string) {
    this.displayName = displayName;
    this.UUID = uuid;
  }

  addService(ctor: ServiceCtor, displayName?: string, subtype?: string): FakeService {
    const service = new ctor(displayName, subtype);
    this.services.push(service);
    return service;
  }

  getService(ctor: ServiceCtor): FakeService | undefined {
    return this.services.find((s) => s.UUID === ctor.UUID && s.subtype === undefined);
  }

  getServiceById(ctor: ServiceCtor, subtype: string): FakeService | undefined {
    return this.services.find((s) => s.UUID === ctor.UUID && s.subtype === subtype);
  }

  removeService(service: FakeService): void {
    this.services = this.services.filter((s) => s !== service);
  }
}

/**
 * Handler classes are typed against the real `homebridge` `Service`/`Characteristic`
 * types (that's what production code returns). At runtime what we hand them back is a
 * `FakeService`/`FakeCharacteristic`, so tests use this to get back to a type that
 * exposes the test-only helpers (`triggerGet`/`triggerSet`, etc.) without sprinkling
 * `as unknown as FakeService` everywhere a service/characteristic is touched.
 */
export function asFake(service: unknown): FakeService {
  return service as unknown as FakeService;
}

export function makeFakeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
  };
}

export function makeFakeApi() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    hap: {
      Service,
      Characteristic,
      uuid: { generate: (input: string) => `uuid:${input}` },
    },
    platformAccessory: FakePlatformAccessory,
    on(event: string, cb: (...args: unknown[]) => void): void {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    },
    emit(event: string, ...args: unknown[]): void {
      for (const cb of listeners.get(event) ?? []) {
        cb(...args);
      }
    },
    registerPlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
  };
}
