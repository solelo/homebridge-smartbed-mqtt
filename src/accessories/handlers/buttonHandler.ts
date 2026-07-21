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
export class ButtonHandler extends EntityHandler {
  private resetTimer?: NodeJS.Timeout;

  get listenTopics(): string[] {
    return [];
  }

  setupService(): Service | undefined {
    const { Service: S, Characteristic } = this.ctx.api.hap;
    const subtype = this.entity.objectId;
    const service =
      this.ctx.accessory.getServiceById(S.Switch, subtype) ?? this.ctx.accessory.addService(S.Switch, this.friendlyName(), subtype);
    service.setCharacteristic(Characteristic.Name, this.friendlyName());

    service
      .getCharacteristic(Characteristic.On)
      .onGet(() => false)
      .onSet((value) => {
        if (value) {
          this.press();
        }
      });

    this.service = service;
    return service;
  }

  private press(): void {
    const payload = this.entity.config.payload_press ?? 'PRESS';
    this.publish(this.entity.config.command_topic, payload);

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.service?.updateCharacteristic(this.ctx.api.hap.Characteristic.On, false);
    }, 1000);
  }

  onTopicMessage(): void {
    // Buttons are stateless — nothing to listen for.
  }

  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }
}
