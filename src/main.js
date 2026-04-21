const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification
} = require("electron");

const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const Store = require("electron-store").default;

const store = new Store();

let win;
let tray;
let timer = null;
let busy = false;

function defaultSettings() {
  return {
    interval: 60000,
    autoLaunch: false,
    startMinimized: false,
    notifyHighOnly: false,
    volume: 100,
    tts: false,
    quietStart: "22:00",
    quietEnd: "07:00",
    sounds: {
      HIGH: null,
      MEDIUM: null,
      LOW: null
    }
  };
}

function settings() {
  return { ...defaultSettings(), ...(store.get("settings") || {}) };
}

function send(channel, data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function addLog(text) {
  const logs = store.get("logs") || [];
  logs.unshift({
    time: new Date().toLocaleString(),
    text
  });
  store.set("logs", logs.slice(0, 200));
  send("logs", store.get("logs"));
}

function applyStartupSetting() {
  const set = settings();
  app.setLoginItemSettings({
    openAtLogin: !!set.autoLaunch,
    openAsHidden: !!set.startMinimized
  });
}

function createWindow() {
  const set = settings();

  win = new BrowserWindow({
    width: 1180,
    height: 820,
    title: "feretory",
    show: !set.startMinimized,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");

  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets", "tray.png"));

  const menu = Menu.buildFromTemplate([
    {
      label: "Open feretory",
      click: () => {
        if (win) win.show();
      }
    },
    {
      label: "Scan Now",
      click: () => {
        scan();
      }
    },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip("feretory");
  tray.setContextMenu(menu);

  tray.on("double-click", () => {
    if (win) win.show();
  });
}

function score(text) {
  const t = text.toLowerCase();
  let s = 0;

  if (t.includes("free")) s += 15;
  if (t.includes("claim")) s += 12;
  if (t.includes("reward")) s += 10;
  if (t.includes("cosmetic")) s += 12;
  if (t.includes("shop")) s += 10;
  if (t.includes("limited")) s += 8;
  if (t.includes("mount")) s += 6;
  if (t.includes("skin")) s += 6;
  if (t.includes("bundle")) s += 5;

  if (t.includes("patch notes")) s -= 8;
  if (t.includes("build guide")) s -= 8;
  if (t.includes("tier list")) s -= 8;

  return s;
}

function level(scoreValue) {
  if (scoreValue >= 28) return "HIGH";
  if (scoreValue >= 16) return "MEDIUM";
  return "LOW";
}

function inQuietHours() {
  const set = settings();

  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = set.quietStart.split(":").map(Number);
  const [eh, em] = set.quietEnd.split(":").map(Number);

  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function getExternalPluginsDir() {
  return path.join(app.getPath("userData"), "plugins");
}

function getBundledDefaultPluginsDir() {
  return path.join(__dirname, "plugins-default");
}

function ensureExternalPluginFolder() {
  const externalDir = getExternalPluginsDir();

  if (!fs.existsSync(externalDir)) {
    fs.mkdirSync(externalDir, { recursive: true });
  }

  return externalDir;
}

function seedDefaultPlugins() {
  const externalDir = ensureExternalPluginFolder();
  const bundledDir = getBundledDefaultPluginsDir();

  try {
    if (!fs.existsSync(bundledDir)) {
      addLog("Bundled default plugins folder not found");
      return;
    }

    const files = fs.readdirSync(bundledDir).filter((file) => file.endsWith(".json"));

    for (const file of files) {
      const sourcePath = path.join(bundledDir, file);
      const destPath = path.join(externalDir, file);

      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  } catch (err) {
    addLog(`Plugin seed failed: ${err.message}`);
  }
}

function loadPlugins() {
  const pluginsDir = ensureExternalPluginFolder();

  try {
    const files = fs.readdirSync(pluginsDir)
      .filter((file) => file.endsWith(".json"));

    const plugins = files.map((file) => {
      const fullPath = path.join(pluginsDir, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw);
    });

    const enabled = plugins.filter((plugin) => plugin.enabled);
    addLog(`Loaded ${enabled.length} external plugin source(s)`);
    return enabled;
  } catch (err) {
    addLog(`Plugin load failed: ${err.message}`);
    return [];
  }
}

async function getHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "feretory/1.2.0"
      }
    });
    return res.data;
  } catch {
    addLog(`Fetch failed: ${url}`);
    return null;
  }
}

function parseHTML(html, selectors = ["h1", "h2", "h3", "a", "p"]) {
  const $ = cheerio.load(html);
  const out = [];
  const selectorString = selectors.join(",");

  $(selectorString).each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 8 && text.length < 160) {
      out.push(text);
    }
  });

  return out;
}

async function getJSON(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "feretory/1.2.0"
      }
    });
    return res.data;
  } catch {
    addLog(`JSON fetch failed: ${url}`);
    return null;
  }
}

function getNestedValue(obj, pathStr) {
  return pathStr.split(".").reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

function parseJSONWithPlugin(json, plugin) {
  const out = [];
  const items = getNestedValue(json, plugin.jsonPath);

  if (!Array.isArray(items)) return out;

  for (const item of items) {
    const value = getNestedValue(item, plugin.jsonField);
    if (typeof value === "string" && value.trim().length > 8) {
      out.push(value.trim());
    }
  }

  return out;
}

async function scan() {
  if (busy) {
    addLog("Scan skipped: already running");
    return;
  }

  busy = true;
  addLog("Scan started");

  try {
    send("stage", "Scanning...");
    send("progress", 10);

    const seen = store.get("seen") || {};
    let found = [];
    const sources = loadPlugins();

    if (sources.length === 0) {
      addLog("No plugins enabled");
    }

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const baseProgress = 20;
      const progressStep = sources.length > 0 ? Math.floor(60 / sources.length) : 0;

      send("stage", `Checking ${src.name}`);
      send("progress", baseProgress + i * progressStep);

      let items = [];

      if (src.type === "html") {
        const html = await getHTML(src.url);
        if (html) {
          items = parseHTML(html, src.selectors || ["h1", "h2", "h3", "a", "p"]);
        }
      }

      if (src.type === "json") {
        const json = await getJSON(src.url);
        if (json) {
          items = parseJSONWithPlugin(json, src);
        }
      }

      for (const text of items) {
        const key = `${src.name}:${text.toLowerCase()}`;
        if (seen[key]) continue;

        const s = score(text);

        if (s >= 10) {
          found.push({
            text,
            source: src.name,
            score: s,
            level: level(s),
            time: new Date().toLocaleTimeString()
          });

          seen[key] = true;
        }
      }
    }

    found.sort((a, b) => b.score - a.score);

    const history = store.get("history") || [];
    const merged = [...found, ...history].slice(0, 100);

    store.set("history", merged);
    store.set("seen", seen);

    send("results", merged);
    send("progress", 100);
    send("stage", "Complete");

    addLog(`Scan complete (${found.length} new)`);

    if (found.length) {
      const top = found[0];
      const set = settings();

      const shouldNotify = !set.notifyHighOnly || top.level === "HIGH";

      if (shouldNotify) {
        new Notification({
          title: "feretory alert",
          body: top.text
        }).show();

        addLog(`Notification: ${top.level} - ${top.text}`);

        if (!inQuietHours()) {
          send("play-alert", top.level);
        } else {
          addLog("Sound suppressed by quiet hours");
        }
      }
    }
  } finally {
    busy = false;
  }
}

function loop() {
  if (timer) clearInterval(timer);

  const set = settings();
  scan();
  timer = setInterval(scan, set.interval);
}

ipcMain.on("manual-scan", scan);

ipcMain.on("save-settings", (_e, data) => {
  const next = {
    ...defaultSettings(),
    ...data,
    sounds: {
      ...defaultSettings().sounds,
      ...(data.sounds || {})
    }
  };

  store.set("settings", next);
  applyStartupSetting();
  addLog("Settings saved");
  send("settings", next);
  loop();
});

ipcMain.on("request-cache", () => {
  send("settings", settings());
  send("results", store.get("history") || []);
  send("logs", store.get("logs") || []);
  send("stage", "Ready");
  send("progress", 0);
  send("plugin-folder", getExternalPluginsDir());
});

ipcMain.on("list-plugins", () => {
  send("plugins", loadPlugins());
});

app.whenReady().then(() => {
  applyStartupSetting();
  seedDefaultPlugins();
  createWindow();
  createTray();
  loop();
});

app.on("window-all-closed", (e) => e.preventDefault());
