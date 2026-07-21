"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityHandler = void 0;
const templateResolver_1 = require("../../discovery/templateResolver");
/**
 * Common behaviour shared by every entity -> HomeKit service adapter:
 *  - attaches/reuses a HAP Service on the accessory
 *  - tracks whether the underlying MQTT entity is currently "available"
 *  - provides a safe helper for resolving a `value_template` against an incoming payload
 *
 * Concrete subclasses implement `setupService()` (build the Service + wire onGet/onSet)
 * and `onTopicMessage()` (react to a subscribed state topic).
 */
class EntityHandler {
    constructor(entity, ctx) {
        this.available = true;
        this.entity = entity;
        this.ctx = ctx;
    }
    handleAvailability(available) {
        this.available = available;
        if (!this.service) {
            return;
        }
        // HAP has no first-class "unavailable" flag for most services; the convention used
        // throughout this plugin is to surface it via StatusFault where the service supports
        // it, which HomeKit clients render as a warning triangle rather than silently
        // showing stale state as if it were current.
        const { Characteristic } = this.ctx.api.hap;
        if (this.service.testCharacteristic(Characteristic.StatusFault)) {
            this.service.updateCharacteristic(Characteristic.StatusFault, available ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT);
        }
    }
    resolveValue(templateStr, payload) {
        const parsed = (0, templateResolver_1.parseTemplate)(templateStr);
        if (!parsed) {
            this.ctx.log.warn(`[${this.entity.deviceName}] Unsupported value_template on "${this.entity.objectId}": "${templateStr}". ` +
                'Skipping this update. Please report this bed/entity so support can be added.');
            return undefined;
        }
        return (0, templateResolver_1.resolveTemplate)(parsed, payload.toString('utf8'));
    }
    publish(topic, payload) {
        if (!topic) {
            this.ctx.log.warn(`[${this.entity.deviceName}] Tried to send a command for "${this.entity.objectId}" but no command topic was published for it.`);
            return;
        }
        this.ctx.mqtt.publish(topic, payload, false);
    }
    /** Human-friendly name for the HAP service (falls back sensibly). */
    friendlyName() {
        return this.entity.config.name || this.entity.objectId;
    }
}
exports.EntityHandler = EntityHandler;
//# sourceMappingURL=base.js.map