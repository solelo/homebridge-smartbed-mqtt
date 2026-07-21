import type { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { SmartBedMqttPlatform } from './platform';

/**
 * Homebridge calls this exported function directly (CommonJS `module.exports`), so we
 * use `export =` rather than `export default` to avoid ending up under `.default` in the
 * compiled output, which Homebridge would not find.
 */
export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, SmartBedMqttPlatform);
};
