"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectHandler = void 0;
const base_1 = require("./base");
/**
 * Maps an HA `select` entity (e.g. massage wave pattern) onto one momentary Switch per
 * option. HomeKit has no native multi-choice picker in the stock Home app, so rather than
 * skip the entity entirely we expose "Bed Massage Pattern: Wave", "...: Pulse", etc. as
 * individual tappable/automatable switches — selecting one publishes that option.
 */
class SelectHandler extends base_1.EntityHandler {
    constructor() {
        super(...arguments);
        this.resetTimers = new Map();
        this.services = new Map();
    }
    get listenTopics() {
        return [];
    }
    setupService() {
        const { Service: S, Characteristic } = this.ctx.api.hap;
        const options = this.entity.config.options ?? [];
        if (options.length === 0) {
            this.ctx.log.warn(`[${this.entity.deviceName}] Select "${this.entity.objectId}" published no options; skipping.`);
            return undefined;
        }
        let primary;
        for (const option of options) {
            const subtype = `${this.entity.objectId}:${option}`;
            const label = `${this.friendlyName()}: ${option}`;
            const service = this.ctx.accessory.getServiceById(S.Switch, subtype) ?? this.ctx.accessory.addService(S.Switch, label, subtype);
            service.setCharacteristic(Characteristic.Name, label);
            service
                .getCharacteristic(Characteristic.On)
                .onGet(() => false)
                .onSet((value) => {
                if (value) {
                    this.selectOption(option, service);
                }
            });
            this.services.set(option, service);
            primary = primary ?? service;
        }
        this.service = primary;
        return primary;
    }
    selectOption(option, service) {
        this.publish(this.entity.config.command_topic, option);
        const existing = this.resetTimers.get(option);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            service.updateCharacteristic(this.ctx.api.hap.Characteristic.On, false);
        }, 1000);
        this.resetTimers.set(option, timer);
    }
    onTopicMessage() {
        // We treat select entities as fire-and-forget commands; smartbed-mqtt doesn't
        // publish a meaningful "currently selected" state for the bed massage patterns this
        // targets, so there is nothing to reconcile here.
    }
    destroy() {
        for (const timer of this.resetTimers.values()) {
            clearTimeout(timer);
        }
    }
}
exports.SelectHandler = SelectHandler;
//# sourceMappingURL=selectHandler.js.map