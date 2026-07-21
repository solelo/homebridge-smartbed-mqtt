import type { API } from 'homebridge';
/**
 * Homebridge calls this exported function directly (CommonJS `module.exports`), so we
 * use `export =` rather than `export default` to avoid ending up under `.default` in the
 * compiled output, which Homebridge would not find.
 */
declare const _default: (api: API) => void;
export = _default;
