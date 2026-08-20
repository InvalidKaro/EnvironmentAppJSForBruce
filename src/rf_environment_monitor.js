/*
 * RF Environment Monitor v3.6.8
 * Target: LILYGO T-Embed CC1101 Plus
 * Runtime: Bruce 1.16.1
 *
 * Passive RF and local network observation utility:
 * - Sub-GHz receiver
 * - Wi-Fi environment browser
 * - Signal logger to SD
 * - RF activity heatmap
 * - RF Geiger counter
 * - Mini system monitor
 * - Diagnostics
 *
 * This project does not transmit RF frames, replay captures, deauthenticate
 * Wi-Fi clients, or implement signal-jamming functionality.
 *
 * IMPORTANT:
 * Bruce 1.16.1 JS subghz.read()/readRaw() do not expose CC1101 RSSI.
 * Logger therefore writes rssi:null and stores real receive/activity metadata.
 */

var display = require("display");
var keyboard = require("keyboard");
var subghz = require("subghz");
var wifi = require("wifi");
var storage = require("storage");
var device = require("device");
var audio = require("audio");

var APP_NAME = "RF Environment Monitor";
var APP_VERSION = "3.6.8";
var BUILD_DATE = "2026-08-20";
var TARGET_BRUCE = "1.16.1";

var BOOT_DURATION_MS = 1200;
var ACTIVE_RX_TIMEOUT = 0.12;
var MANUAL_RX_TIMEOUT = 1.0;

var LOG_PATH = { fs: "sd", path: "/environment.log" };
var CONFIG_PATH = { fs: "sd", path: "/environment.config.json" };

var BOOT_IMAGES = [
  { fs: "sd", path: "/environment.bootscreen.jpg" },
  { fs: "sd", path: "/environment.bootscreen.jpeg" },
  { fs: "sd", path: "/bootscreen.jpg" },
  { fs: "sd", path: "/bootscreen.jpeg" }
];

var THEME_NAMES = [
  "ICE",
  "PAPER",
  "LIME",
  "VIOLET"
];



var themeIndex = 1;
var configDirty = false;
var configMessage = "";

var UI_WIDTH = 320;
var UI_HEIGHT = 170;
var UI_MARGIN_X = 8;
var UI_MARGIN_Y = 6;

var PAGE_CONTENT_X = 10;
var PAGE_CONTENT_RIGHT = 310;
var PAGE_CONTENT_W = 300;
var PAGE_DASHBOARD = 0;
var PAGE_SUBGHZ = 1;
var PAGE_WIFI = 2;
var PAGE_LOGGER = 3;
var PAGE_HEATMAP = 4;
var PAGE_GEIGER = 5;
var PAGE_SYSTEM = 6;
var PAGE_INFO = 7;
var PAGE_DIAG = 8;
var PAGE_CONFIG = 9;

var PAGE_WIFI_DETAIL = 10;
var PAGE_RF_DETAIL = 11;

var MAX_WIFI_NETWORKS = 32;

var WIFI_DETAIL_ACTIONS = [
  "RESCAN",
  "LOG INFO"
];

var RF_DETAIL_ACTIONS = [
  "SAMPLE",
  "LOGGER",
  "HEATMAP",
  "GEIGER",
  "LOG STATUS"
];


var page = PAGE_DASHBOARD;
var running = true;

var dashboardItems = [
  "SUB-GHZ",
  "WI-FI",
  "LOGGER",
  "HEATMAP",
  "GEIGER",
  "SYSTEM",
  "INFO",
  "DIAG",
  "CONFIG"
];

var dashboardIndex = 0;
var dashboardScroll = 0;

var frequencies = [315.0, 433.92, 868.35, 915.0];
var frequencyIndex = 1;

var wifiCursor = 0;
var wifiScroll = 0;
var infoScroll = 0;

var wifiDetailAction = 0;
var rfDetailAction = 0;
var wifiDetailMessage = "";
var rfDetailMessage = "";

var diagScroll = 0;

var subState = {
  scans: 0,
  hits: 0,
  lastHit: false,
  lastRawLength: 0,
  lastRawPreview: "",
  lastPattern: "none",
  history: []
};

var wifiState = {
  scans: 0,
  networks: [],
  openCount: 0,
  protectedCount: 0,
  lastError: ""
};

var loggerState = {
  active: false,
  samples: 0,
  signals: 0,
  writeErrors: 0,
  lastPattern: "none",
  lastFrequency: 0,
  lastTimestamp: 0,
  lastRawLength: 0,
  lastWriteOk: true
};

var heatmapState = {
  active: false,
  nextIndex: 0,
  scans: [0, 0, 0, 0],
  hits: [0, 0, 0, 0],
  recent: [
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0]
  ]
};

var geigerState = {
  active: false,
  samples: 0,
  hits: 0,
  recentHits: [],
  lastHitAt: 0,
  clicksEnabled: true
};

var systemState = {
  battery: -1,
  name: "unknown",
  board: "unknown",
  model: "unknown",
  ramFree: 0,
  ramSize: 0,
  ramMinFree: 0,
  ramLargest: 0,
  psramFree: 0,
  psramSize: 0,
  refreshes: 0,
  lastError: ""
};



var headerBatteryState = {
  percent: -1,
  lastReadAt: 0
};

function getHeaderBatteryPercent() {
  var currentTime = now();

  if (
    headerBatteryState.percent < 0 ||
    currentTime - headerBatteryState.lastReadAt > 15000
  ) {
    try {
      headerBatteryState.percent = device.getBatteryCharge();
      headerBatteryState.lastReadAt = currentTime;
    } catch (err25) {
      headerBatteryState.percent = -1;
    }
  }

  return headerBatteryState.percent;
}

var diagState = {
  runs: 0,
  lines: []
};

var colors = {};

function applyTheme(index) {
  var bgRgb;
  var surfaceRgb;
  var surfaceAltRgb;
  var accentRgb;
  var accentDarkRgb;
  var titleRgb;
  var bodyRgb;
  var mutedRgb;
  var borderRgb;
  var faintRgb;
  var inverseRgb;

  if (index < 0) {
    index = THEME_NAMES.length - 1;
  }

  if (index >= THEME_NAMES.length) {
    index = 0;
  }

  themeIndex = index;

  if (THEME_NAMES[index] === "ICE") {
    bgRgb = [181, 230, 235];
    surfaceRgb = [210, 241, 244];
    surfaceAltRgb = [158, 215, 222];
    accentRgb = [20, 132, 154];
    accentDarkRgb = [12, 88, 104];
    titleRgb = [7, 42, 50];
    bodyRgb = [24, 68, 77];
    mutedRgb = [62, 105, 113];
    borderRgb = [25, 72, 82];
    faintRgb = [145, 201, 208];
    inverseRgb = [242, 253, 254];
  } else if (THEME_NAMES[index] === "LIME") {
    bgRgb = [178, 228, 133];
    surfaceRgb = [208, 242, 176];
    surfaceAltRgb = [151, 207, 103];
    accentRgb = [49, 137, 43];
    accentDarkRgb = [26, 92, 24];
    titleRgb = [17, 51, 15];
    bodyRgb = [37, 75, 32];
    mutedRgb = [74, 109, 66];
    borderRgb = [39, 82, 35];
    faintRgb = [147, 195, 108];
    inverseRgb = [247, 255, 240];
  } else if (THEME_NAMES[index] === "VIOLET") {
    bgRgb = [205, 171, 226];
    surfaceRgb = [230, 207, 241];
    surfaceAltRgb = [181, 137, 210];
    accentRgb = [121, 55, 169];
    accentDarkRgb = [80, 35, 116];
    titleRgb = [48, 21, 63];
    bodyRgb = [75, 48, 88];
    mutedRgb = [109, 81, 121];
    borderRgb = [69, 43, 82];
    faintRgb = [172, 139, 194];
    inverseRgb = [253, 246, 255];
  } else {
    /* PAPER */
    bgRgb = [236, 231, 216];
    surfaceRgb = [251, 247, 235];
    surfaceAltRgb = [222, 214, 194];
    accentRgb = [241, 103, 12];
    accentDarkRgb = [181, 67, 4];
    titleRgb = [25, 23, 20];
    bodyRgb = [55, 50, 43];
    mutedRgb = [101, 92, 78];
    borderRgb = [44, 39, 32];
    faintRgb = [207, 198, 178];
    inverseRgb = [255, 250, 237];
  }

  colors = {
    bg: display.color(bgRgb[0], bgRgb[1], bgRgb[2]),
    panel: display.color(surfaceRgb[0], surfaceRgb[1], surfaceRgb[2]),
    panel2: display.color(surfaceAltRgb[0], surfaceAltRgb[1], surfaceAltRgb[2]),

    /* semantic text colors */
    title: display.color(titleRgb[0], titleRgb[1], titleRgb[2]),
    text: display.color(bodyRgb[0], bodyRgb[1], bodyRgb[2]),
    muted: display.color(mutedRgb[0], mutedRgb[1], mutedRgb[2]),
    inverseText: display.color(inverseRgb[0], inverseRgb[1], inverseRgb[2]),

    accent: display.color(accentRgb[0], accentRgb[1], accentRgb[2]),
    accent2: display.color(accentDarkRgb[0], accentDarkRgb[1], accentDarkRgb[2]),
    warn: display.color(accentDarkRgb[0], accentDarkRgb[1], accentDarkRgb[2]),
    bad: display.color(176, 45, 34),

    border: display.color(borderRgb[0], borderRgb[1], borderRgb[2]),
    pixel: display.color(titleRgb[0], titleRgb[1], titleRgb[2]),
    shadow: display.color(faintRgb[0], faintRgb[1], faintRgb[2]),
    highlight: display.color(surfaceRgb[0], surfaceRgb[1], surfaceRgb[2]),
    selectText: display.color(inverseRgb[0], inverseRgb[1], inverseRgb[2])
  };
}

function themeHeading(textValue) {
  textValue = safeString(textValue);

  if (THEME_NAMES[themeIndex] === "ICE") {
    return "[" + textValue + "]";
  }

  if (THEME_NAMES[themeIndex] === "LIME") {
    return textValue.toLowerCase();
  }

  if (THEME_NAMES[themeIndex] === "VIOLET") {
    return "~ " + textValue + " ~";
  }

  return textValue;
}

function themeStatus(textValue) {
  textValue = safeString(textValue);

  if (THEME_NAMES[themeIndex] === "ICE") {
    return "> " + textValue;
  }

  if (THEME_NAMES[themeIndex] === "LIME") {
    return textValue.toLowerCase();
  }

  if (THEME_NAMES[themeIndex] === "VIOLET") {
    return textValue + " *";
  }

  return textValue;
}

function getCategoryBg(index) {
  return colors.bg;
}

function getCategoryAccent(index) {
  return colors.accent;
}

function drawCategoryBackground(index) {
  var w = screenW();
  var h = screenH();

  display.fill(colors.bg);

  /* prototype #2: dark console chrome */
  display.drawFillRect(0, 0, w, 30, colors.title);
  display.drawFillRect(0, h - 24, w, 24, colors.title);

  /* theme accent edge */
  display.drawFillRect(0, 0, 4, h, colors.accent);
  display.drawFillRect(w - 4, 0, 4, h, colors.accent);
  display.drawFillRect(0, 28, w, 3, colors.accent);

  /* body inset */
  display.drawRoundRect(6, 34, w - 12, h - 63, 6, colors.border);
}

function getPageCategoryIndex() {
  if (page === PAGE_SUBGHZ) return 0;
  if (page === PAGE_WIFI) return 1;
  if (page === PAGE_LOGGER) return 2;
  if (page === PAGE_HEATMAP) return 3;
  if (page === PAGE_GEIGER) return 4;
  if (page === PAGE_SYSTEM) return 5;
  if (page === PAGE_INFO) return 6;
  if (page === PAGE_DIAG) return 7;
  if (page === PAGE_CONFIG) return 8;
  return dashboardIndex;
}

function themeNameToIndex(name) {
  var i;

  name = safeString(name).toUpperCase();

  for (i = 0; i < THEME_NAMES.length; i++) {
    if (THEME_NAMES[i] === name) {
      return i;
    }
  }

  return 1;
}

function readThemeFromConfig(raw) {
  var value = safeString(raw).toUpperCase();

  if (value.indexOf("ICE") >= 0) return 0;
  if (value.indexOf("PAPER") >= 0) return 1;
  if (value.indexOf("LIME") >= 0) return 2;
  if (value.indexOf("VIOLET") >= 0) return 3;

  return 1;
}

function loadConfig() {
  var raw;
  var loadedIndex;

  try {
    raw = storage.read(CONFIG_PATH);

    if (!raw) {
      applyTheme(1);
      configMessage = "default PAPER";
      return;
    }

    loadedIndex = readThemeFromConfig(raw);
    applyTheme(loadedIndex);
    configMessage = "loaded " + THEME_NAMES[loadedIndex];
  } catch (err18) {
    applyTheme(1);
    configMessage = "default PAPER";
  }
}

function saveConfig() {
  var payload;
  var ok;

  payload =
    '{"theme":"' +
    THEME_NAMES[themeIndex] +
    '","version":"' +
    APP_VERSION +
    '"}';

  try {
    ok = storage.write(CONFIG_PATH, payload, "write");
    configDirty = false;
    configMessage = ok
      ? "saved " + THEME_NAMES[themeIndex]
      : "write failed";
    return ok ? true : false;
  } catch (err19) {
    configMessage = "write failed";
    return false;
  }
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function truncate(text, maxLength) {
  text = safeString(text);
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.substring(0, maxLength);
  }
  return text.substring(0, maxLength - 3) + "...";
}

function clamp(value, minValue, maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function screenW() {
  return display.width();
}

function screenH() {
  return display.height();
}

function clearScreen() {
  drawCategoryBackground(getPageCategoryIndex());
}

function formatBytes(value) {
  if (!value || value < 0) {
    return "0";
  }
  if (value >= 1048576) {
    return (value / 1048576).toFixed(1) + "M";
  }
  if (value >= 1024) {
    return Math.round(value / 1024) + "K";
  }
  return value + "B";
}

function formatTimeMs(timestamp) {
  var totalSeconds;
  var seconds;
  var minutes;
  var hours;

  if (!timestamp || timestamp < 0) {
    return "0:00:00";
  }

  totalSeconds = Math.floor(timestamp / 1000);
  seconds = totalSeconds % 60;
  minutes = Math.floor(totalSeconds / 60) % 60;
  hours = Math.floor(totalSeconds / 3600) % 24;

  return (
    (hours < 10 ? "0" : "") + hours + ":" +
    (minutes < 10 ? "0" : "") + minutes + ":" +
    (seconds < 10 ? "0" : "") + seconds
  );
}

function simplePatternHash(raw) {
  var hash = 5381;
  var i;

  raw = safeString(raw);

  for (i = 0; i < raw.length; i++) {
    hash = ((hash * 33) + raw.charCodeAt(i)) & 0x7fffffff;
  }

  return "P" + to_hex_string(hash & 0xffff);
}

function classifyPattern(raw) {
  var length = safeString(raw).length;
  var size;

  if (length === 0) {
    return "none";
  }

  if (length < 40) {
    size = "S";
  } else if (length < 160) {
    size = "M";
  } else {
    size = "L";
  }

  return size + "-" + simplePatternHash(raw);
}

function currentPageIconIndex() {
  if (page === PAGE_SUBGHZ || page === PAGE_RF_DETAIL) return 0;
  if (page === PAGE_WIFI || page === PAGE_WIFI_DETAIL) return 1;
  if (page === PAGE_LOGGER) return 2;
  if (page === PAGE_HEATMAP) return 3;
  if (page === PAGE_GEIGER) return 4;
  if (page === PAGE_SYSTEM) return 5;
  if (page === PAGE_INFO) return 6;
  if (page === PAGE_DIAG) return 7;
  if (page === PAGE_CONFIG) return 8;
  return -1;
}

function drawHeader(title) {
  var w = screenW();
  var battery = getHeaderBatteryPercent();
  var fillWidth = 0;
  var iconIndex = currentPageIconIndex();

  display.setTextSize(1);
  display.setTextAlign("left", "top");

  if (page !== PAGE_DASHBOARD && iconIndex >= 0) {
    drawMinimalIcon(iconIndex, 8, 6, colors.selectText);
  }

  display.setTextSize(2);
  display.setTextColor(colors.selectText);
  display.drawText(
    themeHeading(title),
    page === PAGE_DASHBOARD ? 14 : 32,
    7
  );

  display.setTextSize(1);
  display.setTextAlign("right", "top");
  display.setTextColor(colors.selectText);

  if (battery >= 0) {
    display.drawText(battery + "%", w - 43, 11);
  } else {
    display.drawText("--%", w - 43, 11);
  }

  display.drawRect(w - 36, 8, 22, 10, colors.selectText);
  display.drawFillRect(w - 13, 11, 2, 4, colors.selectText);

  if (battery >= 0) {
    fillWidth = Math.floor(
      clamp(battery, 0, 100) * 18 / 100
    );

    if (fillWidth > 0) {
      display.drawFillRect(
        w - 34,
        10,
        fillWidth,
        6,
        battery <= 20 ? colors.bad : colors.accent
      );
    }
  }

  display.setTextAlign("left", "top");
}

function drawFooter(leftText, centerText, rightText) {
  var w = screenW();
  var h = screenH();
  var y = h - 20;

  display.setTextSize(1);

  display.setTextAlign("left", "top");
  display.setTextColor(colors.selectText);
  display.drawText(leftText, 12, y + 5);

  display.setTextAlign("center", "top");
  display.setTextColor(colors.selectText);
  display.drawText(centerText, Math.floor(w / 2), y + 5);

  display.setTextAlign("right", "top");
  display.drawText(rightText, w - 12, y + 5);
  display.setTextAlign("left", "top");
}

function drawPanel(x, y, w, h, selected) {
  display.drawFillRoundRect(
    x,
    y,
    w,
    h,
    5,
    selected ? colors.accent : colors.panel
  );

  display.drawRoundRect(
    x,
    y,
    w,
    h,
    5,
    selected ? colors.accent2 : colors.border
  );

  if (!selected) {
    display.drawLine(x + 8, y + h - 4, x + w - 8, y + h - 4, colors.shadow);
  }
}


function drawPixelIcon(type, x, y, selected) {
  var c = selected ? colors.selectText : colors.text;
  var d = selected ? colors.selectText : colors.muted;

  if (type === "SUB-GHZ") {
    display.drawFillRect(x + 8, y + 2, 2, 13, c);
    display.drawFillRect(x + 6, y + 3, 6, 2, c);
    display.drawFillRect(x + 3, y + 5, 2, 7, d);
    display.drawFillRect(x + 13, y + 5, 2, 7, d);
    display.drawFillRect(x + 7, y + 15, 4, 2, c);
    return;
  }

  if (type === "WI-FI") {
    display.drawLine(x + 2, y + 5, x + 5, y + 2, c);
    display.drawLine(x + 5, y + 2, x + 12, y + 2, c);
    display.drawLine(x + 12, y + 2, x + 15, y + 5, c);
    display.drawLine(x + 5, y + 8, x + 7, y + 6, c);
    display.drawLine(x + 7, y + 6, x + 10, y + 6, c);
    display.drawLine(x + 10, y + 6, x + 12, y + 8, c);
    display.drawFillRect(x + 8, y + 11, 2, 2, c);
    return;
  }

  if (type === "LOGGER") {
    display.drawRect(x + 3, y + 2, 11, 14, c);
    display.drawFillRect(x + 6, y + 5, 5, 2, c);
    display.drawFillRect(x + 6, y + 9, 5, 2, c);
    display.drawFillRect(x + 6, y + 13, 4, 2, c);
    return;
  }

  if (type === "HEATMAP") {
    display.drawFillRect(x + 2, y + 2, 5, 5, c);
    display.drawFillRect(x + 10, y + 2, 5, 5, d);
    display.drawFillRect(x + 2, y + 10, 5, 5, d);
    display.drawFillRect(x + 10, y + 10, 5, 5, c);
    return;
  }

  if (type === "GEIGER") {
    display.drawFillRect(x + 7, y + 7, 4, 4, c);
    display.drawLine(x + 9, y + 5, x + 9, y + 1, d);
    display.drawLine(x + 6, y + 7, x + 2, y + 4, d);
    display.drawLine(x + 12, y + 7, x + 16, y + 4, d);
    display.drawLine(x + 6, y + 12, x + 3, y + 16, d);
    display.drawLine(x + 12, y + 12, x + 15, y + 16, d);
    return;
  }

  if (type === "SYSTEM") {
    display.drawRect(x + 2, y + 4, 13, 10, c);
    display.drawFillRect(x + 15, y + 7, 2, 4, c);
    display.drawFillRect(x + 4, y + 6, 6, 6, d);
    return;
  }

  if (type === "INFO") {
    display.drawFillRect(x + 8, y + 2, 2, 2, c);
    display.drawFillRect(x + 8, y + 6, 2, 9, c);
    display.drawFillRect(x + 6, y + 6, 2, 2, d);
    return;
  }

  if (type === "DIAG") {
    display.drawRect(x + 4, y + 4, 9, 9, c);
    display.drawLine(x + 8, y + 1, x + 8, y + 4, d);
    display.drawLine(x + 8, y + 13, x + 8, y + 16, d);
    display.drawLine(x + 1, y + 8, x + 4, y + 8, d);
    display.drawLine(x + 13, y + 8, x + 16, y + 8, d);
    return;
  }

  if (type === "CONFIG") {
    display.drawRect(x + 3, y + 3, 11, 11, c);
    display.drawFillRect(x + 7, y + 1, 3, 3, d);
    display.drawFillRect(x + 7, y + 14, 3, 3, d);
    display.drawFillRect(x + 1, y + 7, 3, 3, d);
    display.drawFillRect(x + 14, y + 7, 3, 3, d);
    display.drawFillRect(x + 7, y + 7, 3, 3, c);
    return;
  }
}

function drawSelectionArrow(y) {
  display.drawFillRect(12, y + 3, 3, 7, colors.text);
  display.drawFillRect(15, y + 5, 3, 3, colors.text);
}

function drawRetroDivider(y) {
  var x;
  for (x = 8; x < screenW() - 8; x += 8) {
    display.drawFillRect(x, y, 4, 1, colors.shadow);
  }
}

function drawProgressBar(x, y, w, h, percent) {
  var fillW = Math.floor((clamp(percent, 0, 100) / 100) * w);

  display.drawFillRect(x, y, w, h, colors.panel);
  display.drawRect(x, y, w, h, colors.border);

  if (fillW > 2) {
    display.drawFillRect(x + 1, y + 1, fillW - 2, h - 2, colors.accent);
  }
}

function showFallbackBootScreen() {
  var w = screenW();
  var h = screenH();
  var cx = Math.floor(w / 2);

  clearScreen();
  display.drawRoundRect(5, 5, w - 10, h - 10, 9, colors.accent2);

  display.drawLine(cx, 15, cx - 21, 31, colors.accent2);
  display.drawLine(cx - 21, 31, cx - 29, 53, colors.accent2);
  display.drawLine(cx - 29, 53, cx - 19, 72, colors.accent2);
  display.drawLine(cx - 19, 72, cx, 81, colors.accent2);
  display.drawLine(cx, 81, cx + 19, 72, colors.accent2);
  display.drawLine(cx + 19, 72, cx + 29, 53, colors.accent2);
  display.drawLine(cx + 29, 53, cx + 21, 31, colors.accent2);
  display.drawLine(cx + 21, 31, cx, 15, colors.accent2);

  display.drawFillRect(cx - 13, 48, 9, 4, colors.accent);
  display.drawFillRect(cx + 4, 48, 9, 4, colors.accent);

  display.drawRoundRect(cx - 24, 64, 48, 18, 3, colors.accent2);
  display.setTextAlign("center", "top");
  display.setTextSize(1);
  display.setTextColor(colors.accent);
  display.drawText("</>", cx, 68);

  display.setTextSize(2);
  display.drawText("RF Environment", cx, 91);

  display.setTextSize(1);
  display.setTextColor(colors.accent2);
  display.drawText("RF TOOLBOX", cx, 119);
  display.drawText("v" + APP_VERSION, cx, 137);
  display.setTextAlign("left", "top");
}

function showBootScreen() {
  var i;
  var rendered = false;

  for (i = 0; i < BOOT_IMAGES.length; i++) {
    try {
      display.drawJpg(BOOT_IMAGES[i], 0, 0, false);
      rendered = true;
      break;
    } catch (err1) {
      rendered = false;
    }
  }

  if (!rendered) {
    showFallbackBootScreen();
  }

  delay(BOOT_DURATION_MS);
}

/* ---------- RF receive core ---------- */

function pushSubHistory(hit) {
  subState.history.push(hit ? 1 : 0);

  while (subState.history.length > 18) {
    subState.history.shift();
  }
}

function getActivityPercent() {
  var i;
  var sum = 0;

  if (subState.history.length === 0) {
    return 0;
  }

  for (i = 0; i < subState.history.length; i++) {
    sum += subState.history[i];
  }

  return Math.round((sum / subState.history.length) * 100);
}

function receiveAtFrequency(freq, timeoutSeconds) {
  var result = {
    ok: false,
    hit: false,
    raw: "",
    rawLength: 0,
    pattern: "none",
    frequency: freq,
    timestamp: now()
  };

  try {
    subghz.setFrequency(freq);
    result.raw = subghz.readRaw(timeoutSeconds);

    if (result.raw === null || result.raw === undefined) {
      result.raw = "";
    }

    result.raw = String(result.raw);
    result.rawLength = result.raw.length;
    result.hit = result.rawLength > 0;
    result.pattern = classifyPattern(result.raw);
    result.ok = true;
  } catch (err2) {
    result.ok = false;
  }

  return result;
}

function performSubGhzScan() {
  var result = receiveAtFrequency(frequencies[frequencyIndex], MANUAL_RX_TIMEOUT);

  subState.scans++;
  subState.lastHit = result.hit;
  subState.lastRawLength = result.rawLength;
  subState.lastRawPreview = truncate(result.raw, 45);
  subState.lastPattern = result.pattern;

  if (result.hit) {
    subState.hits++;
  }

  pushSubHistory(result.hit);
}

function setFrequencyIndex(index) {
  if (index < 0) {
    index = frequencies.length - 1;
  }

  if (index >= frequencies.length) {
    index = 0;
  }

  frequencyIndex = index;

  try {
    subghz.setFrequency(frequencies[frequencyIndex]);
  } catch (err3) {
    subState.lastRawPreview = "SET ERR";
  }
}

/* ---------- Wi-Fi ---------- */

function getWifiOpenCount(networks) {
  var i;
  var count = 0;
  var enc;

  for (i = 0; i < networks.length; i++) {
    enc = safeString(networks[i].encryptionType);

    if (enc === "OPEN" || enc === "NONE") {
      count++;
    }
  }

  return count;
}

function performWifiScan() {
  var networks;

  wifiState.scans++;
  wifiState.lastError = "";

  try {
    networks = wifi.scan();

    if (!networks) {
      networks = [];
    }

    if (networks.length > MAX_WIFI_NETWORKS) {
      wifiState.networks = networks.slice(0, MAX_WIFI_NETWORKS);
    } else {
      wifiState.networks = networks;
    }

    wifiState.openCount = getWifiOpenCount(wifiState.networks);
    wifiState.protectedCount =
      wifiState.networks.length - wifiState.openCount;

    wifiCursor = 0;
    wifiScroll = 0;
  } catch (err4) {
    wifiState.networks = [];
    wifiState.openCount = 0;
    wifiState.protectedCount = 0;
    wifiState.lastError = safeString(err4);
    wifiCursor = 0;
    wifiScroll = 0;
  }
}

/* ---------- Passive detail actions ---------- */

function appendEnvironmentLine(line) {
  try {
    return storage.write(
      LOG_PATH,
      line + "\n",
      "append"
    );
  } catch (err26) {
    return false;
  }
}

function logSelectedWifiInfo() {
  var network;

  if (
    wifiState.networks.length === 0 ||
    wifiCursor < 0 ||
    wifiCursor >= wifiState.networks.length
  ) {
    wifiDetailMessage = "no network selected";
    return;
  }

  network = wifiState.networks[wifiCursor];

  if (
    appendEnvironmentLine(
      '{"type":"wifi_info","time_ms":' +
      now() +
      ',"ssid":"' +
      escapeJsonText(network.SSID || "") +
      '","mac":"' +
      escapeJsonText(network.MAC || "") +
      '","encryption":"' +
      escapeJsonText(network.encryptionType || "") +
      '"}'
    )
  ) {
    wifiDetailMessage = "logged";
  } else {
    wifiDetailMessage = "log failed";
  }
}

function logRfStatus() {
  if (
    appendEnvironmentLine(
      '{"type":"rf_status","time_ms":' +
      now() +
      ',"frequency_mhz":' +
      frequencies[frequencyIndex].toFixed(2) +
      ',"activity_percent":' +
      getActivityPercent() +
      ',"raw_length":' +
      subState.lastRawLength +
      ',"pattern":"' +
      escapeJsonText(subState.lastPattern) +
      '"}'
    )
  ) {
    rfDetailMessage = "logged";
  } else {
    rfDetailMessage = "log failed";
  }
}

function moveWifiDetailAction(delta) {
  wifiDetailAction += delta;

  if (wifiDetailAction < 0) {
    wifiDetailAction = WIFI_DETAIL_ACTIONS.length - 1;
  }

  if (wifiDetailAction >= WIFI_DETAIL_ACTIONS.length) {
    wifiDetailAction = 0;
  }
}

function moveRfDetailAction(delta) {
  rfDetailAction += delta;

  if (rfDetailAction < 0) {
    rfDetailAction = RF_DETAIL_ACTIONS.length - 1;
  }

  if (rfDetailAction >= RF_DETAIL_ACTIONS.length) {
    rfDetailAction = 0;
  }
}

function runWifiDetailAction() {
  if (wifiDetailAction === 0) {
    performWifiScan();
    wifiDetailMessage = "scan refreshed";
    return;
  }

  logSelectedWifiInfo();
}

function runRfDetailAction() {
  if (rfDetailAction === 0) {
    performSubGhzScan();
    rfDetailMessage =
      subState.lastHit ? "signal captured" : "no signal";
    return;
  }

  if (rfDetailAction === 1) {
    page = PAGE_LOGGER;
    return;
  }

  if (rfDetailAction === 2) {
    page = PAGE_HEATMAP;
    return;
  }

  if (rfDetailAction === 3) {
    page = PAGE_GEIGER;
    return;
  }

  logRfStatus();
}


/* ---------- Logger ---------- */

function ensureLoggerDirectory() {
  /*
   * environment.log is stored directly in the SD card root.
   * No application directory is required.
   */
  return true;
}

function escapeJsonText(text) {
  text = safeString(text);
  text = text.replace(/\\/g, "\\\\");
  text = text.replace(/"/g, '\\"');
  text = text.replace(/\r/g, "\\r");
  text = text.replace(/\n/g, "\\n");
  return text;
}

function writeSignalLog(result) {
  var line;
  var ok;

  /*
   * RSSI is intentionally null because Bruce 1.16.1's JS subghz API
   * does not expose a CC1101 RSSI getter.
   */
  line =
    '{"time_ms":' + result.timestamp +
    ',"time":"' + formatTimeMs(result.timestamp) + '"' +
    ',"frequency_mhz":' + result.frequency.toFixed(2) +
    ',"rssi":null' +
    ',"signal":' + (result.hit ? "true" : "false") +
    ',"raw_length":' + result.rawLength +
    ',"pattern":"' + escapeJsonText(result.pattern) + '"' +
    '}\n';

  try {
    ok = storage.write(LOG_PATH, line, "append", "end");
    loggerState.lastWriteOk = ok ? true : false;

    if (!ok) {
      loggerState.writeErrors++;
    }
  } catch (err6) {
    loggerState.lastWriteOk = false;
    loggerState.writeErrors++;
  }
}

function loggerSample() {
  var result;

  ensureLoggerDirectory();

  result = receiveAtFrequency(frequencies[frequencyIndex], ACTIVE_RX_TIMEOUT);

  loggerState.samples++;
  loggerState.lastFrequency = result.frequency;
  loggerState.lastTimestamp = result.timestamp;
  loggerState.lastRawLength = result.rawLength;
  loggerState.lastPattern = result.pattern;

  if (result.hit) {
    loggerState.signals++;
    writeSignalLog(result);
  }

  subState.scans++;
  subState.lastHit = result.hit;
  subState.lastRawLength = result.rawLength;
  subState.lastPattern = result.pattern;

  if (result.hit) {
    subState.hits++;
  }

  pushSubHistory(result.hit);
}

function toggleLogger() {
  loggerState.active = !loggerState.active;

  if (loggerState.active) {
    ensureLoggerDirectory();
  }
}

/* ---------- Heatmap ---------- */

function pushHeatmapPoint(index, hit) {
  var row = heatmapState.recent[index];

  row.push(hit ? 1 : 0);

  while (row.length > 12) {
    row.shift();
  }
}

function heatmapSample() {
  var index = heatmapState.nextIndex;
  var result = receiveAtFrequency(frequencies[index], ACTIVE_RX_TIMEOUT);

  heatmapState.scans[index]++;
  pushHeatmapPoint(index, result.hit);

  if (result.hit) {
    heatmapState.hits[index]++;
  }

  heatmapState.nextIndex++;

  if (heatmapState.nextIndex >= frequencies.length) {
    heatmapState.nextIndex = 0;
  }
}

function getHeatmapPercent(index) {
  var row = heatmapState.recent[index];
  var i;
  var sum = 0;

  if (row.length === 0) {
    return 0;
  }

  for (i = 0; i < row.length; i++) {
    sum += row[i];
  }

  return Math.round((sum / row.length) * 100);
}

/* ---------- Geiger ---------- */

function pushGeigerHit(hit) {
  geigerState.recentHits.push(hit ? 1 : 0);

  while (geigerState.recentHits.length > 20) {
    geigerState.recentHits.shift();
  }
}

function getGeigerRate() {
  var i;
  var sum = 0;

  for (i = 0; i < geigerState.recentHits.length; i++) {
    sum += geigerState.recentHits[i];
  }

  if (geigerState.recentHits.length === 0) {
    return 0;
  }

  return Math.round((sum / geigerState.recentHits.length) * 100);
}

function geigerSample() {
  var result = receiveAtFrequency(frequencies[frequencyIndex], ACTIVE_RX_TIMEOUT);

  geigerState.samples++;
  pushGeigerHit(result.hit);

  if (result.hit) {
    geigerState.hits++;
    geigerState.lastHitAt = result.timestamp;

    if (geigerState.clicksEnabled) {
      try {
        audio.tone(1800, 24, true);
      } catch (err7) {
      }
    }
  }
}

/* ---------- System monitor ---------- */

function refreshSystemState() {
  var memory;

  systemState.refreshes++;
  systemState.lastError = "";

  try {
    systemState.name = safeString(device.getName());
    systemState.board = safeString(device.getBoard());
    systemState.model = safeString(device.getModel());
    systemState.battery = device.getBatteryCharge();

    memory = device.getFreeHeapSize();

    systemState.ramFree = memory.ram_free || 0;
    systemState.ramSize = memory.ram_size || 0;
    systemState.ramMinFree = memory.ram_min_free || 0;
    systemState.ramLargest = memory.ram_largest_free_block || 0;
    systemState.psramFree = memory.psram_free || 0;
    systemState.psramSize = memory.psram_size || 0;
  } catch (err8) {
    systemState.lastError = safeString(err8);
  }
}

/* ---------- Dashboard ---------- */

function getDashboardVisibleRows() {
  return 4;
}

function syncDashboardViewport() {
  var visible = getDashboardVisibleRows();
  var maxScroll = dashboardItems.length - visible;

  dashboardIndex = clamp(dashboardIndex, 0, dashboardItems.length - 1);

  if (dashboardIndex < dashboardScroll) {
    dashboardScroll = dashboardIndex;
  } else if (dashboardIndex >= dashboardScroll + visible) {
    dashboardScroll = dashboardIndex - visible + 1;
  }

  if (dashboardScroll < 0) {
    dashboardScroll = 0;
  }

  if (dashboardScroll > maxScroll) {
    dashboardScroll = maxScroll;
  }
}

function dashboardSubtitle(index) {
  if (index === 0) {
    return frequencies[frequencyIndex].toFixed(2) + " MHz | " + getActivityPercent() + "%";
  }

  if (index === 1) {
    return wifiState.networks.length + " networks";
  }

  if (index === 2) {
    return loggerState.active
      ? "REC | " + loggerState.signals + " signals"
      : "SD signal recorder";
  }

  if (index === 3) {
    return heatmapState.active ? "scanning RF activity" : "frequency activity map";
  }

  if (index === 4) {
    return geigerState.active
      ? "ACTIVE | rate " + getGeigerRate() + "%"
      : "RF click detector";
  }

  if (index === 5) {
    return systemState.battery >= 0
      ? "BAT " + systemState.battery + "% | RAM " + formatBytes(systemState.ramFree)
      : "battery / RAM / PSRAM";
  }

  if (index === 6) {
    return "v" + APP_VERSION + " | passive monitor";
  }

  if (index === 7) {
    return diagState.runs === 0 ? "system diagnosis" : "last run #" + diagState.runs;
  }

  return "Display preset: " + THEME_NAMES[themeIndex];
}

function drawDashboardScrollbar() {
  var visible = getDashboardVisibleRows();
  var total = dashboardItems.length;
  var h = 112;
  var thumbH;
  var maxScroll;
  var thumbY;

  if (total <= visible) {
    return;
  }

  display.drawFillRect(screenW() - 8, 29, 3, h, colors.border);

  thumbH = Math.floor((visible / total) * h);
  if (thumbH < 10) {
    thumbH = 10;
  }

  maxScroll = total - visible;
  thumbY = 29 + Math.floor((dashboardScroll / maxScroll) * (h - thumbH));

  display.drawFillRect(screenW() - 8, thumbY, 3, thumbH, colors.accent);
}









function drawMinimalIcon(index, x, y, color) {
  var c = color || colors.title;

  if (index === 0) {
    display.drawLine(x + 9, y + 2, x + 9, y + 16, c);
    display.drawLine(x + 9, y + 4, x + 5, y + 8, c);
    display.drawLine(x + 9, y + 4, x + 13, y + 8, c);
    display.drawLine(x + 4, y + 6, x + 1, y + 9, c);
    display.drawLine(x + 14, y + 6, x + 17, y + 9, c);
    return;
  }

  if (index === 1) {
    display.drawLine(x + 2, y + 6, x + 6, y + 2, c);
    display.drawLine(x + 6, y + 2, x + 12, y + 2, c);
    display.drawLine(x + 12, y + 2, x + 16, y + 6, c);
    display.drawLine(x + 5, y + 10, x + 8, y + 7, c);
    display.drawLine(x + 8, y + 7, x + 10, y + 7, c);
    display.drawLine(x + 10, y + 7, x + 13, y + 10, c);
    display.drawFillRect(x + 8, y + 13, 3, 3, c);
    return;
  }

  if (index === 2) {
    display.drawRect(x + 4, y + 2, 10, 14, c);
    display.drawLine(x + 6, y + 6, x + 12, y + 6, c);
    display.drawLine(x + 6, y + 9, x + 12, y + 9, c);
    display.drawLine(x + 6, y + 12, x + 11, y + 12, c);
    return;
  }

  if (index === 3) {
    display.drawRect(x + 2, y + 2, 14, 14, c);
    display.drawFillRect(x + 4, y + 10, 2, 4, c);
    display.drawFillRect(x + 8, y + 7, 2, 7, c);
    display.drawFillRect(x + 12, y + 4, 2, 10, c);
    return;
  }

  if (index === 4) {
    display.drawCircle(x + 9, y + 9, 2, c);
    display.drawLine(x + 9, y + 5, x + 9, y + 1, c);
    display.drawLine(x + 5, y + 7, x + 1, y + 4, c);
    display.drawLine(x + 13, y + 7, x + 17, y + 4, c);
    display.drawLine(x + 5, y + 12, x + 2, y + 16, c);
    display.drawLine(x + 13, y + 12, x + 16, y + 16, c);
    return;
  }

  if (index === 5) {
    /* SYSTEM */
    display.drawRect(x + 4, y + 4, 10, 10, c);
    display.drawRect(x + 7, y + 7, 4, 4, c);

    display.drawLine(x + 1, y + 7, x + 4, y + 7, c);
    display.drawLine(x + 1, y + 11, x + 4, y + 11, c);
    display.drawLine(x + 14, y + 7, x + 17, y + 7, c);
    display.drawLine(x + 14, y + 11, x + 17, y + 11, c);

    display.drawLine(x + 7, y + 1, x + 7, y + 4, c);
    display.drawLine(x + 11, y + 1, x + 11, y + 4, c);
    display.drawLine(x + 7, y + 14, x + 7, y + 17, c);
    display.drawLine(x + 11, y + 14, x + 11, y + 17, c);
    return;
  }

  if (index === 6) {
    display.drawCircle(x + 9, y + 9, 7, c);
    display.drawFillRect(x + 8, y + 5, 2, 2, c);
    display.drawFillRect(x + 8, y + 9, 2, 5, c);
    return;
  }

  if (index === 7) {
    display.drawLine(x + 3, y + 14, x + 14, y + 3, c);
    display.drawCircle(x + 5, y + 13, 3, c);
    display.drawCircle(x + 13, y + 5, 3, c);
    return;
  }

  display.drawCircle(x + 9, y + 9, 6, c);
  display.drawCircle(x + 9, y + 9, 2, c);
  display.drawLine(x + 9, y + 1, x + 9, y + 4, c);
  display.drawLine(x + 9, y + 14, x + 9, y + 17, c);
  display.drawLine(x + 1, y + 9, x + 4, y + 9, c);
  display.drawLine(x + 14, y + 9, x + 17, y + 9, c);
}

function drawPageIcon(index, x, y) {
  drawMinimalIcon(index, x, y, colors.title);
  return true;
}

function drawDashboardTab(index) {
  var title = dashboardItems[index];
  var subtitle = dashboardSubtitle(index);
  var i;
  var dotStart = 118;

  drawCategoryBackground(index);
  drawHeader("ENVIRONMENT");

  display.drawFillRoundRect(
    10,
    39,
    300,
    92,
    7,
    colors.panel
  );

  display.drawRoundRect(
    10,
    39,
    300,
    92,
    7,
    colors.border
  );

  /* compact category icon */
  display.drawFillRoundRect(
    20,
    54,
    42,
    42,
    6,
    colors.panel2
  );

  display.drawRoundRect(
    20,
    54,
    42,
    42,
    6,
    colors.border
  );

  drawMinimalIcon(
    index,
    32,
    66,
    colors.title
  );

  display.setTextColor(colors.title);
  display.setTextSize(2);
  display.drawText(
    title,
    78,
    51
  );

  display.setTextSize(1);
  display.setTextColor(colors.text);
  display.drawText(
    truncate(subtitle, 34),
    78,
    76
  );

  display.drawLine(
    78,
    93,
    294,
    93,
    colors.shadow
  );

  display.setTextColor(colors.muted);
  display.drawText(
    "SELECT to open",
    78,
    104
  );

  for (i = 0; i < dashboardItems.length; i++) {
    if (i === index) {
      display.drawFillRoundRect(
        dotStart + i * 10,
        139,
        7,
        7,
        3,
        colors.accent
      );
    } else {
      display.drawRoundRect(
        dotStart + i * 10,
        140,
        5,
        5,
        2,
        colors.selectText
      );
    }
  }

  drawFooter("< > tabs", "SELECT", "ESC");
}

function drawDashboard() {
  drawDashboardTab(dashboardIndex);
}

function moveDashboard(delta) {
  dashboardIndex += delta;

  if (dashboardIndex < 0) {
    dashboardIndex = dashboardItems.length - 1;
  }

  if (dashboardIndex >= dashboardItems.length) {
    dashboardIndex = 0;
  }

  render();
}

function openDashboardSelection() {
  if (dashboardIndex === 0) {
    page = PAGE_SUBGHZ;
  } else if (dashboardIndex === 1) {
    page = PAGE_WIFI;
  } else if (dashboardIndex === 2) {
    page = PAGE_LOGGER;
  } else if (dashboardIndex === 3) {
    page = PAGE_HEATMAP;
  } else if (dashboardIndex === 4) {
    page = PAGE_GEIGER;
  } else if (dashboardIndex === 5) {
    page = PAGE_SYSTEM;
    refreshSystemState();
  } else if (dashboardIndex === 6) {
    page = PAGE_INFO;
  } else if (dashboardIndex === 7) {
    page = PAGE_DIAG;
  } else {
    page = PAGE_CONFIG;
  }

  render();
}

function drawDataPanel(x, y, w, h) {
  display.drawFillRoundRect(
    x,
    y,
    w,
    h,
    5,
    colors.panel
  );

  display.drawRoundRect(
    x,
    y,
    w,
    h,
    5,
    colors.border
  );
}

function drawSectionLabel(label, x, y) {
  display.setTextSize(1);
  display.setTextColor(colors.muted);
  display.drawText(label, x, y);
}

function drawPrimaryValue(value, x, y) {
  display.setTextSize(2);
  display.setTextColor(colors.title);
  display.drawText(value, x, y);
}

function drawBodyText(value, x, y) {
  display.setTextSize(1);
  display.setTextColor(colors.text);
  display.drawText(value, x, y);
}

/* ---------- Sub-GHz page ---------- */

function drawActivityBars(x, y, width, height) {
  var count = subState.history.length;
  var gap = 2;
  var barWidth;
  var i;
  var bx;

  if (count === 0) {
    display.setTextColor(colors.muted);
    display.drawText("no samples yet", x, y + 2);
    return;
  }

  barWidth = Math.floor((width - ((count - 1) * gap)) / count);

  if (barWidth < 2) {
    barWidth = 2;
  }

  for (i = 0; i < count; i++) {
    bx = x + i * (barWidth + gap);

    if (subState.history[i] === 1) {
      display.drawFillRect(bx, y, barWidth, height, colors.accent);
    } else {
      display.drawFillRect(bx, y + height - 3, barWidth, 3, colors.panel2);
    }
  }
}

function drawSubGhz() {
  var freq = frequencies[frequencyIndex];
  var activity = getActivityPercent();

  clearScreen();
  drawHeader("SUB-GHZ");

  drawDataPanel(
    10,
    38,
    screenW() - 20,
    40
  );

  drawSectionLabel("FREQUENCY", 16, 45);
  drawPrimaryValue(
    freq.toFixed(2) + " MHz",
    16,
    57
  );

  display.setTextSize(1);
  display.setTextAlign("right", "top");
  display.setTextColor(colors.accent);
  display.drawText(
    (frequencyIndex + 1) + "/" + frequencies.length,
    screenW() - 18,
    58
  );
  display.setTextAlign("left", "top");

  drawDataPanel(
    10,
    83,
    screenW() - 20,
    55
  );

  display.setTextSize(1);
  display.setTextColor(
    subState.lastHit
      ? colors.accent
      : colors.title
  );
  display.drawText(
    subState.lastHit
      ? "SIGNAL DETECTED"
      : "NO SIGNAL",
    16,
    90
  );

  drawBodyText(
    "RAW " +
    subState.lastRawLength +
    " | " +
    truncate(subState.lastPattern, 28),
    16,
    106
  );

  drawSectionLabel("ACTIVITY", 16, 121);

  drawActivityBars(
    16,
    132,
    screenW() - 32,
    8
  );

  drawBodyText(
    "hits " + subState.hits + "/" + subState.scans,
    12,
    143
  );

  display.setTextAlign("right", "top");
  display.setTextColor(colors.accent);
  display.drawText(
    activity + "%",
    screenW() - 12,
    143
  );
  display.setTextAlign("left", "top");

  drawFooter("^ v freq", "SEL actions", "ESC back");
}

/* ---------- Wi-Fi page ---------- */

function getWifiVisibleRows() {
  return 4;
}

function syncWifiViewport() {
  var visible = getWifiVisibleRows();
  var total = wifiState.networks.length;
  var maxScroll;

  if (total <= 0) {
    wifiCursor = 0;
    wifiScroll = 0;
    return;
  }

  wifiCursor = clamp(wifiCursor, 0, total - 1);

  if (total <= visible) {
    wifiScroll = 0;
    return;
  }

  if (wifiCursor < wifiScroll) {
    wifiScroll = wifiCursor;
  } else if (wifiCursor >= wifiScroll + visible) {
    wifiScroll = wifiCursor - visible + 1;
  }

  maxScroll = total - visible;
  wifiScroll = clamp(wifiScroll, 0, maxScroll);
}

function moveWifiCursor(delta) {
  var total = wifiState.networks.length;

  if (total <= 0) {
    return;
  }

  wifiCursor = clamp(wifiCursor + delta, 0, total - 1);
  syncWifiViewport();
}

function drawWifi() {
  var total = wifiState.networks.length;
  var row;
  var index;
  var network;
  var y;
  var enc;
  var selected;
  var name;

  syncWifiViewport();
  clearScreen();
  drawHeader("WI-FI");

  drawDataPanel(
    8,
    34,
    screenW() - 16,
    20
  );

  drawBodyText(
    total +
    " found | " +
    wifiState.openCount +
    " open | scan #" +
    wifiState.scans,
    14,
    40
  );

  if (wifiState.lastError !== "") {
    display.setTextColor(colors.bad);
    display.drawText(
      truncate(wifiState.lastError, 46),
      12,
      60
    );
  } else if (total === 0) {
    display.setTextColor(colors.muted);
    display.drawText(
      "SELECT starts scan",
      12,
      62
    );
  } else {
    for (row = 0; row < getWifiVisibleRows(); row++) {
      index = wifiScroll + row;

      if (index >= total) {
        break;
      }

      network = wifiState.networks[index];
      y = 58 + row * 20;
      selected = index === wifiCursor;
      enc = safeString(network.encryptionType);
      name = truncate(
        network.SSID || "<hidden>",
        31
      );

      display.drawFillRoundRect(
        8,
        y,
        screenW() - 16,
        18,
        3,
        selected
          ? colors.panel2
          : colors.panel
      );

      display.drawRoundRect(
        8,
        y,
        screenW() - 16,
        18,
        3,
        selected
          ? colors.accent
          : colors.border
      );

      display.setTextColor(
        selected
          ? colors.title
          : colors.text
      );
      display.drawText(
        name,
        15,
        y + 5
      );

      display.setTextAlign("right", "top");
      display.setTextColor(
        selected
          ? colors.accent
          : colors.muted
      );
      display.drawText(
        (enc === "OPEN" || enc === "NONE")
          ? "OPEN"
          : "LOCK",
        screenW() - 15,
        y + 5
      );
      display.setTextAlign("left", "top");
    }

    display.setTextColor(colors.muted);
    display.drawText(
      (wifiCursor + 1) + "/" + total,
      10,
      138
    );
  }

  drawFooter("^ v select", "SEL details", "ESC back");
}

/* ---------- Logger page ---------- */

function drawLogger() {
  clearScreen();
  drawHeader("LOGGER");

  drawDataPanel(
    10,
    38,
    screenW() - 20,
    39
  );

  drawSectionLabel("FREQUENCY", 16, 45);
  drawPrimaryValue(
    frequencies[frequencyIndex].toFixed(2) + " MHz",
    16,
    57
  );

  drawDataPanel(
    10,
    83,
    screenW() - 20,
    55
  );

  display.setTextSize(1);
  display.setTextColor(
    loggerState.active
      ? colors.bad
      : colors.title
  );
  display.drawText(
    loggerState.active
      ? "REC"
      : "STOPPED",
    16,
    90
  );

  drawBodyText(
    "samples " +
    loggerState.samples +
    " | signals " +
    loggerState.signals,
    16,
    106
  );

  drawBodyText(
    "pattern " +
    truncate(loggerState.lastPattern, 28),
    16,
    121
  );

  drawBodyText(
    "raw " +
    loggerState.lastRawLength +
    " | errors " +
    loggerState.writeErrors,
    16,
    136
  );

  drawFooter("^ v freq", "SEL start/stop", "ESC back");
}

/* ---------- Heatmap page ---------- */

function drawHeatCell(x, y, w, h, active) {
  if (active) {
    display.drawFillRect(x, y, w, h, colors.accent);
  } else {
    display.drawFillRect(x, y + h - 2, w, 2, colors.panel2);
  }
}

function drawHeatmap() {
  var row;
  var col;
  var y;
  var x;
  var cellW = 12;
  var cellGap = 2;
  var visibleCols = 12;

  clearScreen();
  drawHeader("HEATMAP");

  drawDataPanel(
    8,
    34,
    screenW() - 16,
    110
  );

  display.setTextSize(1);
  display.setTextColor(
    heatmapState.active
      ? colors.accent
      : colors.title
  );
  display.drawText(
    heatmapState.active
      ? "SCANNING"
      : "PAUSED",
    14,
    40
  );

  display.setTextAlign("right", "top");
  display.setTextColor(colors.muted);
  display.drawText(
    "activity",
    screenW() - 14,
    40
  );
  display.setTextAlign("left", "top");

  for (
    row = 0;
    row < frequencies.length;
    row++
  ) {
    y = 58 + row * 20;

    display.setTextColor(
      heatmapState.nextIndex === row &&
      heatmapState.active
        ? colors.accent
        : colors.title
    );

    display.drawText(
      frequencies[row].toFixed(2),
      14,
      y
    );

    for (
      col = 0;
      col < visibleCols &&
      col < heatmapState.recent[row].length;
      col++
    ) {
      x = 78 + col * (cellW + cellGap);

      drawHeatCell(
        x,
        y + 1,
        cellW,
        10,
        heatmapState.recent[row][col] === 1
      );
    }

    display.setTextAlign("right", "top");
    display.setTextColor(colors.muted);
    display.drawText(
      getHeatmapPercent(row) + "%",
      screenW() - 14,
      y
    );
    display.setTextAlign("left", "top");
  }

  drawFooter("", "SEL start/stop", "ESC back");
}

/* ---------- Geiger page ---------- */

function drawGeiger() {
  var rate = getGeigerRate();
  var i;
  var x;
  var maxHistory = 18;

  clearScreen();
  drawHeader("GEIGER");

  drawDataPanel(
    10,
    38,
    screenW() - 20,
    39
  );

  drawSectionLabel("FREQUENCY", 16, 45);
  drawPrimaryValue(
    frequencies[frequencyIndex].toFixed(2) + " MHz",
    16,
    57
  );

  drawDataPanel(
    10,
    83,
    screenW() - 20,
    55
  );

  display.setTextSize(1);
  display.setTextColor(
    geigerState.active
      ? colors.accent
      : colors.title
  );
  display.drawText(
    geigerState.active
      ? "LISTENING"
      : "PAUSED",
    16,
    90
  );

  drawBodyText(
    "hits " +
    geigerState.hits +
    "/" +
    geigerState.samples,
    16,
    106
  );

  drawBodyText(
    "activity " + rate + "%",
    16,
    121
  );

  drawProgressBar(
    16,
    132,
    screenW() - 32,
    8,
    rate
  );

  for (
    i = 0;
    i < geigerState.recentHits.length &&
    i < maxHistory;
    i++
  ) {
    x = 16 + i * 16;

    if (geigerState.recentHits[i] === 1) {
      display.drawFillRect(
        x,
        143,
        8,
        4,
        colors.accent
      );
    } else {
      display.drawFillRect(
        x,
        145,
        8,
        2,
        colors.shadow
      );
    }
  }

  drawFooter("^ v freq", "SEL start/stop", "ESC back");
}

/* ---------- System page ---------- */

function percentFree(freeValue, totalValue) {
  if (!totalValue || totalValue <= 0) {
    return 0;
  }
  return Math.round((freeValue / totalValue) * 100);
}

function drawSystem() {
  var ramPercent = percentFree(
    systemState.ramFree,
    systemState.ramSize
  );

  var psramPercent = percentFree(
    systemState.psramFree,
    systemState.psramSize
  );

  clearScreen();
  drawHeader("SYSTEM");

  drawDataPanel(
    10,
    36,
    screenW() - 20,
    108
  );

  if (systemState.lastError !== "") {
    display.setTextColor(colors.bad);
    display.setTextSize(1);
    display.drawText(
      truncate(systemState.lastError, 45),
      16,
      43
    );
  } else {
    display.setTextColor(colors.title);
    display.setTextSize(1);
    display.drawText(
      truncate(
        systemState.model !== "unknown"
          ? systemState.model
          : systemState.board,
        42
      ),
      16,
      43
    );
  }

  display.setTextColor(colors.accent);
  display.setTextSize(2);
  display.drawText(
    systemState.battery >= 0
      ? systemState.battery + "%"
      : "--%",
    16,
    58
  );

  display.setTextSize(1);
  display.setTextColor(colors.muted);
  display.drawText("BATTERY", 76, 65);

  drawBodyText(
    "RAM " +
    formatBytes(systemState.ramFree) +
    "/" +
    formatBytes(systemState.ramSize),
    16,
    88
  );

  drawProgressBar(
    16,
    101,
    screenW() - 32,
    8,
    ramPercent
  );

  drawBodyText(
    "PSRAM " +
    formatBytes(systemState.psramFree) +
    "/" +
    formatBytes(systemState.psramSize),
    16,
    116
  );

  drawProgressBar(
    16,
    129,
    screenW() - 32,
    8,
    psramPercent
  );

  display.setTextColor(colors.muted);
  display.drawText(
    "refresh #" + systemState.refreshes,
    16,
    141
  );

  drawFooter("", "SEL refresh", "ESC back");
}

/* ---------- Info ---------- */

function getInfoLines() {
  var currentBruce = "unknown";

  try {
    if (typeof BRUCE_VERSION !== "undefined") {
      currentBruce = safeString(BRUCE_VERSION);
    }
  } catch (err9) {
    currentBruce = "unknown";
  }

  return [
    "Project: RF Environment Monitor",
    "  /\\_/\\",
    " ( o.o )",
    "  > ^ <",
    "",
    "Version: " + APP_VERSION,
    "Build: " + BUILD_DATE,
    "",
    "Target: T-Embed CC1101 Plus",
    "Built for Bruce: " + TARGET_BRUCE,
    "Runtime Bruce: " + currentBruce,
    "",
    "Passive RF environment tools",
    "Signal logging to SD",
    "RF activity heatmap",
    "RF Geiger counter",
    "Mini system monitor",
    "Configurable display preset",
    "Theme changes full screen",
    "UI: lean icons v3.6.8",
    "Icons: native display primitives",
    
    
    
    
    
    
    
    "Layout: 320x170 landscape",
    "",
    "Config:",
    "/environment.config.json",
    "",
    "Credits",
    "Open-source community edition",
    "",
    "Log:",
    "/environment.log",
    "",
    "Dashboard: one tab per screen",
    "Left/right: switch tab",
    "Pages: up/down",
    "SELECT: action",
    "ESC: back"
  ];
}

function getInfoVisibleRows() {
  return 7;
}

function moveInfoScroll(delta) {
  var lines = getInfoLines();
  var maxScroll = lines.length - getInfoVisibleRows();

  if (maxScroll < 0) {
    maxScroll = 0;
  }

  infoScroll = clamp(infoScroll + delta, 0, maxScroll);
}

function drawInfo() {
  var lines = getInfoLines();
  var row;
  var index;

  clearScreen();
  drawHeader("INFO");
for (row = 0; row < getInfoVisibleRows(); row++) {
    index = infoScroll + row;

    if (index >= lines.length) {
      break;
    }

    display.setTextSize(1);

    if (
      lines[index].indexOf("Author:") === 0 ||
      lines[index].indexOf("Version:") === 0 ||
      lines[index].indexOf("Build:") === 0 ||
      lines[index] === "Credits"
    ) {
      display.setTextColor(colors.accent);
    } else {
      display.setTextColor(colors.text);
    }

    display.drawText(truncate(lines[index], 47), 12, 34 + row * 16);
  }

  if (infoScroll > 0) {
    display.setTextColor(colors.accent);
    display.drawText("^", screenW() - 13, 34);
  }

  if (infoScroll + getInfoVisibleRows() < lines.length) {
    display.setTextColor(colors.accent);
    display.drawText("v", screenW() - 13, 130);
  }

  drawFooter("^ v scroll", "SEL top", "ESC back");
}


/* ---------- Config ---------- */

function moveTheme(delta) {
  applyTheme(themeIndex + delta);
  configDirty = true;
  configMessage = "preview";
}

function getPresetPreviewColor(index, part) {
  if (index === 0) {
    if (part === "bg") return display.color(166, 232, 241);
    if (part === "accent") return display.color(37, 158, 178);
    return display.color(12, 52, 60);
  }

  if (index === 1) {
    if (part === "bg") return display.color(246, 241, 226);
    if (part === "accent") return display.color(255, 128, 20);
    return display.color(18, 18, 18);
  }

  if (index === 2) {
    if (part === "bg") return display.color(157, 239, 107);
    if (part === "accent") return display.color(48, 154, 42);
    return display.color(18, 56, 16);
  }

  if (part === "bg") return display.color(202, 151, 234);
  if (part === "accent") return display.color(133, 61, 181);
  return display.color(53, 22, 70);
}

function drawPresetTile(index, x, y, selected) {
  var bg = getPresetPreviewColor(index, "bg");
  var ac = getPresetPreviewColor(index, "accent");
  var tx = getPresetPreviewColor(index, "text");

  if (selected) {
    display.drawFillRoundRect(x - 3, y - 3, 138, 47, 5, colors.shadow);
  }

  display.drawFillRoundRect(x, y, 132, 41, 4, bg);
  display.drawRoundRect(x, y, 132, 41, 4, selected ? colors.text : tx);

  /* tiny display preview */
  display.drawFillRect(x + 7, y + 7, 34, 22, ac);
  display.drawRect(x + 6, y + 6, 36, 24, tx);
  display.drawLine(x + 11, y + 21, x + 17, y + 14, tx);
  display.drawLine(x + 17, y + 14, x + 23, y + 18, tx);
  display.drawLine(x + 23, y + 18, x + 34, y + 10, tx);

  display.setTextSize(1);
  display.setTextColor(tx);
  display.drawText(THEME_NAMES[index], x + 49, y + 8);

  display.setTextColor(selected ? ac : tx);
  display.drawText(selected ? "SELECTED" : "preview", x + 49, y + 24);
}

function drawConfig() {
  var i;
  var x;
  var selected;

  clearScreen();
  drawHeader("CONFIG");

  display.setTextSize(1);
  display.setTextColor(colors.text);
  display.drawText("THEME", 14, 39);

  for (i = 0; i < THEME_NAMES.length; i++) {
    x = 13 + i * 76;
    selected = i === themeIndex;

    display.drawFillRoundRect(
      x,
      53,
      68,
      62,
      5,
      selected ? colors.panel2 : colors.panel
    );

    display.drawRoundRect(
      x,
      53,
      68,
      62,
      5,
      selected ? colors.accent : colors.border
    );

    /* clean separate config icon */
    if (selected) {
      drawPageIcon(8, x + 20, 61);
    } else {
      drawPixelIcon("CONFIG", x + 24, 66, false);
    }

    display.setTextAlign("center", "top");
    display.setTextColor(
      selected ? colors.accent : colors.title
    );
    display.drawText(
      truncate(THEME_NAMES[i], 7),
      x + 34,
      101
    );
    display.setTextAlign("left", "top");
  }

  display.setTextColor(colors.muted);
  display.drawText(
    configDirty
      ? "preview - SELECT saves"
      : "theme saved on SD",
    14,
    128
  );

  /* indicator with proper margin */
  display.drawFillRoundRect(
    111,
    142,
    98,
    5,
    2,
    colors.shadow
  );

  display.drawFillRoundRect(
    111 + themeIndex * 24,
    140,
    24,
    9,
    3,
    colors.accent
  );

  drawFooter("< > theme", "SAVE", "ESC");
}

/* ---------- Diagnostics ---------- */

function pushDiag(label, ok, detail) {
  diagState.lines.push({
    label: label,
    ok: ok,
    detail: detail || ""
  });
}

function runDiagnostics() {
  var runtimeBruce = "unknown";
  var memory;

  diagState.runs++;
  diagState.lines = [];

  try {
    if (typeof BRUCE_VERSION !== "undefined") {
      runtimeBruce = safeString(BRUCE_VERSION);
    }
    pushDiag("Bruce", true, runtimeBruce);
  } catch (err10) {
    pushDiag("Bruce", false, "runtime");
  }

  try {
    pushDiag(
      "Display",
      display.width() > 0 && display.height() > 0,
      display.width() + "x" + display.height()
    );
  } catch (err11) {
    pushDiag("Display", false, "API");
  }

  try {
    subghz.setFrequency(frequencies[frequencyIndex]);
    pushDiag("CC1101", true, frequencies[frequencyIndex].toFixed(2) + " MHz");
  } catch (err12) {
    pushDiag("CC1101", false, "set freq");
  }

  try {
    pushDiag("Wi-Fi", typeof wifi.scan === "function", "scan API");
  } catch (err13) {
    pushDiag("Wi-Fi", false, "API");
  }

  try {
    ensureLoggerDirectory();
    pushDiag("SD logger", true, "/environment.log");
  } catch (err14) {
    pushDiag("SD logger", false, "mkdir");
  }

  try {
    memory = device.getFreeHeapSize();
    pushDiag("RAM", true, formatBytes(memory.ram_free));
    pushDiag(
      "PSRAM",
      true,
      formatBytes(memory.psram_free) +
      "/" +
      formatBytes(memory.psram_size)
    );
  } catch (err15) {
    pushDiag("RAM", false, "device API");
  }

  try {
    pushDiag("Battery", true, device.getBatteryCharge() + "%");
  } catch (err16) {
    pushDiag("Battery", false, "device API");
  }
diagScroll = 0;
}

function getDiagVisibleRows() {
  return 5;
}

function moveDiagScroll(delta) {
  var maxScroll = diagState.lines.length - getDiagVisibleRows();

  if (maxScroll < 0) {
    maxScroll = 0;
  }

  diagScroll = clamp(diagScroll + delta, 0, maxScroll);
}

function drawDiag() {
  var row;
  var index;
  var item;
  var y;

  clearScreen();
  drawHeader("DIAG");
display.setTextColor(colors.muted);
  display.setTextSize(1);
  display.drawText("diagnosis | run #" + diagState.runs, 10, 34);

  if (diagState.lines.length === 0) {
    display.setTextColor(colors.text);
    display.drawText("SELECT starts diagnostics", 10, 58);
  } else {
    for (row = 0; row < getDiagVisibleRows(); row++) {
      index = diagScroll + row;

      if (index >= diagState.lines.length) {
        break;
      }

      item = diagState.lines[index];
      y = 50 + row * 18;

      display.setTextColor(item.ok ? colors.title : colors.bad);
      display.drawText(item.ok ? "OK" : "FAIL", 10, y);

      display.setTextColor(colors.text);
      display.drawText(truncate(item.label, 14), 43, y);

      display.setTextColor(colors.muted);
      display.setTextAlign("right", "top");
      display.drawText(truncate(item.detail, 27), screenW() - 12, y);
      display.setTextAlign("left", "top");
    }
  }

  drawFooter("^ v scroll", "SEL run", "ESC back");
}

/* ---------- Wi-Fi detail ---------- */

function drawWifiDetail() {
  var network;
  var enc;

  clearScreen();
  drawHeader("WI-FI DETAIL");

  if (
    wifiState.networks.length === 0 ||
    wifiCursor < 0 ||
    wifiCursor >= wifiState.networks.length
  ) {
    drawDataPanel(
      10,
      38,
      screenW() - 20,
      50
    );

    display.setTextColor(colors.muted);
    display.setTextSize(1);
    display.drawText(
      "No network selected.",
      16,
      48
    );

    drawFooter("^ v action", "SEL run", "ESC back");
    return;
  }

  network = wifiState.networks[wifiCursor];
  enc = safeString(network.encryptionType);

  drawDataPanel(
    10,
    36,
    screenW() - 20,
    92
  );

  drawSectionLabel("SSID", 16, 43);

  display.setTextSize(2);
  display.setTextColor(colors.title);
  display.drawText(
    truncate(network.SSID || "<hidden>", 24),
    16,
    55
  );

  drawBodyText(
    "MAC: " +
    truncate(network.MAC || "N/A", 32),
    16,
    79
  );

  drawBodyText(
    "SEC: " +
    truncate(enc || "N/A", 32),
    16,
    94
  );

  display.setTextColor(colors.muted);
  display.drawText(
    "RSSI: N/A (Bruce JS)",
    16,
    109
  );
  display.drawText(
    "CHANNEL: N/A (Bruce JS)",
    16,
    122
  );

  display.drawFillRoundRect(
    10,
    132,
    screenW() - 20,
    16,
    4,
    colors.panel2
  );

  display.drawRoundRect(
    10,
    132,
    screenW() - 20,
    16,
    4,
    colors.accent
  );

  display.setTextColor(colors.title);
  display.drawText(
    WIFI_DETAIL_ACTIONS[wifiDetailAction],
    18,
    137
  );

  if (wifiDetailMessage !== "") {
    display.setTextAlign("right", "top");
    display.setTextColor(colors.muted);
    display.drawText(
      truncate(wifiDetailMessage, 18),
      screenW() - 16,
      137
    );
    display.setTextAlign("left", "top");
  }

  drawFooter("^ v action", "SEL run", "ESC back");
}

/* ---------- RF detail ---------- */

function drawRfDetail() {
  clearScreen();
  drawHeader("RF ACTIONS");

  drawDataPanel(
    10,
    36,
    screenW() - 20,
    88
  );

  drawSectionLabel("FREQUENCY", 16, 43);
  drawPrimaryValue(
    frequencies[frequencyIndex].toFixed(2) + " MHz",
    16,
    55
  );

  drawBodyText(
    "activity " + getActivityPercent() + "%",
    16,
    80
  );

  drawBodyText(
    "raw " + subState.lastRawLength,
    16,
    95
  );

  drawBodyText(
    "pattern " +
    truncate(subState.lastPattern, 28),
    16,
    110
  );

  display.drawFillRoundRect(
    10,
    130,
    screenW() - 20,
    18,
    4,
    colors.panel2
  );

  display.drawRoundRect(
    10,
    130,
    screenW() - 20,
    18,
    4,
    colors.accent
  );

  display.setTextColor(colors.title);
  display.drawText(
    RF_DETAIL_ACTIONS[rfDetailAction],
    18,
    136
  );

  if (rfDetailMessage !== "") {
    display.setTextAlign("right", "top");
    display.setTextColor(colors.muted);
    display.drawText(
      truncate(rfDetailMessage, 18),
      screenW() - 16,
      136
    );
    display.setTextAlign("left", "top");
  }

  drawFooter("^ v action", "SEL run", "ESC back");
}

/* ---------- Render ---------- */

function render() {
  if (page === PAGE_DASHBOARD) {
    drawDashboard();
  } else if (page === PAGE_SUBGHZ) {
    drawSubGhz();
  } else if (page === PAGE_WIFI) {
    drawWifi();
  } else if (page === PAGE_LOGGER) {
    drawLogger();
  } else if (page === PAGE_HEATMAP) {
    drawHeatmap();
  } else if (page === PAGE_GEIGER) {
    drawGeiger();
  } else if (page === PAGE_SYSTEM) {
    drawSystem();
  } else if (page === PAGE_INFO) {
    drawInfo();
  } else if (page === PAGE_DIAG) {
    drawDiag();
  } else if (page === PAGE_CONFIG) {
    drawConfig();
  } else if (page === PAGE_WIFI_DETAIL) {
    drawWifiDetail();
  } else {
    drawRfDetail();
  }
}

/* ---------- Global BACK input ---------- */

function isBackKeyName(name) {
  var value = safeString(name).toLowerCase();

  if (value === "esc") return true;
  if (value === "escape") return true;
  if (value === "back") return true;
  if (value === "backspace") return true;

  if (value.indexOf("esc") >= 0) return true;
  if (value.indexOf("back") >= 0) return true;

  return false;
}

function hasBackKeyInPressedKeys() {
  var keys;
  var i;

  try {
    keys = keyboard.getKeysPressed();

    if (!keys || keys.length === 0) {
      return false;
    }

    for (i = 0; i < keys.length; i++) {
      if (isBackKeyName(keys[i])) {
        return true;
      }
    }
  } catch (err28) {
    return false;
  }

  return false;
}

function isBackPressed() {
  /*
   * Primary Bruce ESC edge event plus a key-name fallback for devices
   * whose physical BACK button is exposed differently by the keyboard layer.
   */
  try {
    if (keyboard.getEscPress()) {
      return true;
    }
  } catch (err29) {
  }

  return hasBackKeyInPressedKeys();
}

function isAnyButtonHeld() {
  /*
   * Bruce documents the hold=true form as a held-state check for any
   * physical button. Use it only for release/debounce handling, never
   * for deciding which action the user requested.
   */
  try {
    return keyboard.getAnyPress(true) ? true : false;
  } catch (err30) {
    return hasBackKeyInPressedKeys();
  }
}

function drainNavigationEdges() {
  /*
   * Read and discard stale edge events that may have been generated by
   * the same physical BACK press on boards with shared/translated keys.
   */
  try { keyboard.getEscPress(); } catch (err31) {}
  try { keyboard.getNextPress(); } catch (err32) {}
  try { keyboard.getPrevPress(); } catch (err33) {}
  try { keyboard.getSelPress(); } catch (err34) {}
}

function consumeBackPress() {
  /*
   * Wait briefly for the physical key to be released, then drain stale
   * edge events. This prevents BACK from leaking into NEXT/PREV/SELECT
   * on the following loop iteration while an active page is sampling.
   */
  var started = now();

  while (now() - started < 350) {
    if (!isAnyButtonHeld()) {
      break;
    }

    delay(15);
  }

  drainNavigationEdges();
}


/* ---------- Input ---------- */

function handleNext() {
  if (page === PAGE_DASHBOARD) {
    moveDashboard(1);
  } else if (
    page === PAGE_SUBGHZ ||
    page === PAGE_LOGGER ||
    page === PAGE_GEIGER
  ) {
    setFrequencyIndex(frequencyIndex + 1);
    render();
  } else if (page === PAGE_WIFI) {
    moveWifiCursor(1);
    render();
  } else if (page === PAGE_INFO) {
    moveInfoScroll(1);
    render();
  } else if (page === PAGE_DIAG) {
    moveDiagScroll(1);
    render();
  } else if (page === PAGE_CONFIG) {
    moveTheme(1);
    render();
  } else if (page === PAGE_WIFI_DETAIL) {
    moveWifiDetailAction(1);
    render();
  } else if (page === PAGE_RF_DETAIL) {
    moveRfDetailAction(1);
    render();
  }
}

function handlePrev() {
  if (page === PAGE_DASHBOARD) {
    moveDashboard(-1);
  } else if (
    page === PAGE_SUBGHZ ||
    page === PAGE_LOGGER ||
    page === PAGE_GEIGER
  ) {
    setFrequencyIndex(frequencyIndex - 1);
    render();
  } else if (page === PAGE_WIFI) {
    moveWifiCursor(-1);
    render();
  } else if (page === PAGE_INFO) {
    moveInfoScroll(-1);
    render();
  } else if (page === PAGE_DIAG) {
    moveDiagScroll(-1);
    render();
  } else if (page === PAGE_CONFIG) {
    moveTheme(-1);
    render();
  } else if (page === PAGE_WIFI_DETAIL) {
    moveWifiDetailAction(-1);
    render();
  } else if (page === PAGE_RF_DETAIL) {
    moveRfDetailAction(-1);
    render();
  }
}

function handleSelect() {
  if (page === PAGE_DASHBOARD) {
    openDashboardSelection();
  } else if (page === PAGE_SUBGHZ) {
    rfDetailAction = 0;
    rfDetailMessage = "";
    page = PAGE_RF_DETAIL;
    render();
  } else if (page === PAGE_WIFI) {
    if (wifiState.networks.length === 0) {
      performWifiScan();
    } else {
      wifiDetailAction = 0;
      wifiDetailMessage = "";
      page = PAGE_WIFI_DETAIL;
    }
    render();
  } else if (page === PAGE_LOGGER) {
    toggleLogger();
    render();
  } else if (page === PAGE_HEATMAP) {
    heatmapState.active = !heatmapState.active;
    render();
  } else if (page === PAGE_GEIGER) {
    geigerState.active = !geigerState.active;
    render();
  } else if (page === PAGE_SYSTEM) {
    refreshSystemState();
    render();
  } else if (page === PAGE_INFO) {
    infoScroll = 0;
    render();
  } else if (page === PAGE_DIAG) {
    runDiagnostics();
    render();
  } else if (page === PAGE_CONFIG) {
    saveConfig();
    render();
  } else if (page === PAGE_WIFI_DETAIL) {
    runWifiDetailAction();
    render();
  } else if (page === PAGE_RF_DETAIL) {
    runRfDetailAction();
    render();
  }
}










function stopTaskBeforeBack() {
  if (page === PAGE_LOGGER) {
    loggerState.active = false;
  }

  if (page === PAGE_HEATMAP) {
    heatmapState.active = false;
  }

  if (page === PAGE_GEIGER) {
    geigerState.active = false;
  }
}

function handleEsc() {
  /*
   * Global navigation rule:
   * - Dashboard: leave app
   * - Detail page: parent page
   * - Any normal subpage: dashboard
   * Active passive monitors stop immediately before navigation.
   */
  stopTaskBeforeBack();

  if (page === PAGE_DASHBOARD) {
    running = false;
    return;
  }

  if (page === PAGE_WIFI_DETAIL) {
    page = PAGE_WIFI;
    render();
    return;
  }

  if (page === PAGE_RF_DETAIL) {
    page = PAGE_SUBGHZ;
    render();
    return;
  }

  page = PAGE_DASHBOARD;
  render();
}

/* ---------- Background active-page tasks ---------- */

function runActivePageTask() {
  if (false) {
    return true;
  }

  if (page === PAGE_LOGGER && loggerState.active) {
    loggerSample();

    if (false) {
      return true;
    }

    render();
    return true;
  }

  if (page === PAGE_HEATMAP && heatmapState.active) {
    heatmapSample();

    if (false) {
      return true;
    }

    render();
    return true;
  }

  if (page === PAGE_GEIGER && geigerState.active) {
    geigerSample();

    if (false) {
      return true;
    }

    render();
    return true;
  }

  return false;
}

function initialize() {
  ensureLoggerDirectory();

  try {
    subghz.setFrequency(frequencies[frequencyIndex]);
  } catch (err17) {
    subState.lastRawPreview = "INIT ERR";
  }

  refreshSystemState();
  render();
}

applyTheme(1);
loadConfig();
showBootScreen();
initialize();

while (running) {
  /*
   * BACK has absolute priority. This check happens before encoder,
   * select, and active scanning so no page-specific task can swallow it.
   */
  if (isBackPressed()) {
    handleEsc();
    consumeBackPress();
    delay(90);
    continue;
  }

  if (keyboard.getNextPress()) {
    handleNext();
    delay(75);
    continue;
  }

  if (keyboard.getPrevPress()) {
    handlePrev();
    delay(75);
    continue;
  }

  /*
   * Always use edge-triggered SELECT handling. Bruce's hold=true input
   * mode may stay true while any physical button is held, which can make
   * BACK look like SELECT on active pages. Keeping all action dispatch
   * edge-triggered makes input semantics identical on every subpage.
   */
  if (keyboard.getSelPress()) {
    handleSelect();
    delay(130);
    continue;
  }

  /*
   * Active RF work always runs last, after every navigation input check.
   */
  if (runActivePageTask()) {
    continue;
  }

  delay(20);
}

clearScreen();
display.setTextAlign("center", "middle");
display.setTextSize(1);
display.setTextColor(colors.text);
display.drawText(
  "RF Environment closed",
  Math.floor(screenW() / 2),
  Math.floor(screenH() / 2)
);
display.setTextAlign("left", "top");
delay(300);
