"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberHandler = void 0;
const base_1 = require("./base");
/**
 * Maps an HA `number` entity (massage intensity, timers, etc.) onto a HomeKit Fanv2
 * service using RotationSpeed as a 0-100 proxy for the underlying min/max range. A fan
 * tile with a speed slider is the closest native HomeKit control for "how strong", and —
 * unlike Lightbulb+Brightness — doesn't visually imply the bed has a light on this motor.
 */
class NumberHandler extends base_1.EntityHandler {
    constructor(entity, ctx) {
        super(entity, ctx);
        this.percent = 0;
        this.min = this.entity.config.min ?? 0;
        this.max = this.entity.config.max ?? 100;
    }
    get listenTopics() {
        return this.entity.config.state_topic ? [this.entity.config.state_topic] : [];
    }
    setupService() {
        const { Service: S, Characteristic } = this.ctx.api.hap;
        const subtype = this.entity.objectId;
        const service = this.ctx.accessory.getServiceById(S.Fanv2, subtype) ?? this.ctx.accessory.addService(S.Fanv2, this.friendlyName(), subtype);
        service.setCharacteristic(Characteristic.Name, this.friendlyName());
        service
            .getCharacteristic(Characteristic.Active)
            .onGet(() => (this.percent > 0 ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
            .onSet((value) => {
            if (value === Characteristic.Active.INACTIVE) {
                this.publish(this.entity.config.command_topic, String(this.min));
            }
        });
        service
            .getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minStep: 1 })
            .onGet(() => this.percent)
            .onSet((value) => {
            const pct = Number(value);
            const span = this.max - this.min || 1;
            const deviceValue = Math.round(this.min + (pct / 100) * span);
            this.publish(this.entity.config.command_topic, String(deviceValue));
        });
        this.service = service;
        return service;
    }
    onTopicMessage(topic, payload) {
        if (topic !== this.entity.config.state_topic) {
            return;
        }
        const raw = this.resolveValue(this.entity.config.value_template, payload);
        const num = Number(raw);
        if (!Number.isFinite(num)) {
            return;
        }
        const span = this.max - this.min || 1;
        this.percent = clamp(Math.round(((num - this.min) / span) * 100), 0, 100);
        const { Characteristic } = this.ctx.api.hap;
        this.service?.updateCharacteristic(Characteristic.RotationSpeed, this.percent);
        this.service?.updateCharacteristic(Characteristic.Active, this.percent > 0 ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    }
}
exports.NumberHandler = NumberHandler;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
//# sourceMappingURL=numberHandler.js.map