# homebridge-smartbed-mqtt

[![CI](https://github.com/solelo/homebridge-smartbed-mqtt/actions/workflows/ci.yml/badge.svg)](https://github.com/solelo/homebridge-smartbed-mqtt/actions/workflows/ci.yml)

A Homebridge plugin that brings beds published by [smartbed-mqtt](https://github.com/richardhopton/smartbed-mqtt)
into HomeKit — covers/motors, presets, massage, under-bed lights, and sensors — fully
controllable and automatable in the Home app.

## How this works (and why it supports every bed smartbed-mqtt supports)

smartbed-mqtt doesn't talk to Sleeptracker, ErgoMotion, Linak, Richmat, Keeson, Octo, etc.
directly from Homebridge's point of view — it normalizes all of them into the standard
**Home Assistant MQTT Discovery** protocol and publishes that to your MQTT broker. This
plugin doesn't implement any bed protocol either: it subscribes to the same discovery
topics (`homeassistant/<component>/.../config` by default) and dynamically builds HomeKit
accessories from whatever smartbed-mqtt announces.

That means:

- **You don't tell this plugin what bed you have.** It finds out from the broker.
- **Every current and future bed type smartbed-mqtt adds is supported automatically**,
  as long as it's exposed through the same discovery mechanism (which, per the
  smartbed-mqtt README, all of them are).
- If smartbed-mqtt is restarted, reconfigured, or a bed is renamed/removed, this plugin
  reflects that in HomeKit automatically — no manual accessory management.

```
[ Your Bed ] <--(BLE/TCP/Cloud)--> [ smartbed-mqtt add-on ] <--MQTT--> [ Homebridge + this plugin ] <--HomeKit--> [ Home app ]
```

## Requirements

- Homebridge v1.8+ (or v2.0 beta)
- The [smartbed-mqtt](https://github.com/richardhopton/smartbed-mqtt) add-on already
  installed, configured for your bed, and successfully publishing to an MQTT broker
- Network access from the Homebridge host to that same MQTT broker

## Installation

```
npm install -g homebridge-smartbed-mqtt
```

Or search for **"Smart Bed MQTT"** in Homebridge Config UI X and click Install.

## Configuration

Easiest path: use Homebridge Config UI X — install the plugin, open its settings, fill in
your MQTT broker's host/port/credentials, and save. Nothing bed-specific to configure.

Manual `config.json` example:

```json
{
  "platforms": [
    {
      "platform": "SmartBedMqtt",
      "name": "Smart Bed MQTT",
      "mqttHost": "192.168.1.10",
      "mqttPort": 1883,
      "mqttUsername": "homebridge",
      "mqttPassword": "your-broker-password",
      "mqttUseTls": false,
      "discoveryPrefix": "homeassistant"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `mqttHost` | Yes | Same broker smartbed-mqtt publishes to. |
| `mqttPort` | No | Defaults to 1883, or 8883 when `mqttUseTls` is true. |
| `mqttUsername` / `mqttPassword` | No | Only if your broker requires auth (recommended). |
| `mqttUseTls` | No | Enable for `mqtts://`. Recommended if the broker is reachable beyond your LAN. |
| `mqttCaFile` / `mqttCertFile` / `mqttKeyFile` | No | For a private CA or mutual TLS. |
| `mqttAllowInsecureTls` | No | Skips certificate validation. Avoid outside of temporary testing on a broker you control. |
| `discoveryPrefix` | No | Defaults to `homeassistant`. Only change if you changed it in smartbed-mqtt/HA. |
| `includeDevices` / `excludeDevices` | No | Arrays of case-insensitive substrings to filter which beds are exposed. |
| `includeEntities` / `excludeEntities` | No | Arrays of case-insensitive substrings to filter which *individual controls* are exposed (unlike `includeDevices`/`excludeDevices`, which hide a whole bed). |
| `entityNameOverrides` | No | Array of `{ "match": "...", "name": "..." }` rules to rename controls (see below). |

Restart Homebridge after saving. Beds typically appear in HomeKit within a few seconds,
once smartbed-mqtt (re)publishes its retained discovery messages.

### Renaming controls

Different smartbed-mqtt bed integrations name their entities very differently. Some
publish readable names; others (particularly generic/BLE-based integrations) pass through
raw, technical names — a BLE chip's advertised device name, an internal characteristic
label, and similar — that don't mean anything in the Home app. Rather than special-case
every bed brand/integration smartbed-mqtt supports, `entityNameOverrides` lets you rename
any control yourself:

```json
{
  "platform": "SmartBedMqtt",
  "name": "Smart Bed MQTT",
  "mqttHost": "192.168.1.10",
  "entityNameOverrides": [
    { "match": "adruno", "name": "Bed Controller" },
    { "match": "connectivity", "name": "Bed Connection" }
  ]
}
```

`match` is a case-insensitive substring checked against each control's raw name (falling
back to its object ID) as published by smartbed-mqtt — turn on Homebridge's debug logging
(`-D`) to see the raw names/IDs it's discovering for your bed. The first matching rule
wins; anything that doesn't match keeps its original name.

### Hiding individual controls

`includeDevices`/`excludeDevices` hide an entire bed. To hide just *one control* (e.g. a
snore-relief vibration/tilt control you don't want in HomeKit) while keeping the rest of
that same bed, use `includeEntities`/`excludeEntities` instead — same case-insensitive
substring matching, checked against the same raw name/ID as `entityNameOverrides` above:

```json
{
  "platform": "SmartBedMqtt",
  "name": "Smart Bed MQTT",
  "mqttHost": "192.168.1.10",
  "excludeEntities": ["snore relief"]
}
```

That hides every control whose raw name contains "snore relief" (e.g. both a "Snore
Relief Vibration" and a "Snore Relief Tilt" control) without touching anything else on the
bed. Excluded controls are skipped entirely — no MQTT subscription, no HomeKit service —
rather than just hidden client-side.

## What shows up in HomeKit

Each physical bed becomes **one HomeKit accessory** with one service per capability, so
everything for a bed lives in a single tile group and a single set of automations:

| smartbed-mqtt entity | HomeKit service | Notes |
|---|---|---|
| Motor position (head/foot/lumbar/tilt/pillow) | **Window Covering** | 0–100% position; drag the slider or say "set Head to 50%". |
| Presets, "program preset", massage step buttons | **Switch** (momentary) | Tap to trigger; auto-resets off after ~1s. Works as both an automation trigger and target. |
| Under-bed light / safety light / snore response | **Switch** or **Lightbulb** | Lightbulb (with Brightness) if the entity supports dimming, Switch otherwise. |
| Massage intensity / timers (numeric) | **Fan** | RotationSpeed maps to the underlying 0–100 (or custom min/max) range. |
| Massage pattern / wave (multiple-choice) | **Switch** per option | e.g. "Bed Massage Pattern: Wave" — tap the one you want. |
| Temperature / Humidity / CO₂ sensors | **Temperature / Humidity / CO₂ Sensor** | Native HomeKit sensor types only; other sensor classes are logged and skipped (see Limitations). |

Because every capability is a first-class HomeKit service, they all show up individually
in **Automations** — e.g. "When I arrive home, set Head to 30% and turn on Zero-G Preset."

## Compatibility

- **Homebridge**: built and tested against the current **Homebridge 2.x stable** line
  (released May 2026), which requires **Node.js 22 or 24** — Node 18/20 are no longer
  supported by Homebridge itself. `package.json` declares
  `"homebridge": "^1.8.0 || ^2.0.0"`, so it also still runs on the older 1.8.x line if
  that's what you're on. Homebridge 2.0's main breaking change for plugin authors was
  renaming/upgrading its internal `hap-nodejs` dependency to `@homebridge/hap-nodejs`
  v2 — this plugin never imports that package directly (it only uses `homebridge`'s own
  types and the `api.hap` object handed to every platform), so it isn't affected by that
  rename either way.
- **iOS 27 / HomeKit (fall 2026)**: this plugin only uses long-standing, stable HAP
  services and characteristics (Window Covering, Switch, Lightbulb, Fan, and the standard
  sensor types), served locally the same way every Homebridge accessory is — it doesn't
  call any Apple cloud API directly. iOS 27's Home app changes announced at WWDC 2026
  (HomeKit Secure Video 4K/AI features, the new Energy tab, Thread 1.4, Siri-generated
  automations, a redesigned device-onboarding flow) are additive and camera/Matter/Thread
  focused; none of them alter how existing third-party HAP accessories like this one are
  discovered or controlled. In short: nothing here is expected to need changes for iOS 27,
  but Apple hasn't published anything suggesting otherwise either — if that changes I'd
  expect it to show up first as a Homebridge core advisory, not something this plugin
  needs to pre-empt.

## Security notes

- MQTT credentials are only ever used to authenticate to **your** broker; nothing is sent
  anywhere else.
- TLS (`mqttUseTls`) is supported, including custom CA and mutual-TLS client
  certificates, for brokers exposed beyond a trusted LAN.
- Certificate validation is only skipped if you explicitly set `mqttAllowInsecureTls`,
  and the plugin logs a clear warning every time it starts with that enabled.
- Incoming MQTT payloads are treated as untrusted: JSON parsing is wrapped in try/catch,
  oversized payloads are dropped, and `value_template` expressions are matched against a
  small fixed grammar and evaluated by hand — **the plugin never uses `eval`/`new
  Function` on anything received over MQTT.** Templates outside that grammar are skipped
  with a log warning rather than guessed at.
- A malformed or unexpected message from one entity/bed cannot crash processing for any
  other entity, bed, or Homebridge itself — every message handler is isolated in a
  try/catch.

## Limitations

- **Sensor types**: only `temperature`, `humidity`, and `carbon_dioxide` map to native
  HomeKit sensors (that's what HomeKit itself supports as first-class accessory types).
  Other sensors (e.g. VOC, generic numeric sensors) are logged as unsupported rather than
  silently dropped or mis-mapped.
- **`value_template` support**: the plugin understands the common
  `{{ value }}` / `{{ value_json.foo.bar }}` / `{{ value_json.foo | int }}` /
  `{{ value_json.foo | round(1) }}` / `{{ value_json.foo | default('') }}` forms. If
  smartbed-mqtt publishes something more exotic for a particular entity, that entity is
  skipped with a log message rather than mis-rendered — please open an issue with the log
  line if you hit this.
- **Multiple-choice massage patterns** are exposed as one momentary switch per option
  rather than a single native picker, since HomeKit has no first-class multi-choice
  control in the stock Home app.
- **Open/close-only motors**: some bed integrations (e.g. Sleeptracker) only publish
  `payload_open`/`payload_close` for a motor, with no absolute-position topic. For those,
  dragging the HomeKit slider is treated as a simple toggle around the 50% midpoint — the
  motor only ever fully opens or fully closes, it can't stop partway.
- **This plugin isn't the only thing that can be publishing Home Assistant MQTT discovery
  messages on your broker.** It subscribes to every `<prefix>/+/+/config` message, not
  only smartbed-mqtt's — so if you run other HA-discovery-based tools on the same broker
  (e.g. [ESPresense](https://espresense.com)), their devices will show up in HomeKit too,
  with whatever internal/technical names they publish. Use `excludeDevices` to filter them
  out, e.g. `"excludeDevices": ["espresense"]`.

## Troubleshooting

- **Nothing shows up**: confirm smartbed-mqtt itself is connected to the *same* broker,
  and that its own Home Assistant integration (if you have HA) already sees the bed —
  this plugin only ever reflects what smartbed-mqtt is already publishing.
- **A bed disappeared after Homebridge restarted**: it's removed automatically ~45
  seconds after startup if smartbed-mqtt hasn't re-announced it (e.g. add-on stopped,
  discovery prefix mismatch). Check `discoveryPrefix` matches your setup.
- Turn on Homebridge's debug logging (`-D`) to see every discovery/subscribe/publish the
  plugin performs.

## Development

```
npm install
npm run build
npm run lint
npm test
```

The test suite (`npm test`) covers every module — discovery/MQTT-discovery parsing,
`value_template` resolution, each HomeKit accessory handler, availability tracking, and
the cached-accessory reattach/prune lifecycle — using hand-rolled HAP/MQTT mocks so it
runs fully offline with no real broker or Homebridge instance required. CI runs lint,
build, tests, and `npm audit` on every push/PR.

### Installing directly from GitHub (before an npm release)

`npm install -g git+https://...` is unreliable for this: npm's global git-install path
symlinks the package into its own temporary cache directory rather than a stable
location, so the link can go dangling as soon as npm cleans that cache up. `npm link`
avoids that specific problem but introduces another: Homebridge's own plugin scanner
does not follow symlinks when looking for installed plugins, so a `npm link`-installed
plugin can sit there working perfectly well as far as npm is concerned while Homebridge
never even notices it exists.

Clone to a real directory and install it as an actual copy (`--install-links`, not a
symlink):

```
git clone https://github.com/solelo/homebridge-smartbed-mqtt.git
cd homebridge-smartbed-mqtt
npm install -g --install-links .
```

`dist/` is committed to this repo, so no build step is required. Restart Homebridge
after installing. To pick up a future update: `git pull` inside that cloned directory,
then re-run `npm install -g --install-links .` and restart Homebridge again.

This plugin is not affiliated with or endorsed by `richardhopton/smartbed-mqtt`; it is an
independent HomeKit bridge that consumes its standard MQTT discovery output.
