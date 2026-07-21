/**
 * Types describing the subset of the Home Assistant MQTT Discovery schema that
 * smartbed-mqtt (and HA MQTT integrations in general) publish. We intentionally only
 * model the fields we act on. Unknown/extra fields are ignored, never trusted blindly.
 *
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 */
export type HaComponent = 'cover' | 'switch' | 'light' | 'button' | 'sensor' | 'binary_sensor' | 'number' | 'select' | 'fan';
export interface HaDevice {
    identifiers?: string | string[];
    name?: string;
    manufacturer?: string;
    model?: string;
    sw_version?: string;
    via_device?: string;
}
/**
 * The fields of an HA discovery config payload we understand. Every field is optional
 * because the payload is attacker/broker controlled data off the wire and must never be
 * assumed present.
 */
export interface HaDiscoveryConfig {
    name?: string;
    unique_id?: string;
    object_id?: string;
    device?: HaDevice;
    availability_topic?: string;
    payload_available?: string;
    payload_not_available?: string;
    state_topic?: string;
    value_template?: string;
    command_topic?: string;
    payload_on?: string;
    payload_off?: string;
    state_on?: string;
    state_off?: string;
    optimistic?: boolean;
    payload_press?: string;
    brightness_state_topic?: string;
    brightness_command_topic?: string;
    brightness_scale?: number;
    brightness_value_template?: string;
    position_topic?: string;
    set_position_topic?: string;
    position_template?: string;
    position_open?: number;
    position_closed?: number;
    payload_open?: string;
    payload_close?: string;
    payload_stop?: string;
    tilt_status_topic?: string;
    tilt_command_topic?: string;
    device_class?: string;
    unit_of_measurement?: string;
    state_class?: string;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    percentage_state_topic?: string;
    percentage_command_topic?: string;
    speed_range_min?: number;
    speed_range_max?: number;
}
/** A fully parsed & validated discovery entry, keyed by its discovery config topic. */
export interface DiscoveredEntity {
    configTopic: string;
    component: HaComponent;
    objectId: string;
    nodeId?: string;
    config: HaDiscoveryConfig;
    /** Stable identifier for the physical bed this entity belongs to. */
    deviceKey: string;
    deviceName: string;
    manufacturer?: string;
    model?: string;
    lastSeen: number;
}
export declare function isKnownComponent(value: string): value is HaComponent;
/**
 * Derive a stable device key from an HA `device.identifiers` field, which may be a
 * single string, an array of strings, or (per spec) an array of [domain, id] tuples
 * serialized as arrays. We defensively coerce whatever we get into a single string.
 */
export declare function deviceKeyFromIdentifiers(identifiers: HaDevice['identifiers']): string | undefined;
