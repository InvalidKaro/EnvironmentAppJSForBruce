# RF Environment Monitor

A passive RF and Wi-Fi environment monitor for the **LILYGO T-Embed CC1101 Plus** running **Bruce 1.16.1**.

The project is designed for learning, diagnostics, lab work, and observation of radio activity on hardware and networks you are authorized to test. It receives and records activity; it does **not** transmit RF frames, replay captures, deauthenticate Wi-Fi clients, or implement signal-jamming functionality.

## Features

- Sub-GHz receive-only sampling
- Four configurable monitoring frequencies
- Wi-Fi environment scanning
- Signal metadata logging to SD card
- RF activity heatmap
- RF activity "Geiger counter"
- Device, battery, RAM, and PSRAM monitoring
- Built-in diagnostics
- Persistent display theme configuration
- Optional custom boot image

## Supported environment

| Component | Tested target |
| --- | --- |
| Device | LILYGO T-Embed CC1101 Plus |
| Runtime / firmware | Bruce 1.16.1 |
| Display layout | 320 × 170 landscape |
| Storage | SD card |
| Sub-GHz interface | Bruce `subghz` JavaScript API |
| Wi-Fi interface | Bruce `wifi` JavaScript API |

The script was written for the APIs exposed by Bruce 1.16.1. Other releases may work, but API behavior can change.

## Repository layout

```text
rf-environment-monitor/
├── src/
│   └── rf_environment_monitor.js
├── config/
│   └── environment.config.json
├── metadata/
│   └── environment.manifest.json
├── .gitignore
├── LICENSE
└── README.md
```

## Installation

1. Copy `src/rf_environment_monitor.js` to the location from which your Bruce installation loads JavaScript applications.
2. Copy `config/environment.config.json` to the root of the device SD card as:

```text
/environment.config.json
```

3. Optionally place a 320 × 170 JPEG boot image on the SD card using one of these names:

```text
/environment.bootscreen.jpg
/environment.bootscreen.jpeg
/bootscreen.jpg
/bootscreen.jpeg
```

4. Start `rf_environment_monitor.js` from Bruce.

The application creates or appends to the following SD-card log file when logging is used:

```text
/environment.log
```

## Configuration

The current configuration is intentionally small:

```json
{
  "theme": "PAPER",
  "version": "3.6.8"
}
```

Supported themes:

- `ICE`
- `PAPER`
- `LIME`
- `VIOLET`

Theme changes can also be made from the CONFIG page. The application writes the selected theme back to `/environment.config.json`.

## Controls

The exact physical input mapping is handled by Bruce's `keyboard` module.

| Input | Action |
| --- | --- |
| Next / right | Move to the next item or option |
| Previous / left | Move to the previous item or option |
| Select | Open, run, start/stop, or save the selected action |
| Back / Esc | Return to the parent page; from the dashboard, exit |

Back navigation has priority over active sampling tasks so the UI remains responsive while the passive monitors are running. All action inputs are edge-triggered; held-button state is used only for release/debounce detection, preventing Back/Esc from being interpreted as Next, Previous, or Select on active subpages.

## Pages

### Dashboard

Provides access to all modules:

- SUB-GHZ
- WI-FI
- LOGGER
- HEATMAP
- GEIGER
- SYSTEM
- INFO
- DIAG
- CONFIG

### Sub-GHz

Samples the currently selected frequency through Bruce's `subghz.readRaw()` API.

Default frequencies:

```text
315.00 MHz
433.92 MHz
868.35 MHz
915.00 MHz
```

These defaults span common ISM/SRD regions, but not every frequency is legal or relevant in every country. Receive regulations, device restrictions, and local spectrum rules still apply.

### Wi-Fi

Uses Bruce's Wi-Fi scan API to list nearby networks and basic metadata. The project does not connect to those networks and does not send management attacks.

### Logger

Records passive Sub-GHz activity metadata to:

```text
/environment.log
```

Entries are JSON Lines, making the file easy to parse with shell tools, Python, Node.js, or data-analysis software.

Example:

```json
{"time_ms":123456,"time":"00:02:03","frequency_mhz":433.92,"rssi":null,"signal":true,"raw_length":128,"pattern":"pulse"}
```

`rssi` is deliberately `null`. In Bruce 1.16.1, the JavaScript `subghz.read()` / `subghz.readRaw()` interface does not expose a CC1101 RSSI getter used by this project. The logger therefore records real receive/activity metadata without inventing a signal-strength value.

### Heatmap

Cycles through the configured frequencies and visualizes recent receive activity. This is an activity indicator, not a calibrated spectrum analyzer.

### Geiger

Turns passive receive events into a simple visual/audio activity indicator. It is useful for quickly noticing bursts of activity while testing your own equipment.

### System

Displays battery and memory information exposed by the Bruce device API.

### Diagnostics

Checks the main runtime dependencies:

- Bruce runtime information
- Display access
- CC1101 frequency selection
- Wi-Fi scan API availability
- SD logging path
- RAM and PSRAM reporting

## Log format

The file `/environment.log` can contain several JSON-Line record types.

Passive signal records include:

```json
{
  "time_ms": 123456,
  "time": "00:02:03",
  "frequency_mhz": 433.92,
  "rssi": null,
  "signal": true,
  "raw_length": 128,
  "pattern": "pulse"
}
```

Wi-Fi information records use:

```json
{
  "type": "wifi_info",
  "time_ms": 123456,
  "ssid": "Example",
  "mac": "AA:BB:CC:DD:EE:FF",
  "encryption": "WPA2"
}
```

RF status records use:

```json
{
  "type": "rf_status",
  "time_ms": 123456,
  "frequency_mhz": 433.92,
  "activity_percent": 42,
  "raw_length": 128,
  "pattern": "pulse"
}
```

Treat log files as potentially sensitive. Nearby SSIDs, MAC addresses, timestamps, and RF observations can reveal information about a physical environment. Review captures before publishing them.

## Design notes

### Receive-only behavior

All Sub-GHz observations go through the receive path:

```javascript
subghz.setFrequency(freq);
result.raw = subghz.readRaw(timeoutSeconds);
```

There is no transmit, replay, deauthentication, or jammer implementation in this repository.

### Error handling

Hardware-facing calls are wrapped in `try` / `catch` blocks so unavailable APIs or transient device errors do not immediately terminate the UI.

### Storage

Configuration and logging use the Bruce `storage` module and explicit SD-card paths:

```javascript
var LOG_PATH = { fs: "sd", path: "/environment.log" };
var CONFIG_PATH = { fs: "sd", path: "/environment.config.json" };
```

### Runtime model

Bruce JavaScript applications run in the device runtime rather than a browser or Node.js environment. Because of that, browser APIs, Node package management, Web Workers, and standard Node.js filesystem APIs are not assumed by this project.

## Development

The source intentionally stays dependency-free because the target runtime provides its own modules:

```javascript
var display = require("display");
var keyboard = require("keyboard");
var subghz = require("subghz");
var wifi = require("wifi");
var storage = require("storage");
var device = require("device");
var audio = require("audio");
```

For a contribution, keep hardware access isolated behind existing helper functions where possible, preserve Back/Esc priority, and avoid adding active RF or network-interference behavior.

A useful local syntax check is:

```bash
node --check src/rf_environment_monitor.js
```

This validates JavaScript syntax only. It cannot validate Bruce-specific runtime APIs on a desktop machine.

## Safety and legal use

Use the project only where you are authorized to observe or test equipment and networks.

This repository is intentionally limited to passive observation and diagnostics. Spectrum use, privacy requirements, radio-device restrictions, and rules around collection of network identifiers vary by jurisdiction.

Do not assume that owning a radio device automatically authorizes every form of RF operation.

## Privacy

Wi-Fi scans can expose SSIDs, BSSIDs/MAC addresses, and encryption metadata. RF logs can also disclose timing and usage patterns.

Before sharing logs publicly:

- remove identifiers you do not need,
- avoid publishing third-party network information,
- verify that the data came from an environment you were authorized to test.

## Contributing

Issues and pull requests are welcome for:

- compatibility fixes,
- UI improvements,
- receive-only diagnostics,
- logging improvements,
- documentation,
- accessibility,
- performance and stability.

Changes that add intentional interference, jamming, unauthorized access, deauthentication, credential capture, or replay attacks are outside the scope of this project.

## License

Released under the [MIT License](LICENSE).

You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software under the conditions of the license.
