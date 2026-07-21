"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverHandler = void 0;
const base_1 = require("./base");
/**
 * Maps an HA `cover` entity (the motors smartbed-mqtt exposes for head/foot/tilt/lumbar
 * position) onto a HomeKit WindowCovering service. WindowCovering is the closest native
 * HomeKit primitive with a 0-100 position, works great with Shortcuts/Siri ("set Head to
 * 50%"), and is fully automatable (triggers + targets) in the Home app.
 */
class CoverHandler extends base_1.EntityHandler {
    constructor(entity, ctx) {
        super(entity, ctx);
        this.currentPosition = 0;
        this.targetPosition = 0;
        this.openPos = entity.config.position_open ?? 100;
        this.closedPos = entity.config.position_closed ?? 0;
    }
    get listenTopics() {
        const topics = [];
        if (this.entity.config.position_topic) {
            topics.push(this.entity.config.position_topic);
        }
        return topics;
    }
    setupService() {
        const { Service: S, Characteristic } = this.ctx.api.hap;
        const subtype = this.entity.objectId;
        const service = this.ctx.accessory.getServiceById(S.WindowCovering, subtype) ??
            this.ctx.accessory.addService(S.WindowCovering, this.friendlyName(), subtype);
        service.setCharacteristic(Characteristic.Name, this.friendlyName());
        service.getCharacteristic(Characteristic.CurrentPosition).onGet(() => this.currentPosition);
        service
            .getCharacteristic(Characteristic.TargetPosition)
            .onGet(() => this.targetPosition)
            .onSet((value) => this.handleSetTargetPosition(Number(value)));
        service.getCharacteristic(Characteristic.PositionState).onGet(() => Characteristic.PositionState.STOPPED);
        this.service = service;
        return service;
    }
    handleSetTargetPosition(homekitPos) {
        this.targetPosition = homekitPos;
        const scaled = this.scaleHomekitToDevice(homekitPos);
        if (this.entity.config.set_position_topic) {
            this.publish(this.entity.config.set_position_topic, String(scaled));
        }
        else if (this.entity.config.command_topic) {
            // Some covers only support OPEN/CLOSE/STOP rather than absolute positioning.
            if (homekitPos >= 90 && this.entity.config.payload_open) {
                this.publish(this.entity.config.command_topic, this.entity.config.payload_open);
            }
            else if (homekitPos <= 10 && this.entity.config.payload_close) {
                this.publish(this.entity.config.command_topic, this.entity.config.payload_close);
            }
            else {
                this.ctx.log.warn(`[${this.entity.deviceName}] "${this.entity.objectId}" only supports open/close, not an absolute position.`);
            }
        }
        // Optimistically reflect the target as current after a short delay unless a real
        // position update arrives first — many bed motors don't report interim position.
        setTimeout(() => {
            if (this.targetPosition === homekitPos) {
                this.currentPosition = homekitPos;
                this.service?.updateCharacteristic(this.ctx.api.hap.Characteristic.CurrentPosition, this.currentPosition);
            }
        }, 4000);
    }
    onTopicMessage(topic, payload) {
        if (topic !== this.entity.config.position_topic) {
            return;
        }
        const raw = this.resolveValue(this.entity.config.position_template, payload);
        if (raw === undefined || raw === null) {
            return;
        }
        const devicePos = Number(raw);
        if (!Number.isFinite(devicePos)) {
            return;
        }
        const homekitPos = this.scaleDeviceToHomekit(devicePos);
        this.currentPosition = homekitPos;
        this.targetPosition = homekitPos;
        const { Characteristic } = this.ctx.api.hap;
        this.service?.updateCharacteristic(Characteristic.CurrentPosition, homekitPos);
        this.service?.updateCharacteristic(Characteristic.TargetPosition, homekitPos);
    }
    scaleDeviceToHomekit(devicePos) {
        const span = this.openPos - this.closedPos || 1;
        const pct = ((devicePos - this.closedPos) / span) * 100;
        return clamp(Math.round(pct), 0, 100);
    }
    scaleHomekitToDevice(homekitPos) {
        const span = this.openPos - this.closedPos;
        const value = this.closedPos + (homekitPos / 100) * span;
        return Math.round(value);
    }
}
exports.CoverHandler = CoverHandler;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
//# sourceMappingURL=coverHandler.js.map