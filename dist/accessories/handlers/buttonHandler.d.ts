import type { Service } from 'homebridge';
import { EntityHandler } from './base';
/**
 * Maps an HA `button` entity (bed presets like Flat/Zero-G/TV, "program preset", massage
 * step-through, etc.) onto a HomeKit "momentary" Switch: tapping it in the Home app turns
 * it on, we publish the press payload, and it auto-resets to off ~1s later.
 *
 * This is deliberately a Switch rather than a StatelessProgrammableSwitch. HAP's
 * StatelessProgrammableSwitch is notify-only — there's no user-facing tile to tap in the
 * stock Home app, so it can only ever be an automation *trigger* driven by real hardware,
 * never something the person presses directly. A momentary Switch is tappable in the Home
 * app AND can trigger automations ("When Preset turns on...") AND can be triggered BY
 * automations/Siri ("Hey Siri, turn on Flat Preset"), which best matches "easy to set up
 * and control in HomeKit, and can be tied to automations."
 */
export declare class ButtonHandler extends EntityHandler {
    private resetTimer?;
    get listenTopics(): string[];
    setupService(): Service | undefined;
    private press;
    onTopicMessage(): void;
    destroy(): void;
}
