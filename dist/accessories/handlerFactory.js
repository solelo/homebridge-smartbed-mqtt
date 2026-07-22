"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHandler = createHandler;
const coverHandler_1 = require("./handlers/coverHandler");
const switchHandler_1 = require("./handlers/switchHandler");
const lightHandler_1 = require("./handlers/lightHandler");
const buttonHandler_1 = require("./handlers/buttonHandler");
const sensorHandler_1 = require("./handlers/sensorHandler");
const numberHandler_1 = require("./handlers/numberHandler");
const selectHandler_1 = require("./handlers/selectHandler");
/**
 * Central place mapping an HA discovery `component` (+ `device_class` where relevant) to
 * the HomeKit-facing handler that will represent it. Returning `undefined` means "we
 * intentionally don't expose this entity" — always accompanied by a log line explaining
 * why, so a missing tile is never a silent mystery.
 */
function createHandler(entity, ctx) {
    switch (entity.component) {
        case 'cover':
            return new coverHandler_1.CoverHandler(entity, ctx);
        case 'switch':
            return new switchHandler_1.SwitchHandler(entity, ctx);
        case 'light':
            return new lightHandler_1.LightHandler(entity, ctx);
        case 'button':
            return new buttonHandler_1.ButtonHandler(entity, ctx);
        case 'number':
            return new numberHandler_1.NumberHandler(entity, ctx);
        case 'select':
            return new selectHandler_1.SelectHandler(entity, ctx);
        case 'binary_sensor':
            return new switchHandler_1.BinarySensorHandler(entity, ctx);
        case 'sensor':
            if (!(0, sensorHandler_1.sensorIsSupported)(entity.config.device_class)) {
                ctx.log.warn(`[${entity.deviceName}] Sensor "${entity.objectId}" (device_class: ${entity.config.device_class ?? 'none'}) has no ` +
                    'HomeKit equivalent and will not be exposed. Supported: temperature, humidity, carbon_dioxide.');
                return undefined;
            }
            if (ctx.hiddenSensorClasses?.has(entity.config.device_class)) {
                ctx.log.debug(`[${entity.deviceName}] Sensor "${entity.objectId}" (device_class: ${entity.config.device_class}) is hidden by config.`);
                return undefined;
            }
            return new sensorHandler_1.SensorHandler(entity, ctx);
        case 'fan':
            ctx.log.warn(`[${entity.deviceName}] Entity "${entity.objectId}" uses the "fan" component, which smartbed-mqtt does not currently ` +
                'publish for bed entities; skipping.');
            return undefined;
        default:
            ctx.log.warn(`[${entity.deviceName}] Unrecognized entity component "${entity.component}" for "${entity.objectId}"; skipping.`);
            return undefined;
    }
}
//# sourceMappingURL=handlerFactory.js.map