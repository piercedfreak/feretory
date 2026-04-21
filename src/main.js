const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification
} = require("electron");

const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const Store = require("electron-store").default;

const store = new Store();

let win;
let tray;
let timer = null;
let busy = false;

const SOURCES = [
  { name: "Blizzard News", url: "https://news.blizzard.com/en-us/diablo4", type: "html" },
  { name: "Forums", url: "https://us.forums.blizzard.com/en/d4/", type: "html" },
  { name: "Reddit", url: "https://www.reddit.com/r/diablo4/new/.json", type: "json" }
];

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

async function getHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "feretory/1.0.0"
      }
    });
    return res.data;
  } catch {
    addLog(`Fetch failed: ${url}`);
    return null;
  }
}

function parseHTML(html) {
  const $ = cheerio.load(html);
  const out = [];

  $("h1,h2,h3,a,p").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 8 && text.length < 160) out.push(text);
  });

  return out;
}

async function getJSON(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "feretory/1.0.0"
      }
    });
    return res.data;
  } catch {
    addLog(`JSON fetch failed: ${url}`);
    return null;
  }
}

function parseReddit(json) {
  const out = [];
  try {
    json.data.children.forEach((post) => {
      out.push(post.data.title);
    });
  } catch {
    addLog("Reddit parse failed");
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

    for (let i = 0; i < SOURCES.length; i++) {
      const src = SOURCES[i];

      send("stage", `Checking ${src.name}`);
      send("progress", 25 + i * 20);

      let items = [];

      if (src.type === "html") {
        const html = await getHTML(src.url);
        if (html) items = parseHTML(html);
      }

      if (src.type === "json") {
        const json = await getJSON(src.url);
        if (json) items = parseReddit(json);
      }

      for (const text of items) {
        const key = text.toLowerCase();
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
});

app.whenReady().then(() => {
  applyStartupSetting();
  createWindow();
  createTray();
  loop();
});

app.on("window-all-closed", (e) => e.preventDefault());
