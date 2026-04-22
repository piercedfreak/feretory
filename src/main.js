const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store').default;
const cheerio = require('cheerio');

const store = new Store({
  defaults: {
    scanIntervalMinutes: 5,
    autoScanEnabled: false,
    notificationsEnabled: true,
    lastScanAt: null,
    pluginsDirectoryOverride: '',
    window: {
      width: 1280,
      height: 900
    },
    dedupe: {
      history: [],
      maxEntries: 4000
    }
  }
});

let mainWindow = null;
let scanTimer = null;
let isScanning = false;

function getAssetPath(...parts) {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, ...parts);
}

function getIconPath() {
  const icoPath = getAssetPath('assets', 'icon.ico');
  const pngPath = getAssetPath('assets', 'icon.png');

  if (fs.existsSync(icoPath)) return icoPath;
  if (fs.existsSync(pngPath)) return pngPath;
  return undefined;
}

function getDefaultPluginsDir() {
  if (app.isPackaged) {
    const packagedPlugins = path.join(process.resourcesPath, 'plugins');
    if (fs.existsSync(packagedPlugins)) return packagedPlugins;
  }
  return path.join(app.getAppPath(), 'plugins');
}

function getPluginsDir() {
  const overrideDir = store.get('pluginsDirectoryOverride');
  if (overrideDir && fs.existsSync(overrideDir)) return overrideDir;
  return getDefaultPluginsDir();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeJsonParse(content, fallback = null) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function normalizeUrl(relativeOrAbsolute, baseUrl) {
  if (!relativeOrAbsolute) return '';
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return String(relativeOrAbsolute);
  }
}

function deepGet(obj, pathString) {
  if (!pathString || pathString === '$') return obj;

  const path = String(pathString)
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .split('.')
    .filter(Boolean);

  let current = obj;

  for (const key of path) {
    if (current == null) return undefined;

    const arrayMatch = key.match(/^([^[\]]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const index = Number(arrayMatch[2]);
      current = current[prop];
      if (!Array.isArray(current)) return undefined;
      current = current[index];
      continue;
    }

    current = current[key];
  }

  return current;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function applyTemplate(template, sourceObj) {
  if (!template) return '';
  return String(template).replace(/\{([^}]+)\}/g, (_match, keyPath) => {
    const value = deepGet(sourceObj, String(keyPath).trim());
    return value == null ? '' : String(value);
  });
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function loadPlugins() {
  const pluginsDir = getPluginsDir();
  ensureDir(pluginsDir);

  const files = fs.readdirSync(pluginsDir).filter(file => file.toLowerCase().endsWith('.json'));
  const plugins = [];

  for (const file of files) {
    const fullPath = path.join(pluginsDir, file);

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const plugin = safeJsonParse(content);

      if (!plugin || typeof plugin !== 'object') {
        throw new Error('Invalid JSON object');
      }

      if (!plugin.id || !plugin.name || !plugin.url) {
        throw new Error('Plugin must include id, name, and url');
      }

      const type = String(plugin.type || '').trim();
      if (!['json-feed', 'html-feed'].includes(type)) {
        throw new Error('Plugin type must be json-feed or html-feed');
      }

      plugins.push({
        fileName: file,
        fullPath,
        invalid: false,
        enabled: plugin.enabled !== false,
        id: String(plugin.id),
        name: String(plugin.name),
        description: String(plugin.description || ''),
        url: String(plugin.url),
        headers: plugin.headers || {},
        timeoutMs: Number(plugin.timeoutMs || 20000),
        type,
        linkTemplate: String(plugin.linkTemplate || ''),
        itemPath: String(plugin.itemPath || '$'),
        fields: {
          id: String(plugin.fields?.id || ''),
          title: String(plugin.fields?.title || ''),
          body: String(plugin.fields?.body || ''),
          link: String(plugin.fields?.link || '')
        },
        score: {
          terms: plugin.score?.terms || {},
          penalties: plugin.score?.penalties || {},
          titleMultiplier: Number(plugin.score?.titleMultiplier || 2),
          bodyMultiplier: Number(plugin.score?.bodyMultiplier || 1),
          minimumScore: Number(plugin.score?.minimumScore || 7)
        },
        dedupeHours: Number(plugin.dedupeHours || 168),
        notifications: plugin.notifications !== false
      });
    } catch (error) {
      plugins.push({
        fileName: file,
        fullPath,
        invalid: true,
        enabled: false,
        id: `invalid-${file}`,
        name: file,
        description: `Invalid plugin: ${error.message}`,
        url: ''
      });
    }
  }

  return plugins;
}

function getHistory() {
  const dedupe = store.get('dedupe') || {};
  return Array.isArray(dedupe.history) ? dedupe.history : [];
}

function saveHistory(history) {
  const dedupe = store.get('dedupe') || {};
  const maxEntries = Number(dedupe.maxEntries || 4000);

  store.set('dedupe', {
    ...dedupe,
    history: history.slice(-maxEntries),
    maxEntries
  });
}

function purgeExpiredHistory() {
  const now = Date.now();
  const history = getHistory().filter(entry => {
    if (!entry || !entry.expiresAt) return false;
    return new Date(entry.expiresAt).getTime() > now;
  });
  saveHistory(history);
}

async function fetchRemote(plugin) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), plugin.timeoutMs);

  try {
    const response = await fetch(plugin.url, {
      method: 'GET',
      headers: plugin.headers,
      signal: controller.signal
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
      contentType: response.headers.get('content-type') || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonFeedItems(parsedJson, plugin) {
  const sourceItems = asArray(deepGet(parsedJson, plugin.itemPath));
  const items = [];

  for (const rawItem of sourceItems) {
    const title = normalizeText(deepGet(rawItem, plugin.fields.title));
    const body = normalizeText(deepGet(rawItem, plugin.fields.body));
    const rawLink = plugin.linkTemplate
      ? applyTemplate(plugin.linkTemplate, rawItem)
      : deepGet(rawItem, plugin.fields.link);
    const link = normalizeUrl(String(rawLink || ''), plugin.url);
    const itemId = normalizeText(deepGet(rawItem, plugin.fields.id));

    items.push({
      itemId,
      title,
      body,
      link,
      raw: rawItem
    });
  }

  return items;
}

function extractHtmlFeedItems(html, plugin) {
  const $ = cheerio.load(html);
  const text = normalizeText($.text());

  return [{
    itemId: sha1(`${plugin.id}|${text.slice(0, 2000)}`),
    title: plugin.name,
    body: text,
    link: plugin.url,
    raw: null
  }];
}

function scoreTextBlock(text, weightedTerms, multiplier) {
  let score = 0;
  const matched = [];
  const haystack = String(text || '').toLowerCase();

  for (const [term, weight] of Object.entries(weightedTerms)) {
    const needle = String(term).toLowerCase().trim();
    if (!needle) continue;
    if (haystack.includes(needle)) {
      const weightedScore = Number(weight) * multiplier;
      score += weightedScore;
      matched.push({
        term,
        score: weightedScore
      });
    }
  }

  return { score, matched };
}

function scoreItem(plugin, item) {
  const positiveTerms = plugin.score.terms || {};
  const negativeTerms = plugin.score.penalties || {};

  const titleHit = scoreTextBlock(item.title, positiveTerms, plugin.score.titleMultiplier);
  const bodyHit = scoreTextBlock(item.body, positiveTerms, plugin.score.bodyMultiplier);

  const titlePenalty = scoreTextBlock(item.title, negativeTerms, plugin.score.titleMultiplier);
  const bodyPenalty = scoreTextBlock(item.body, negativeTerms, plugin.score.bodyMultiplier);

  const totalScore =
    titleHit.score +
    bodyHit.score +
    titlePenalty.score +
    bodyPenalty.score;

  const matchedPositive = [...titleHit.matched, ...bodyHit.matched];
  const matchedNegative = [...titlePenalty.matched, ...bodyPenalty.matched];

  return {
    ...item,
    score: totalScore,
    matchedPositive,
    matchedNegative,
    passed: totalScore >= plugin.score.minimumScore
  };
}

function createDedupeKey(plugin, item) {
  const base = item.itemId
    ? `${plugin.id}|${item.itemId}`
    : `${plugin.id}|${item.title}|${item.link}`;

  return sha1(base);
}

function applyDedupe(plugin, items) {
  purgeExpiredHistory();

  const history = getHistory();
  const seen = new Set(history.map(entry => entry.key));
  const ttlMs = Math.max(1, Number(plugin.dedupeHours || 168)) * 60 * 60 * 1000;
  const now = Date.now();

  const freshItems = [];
  const duplicateItems = [];
  const newHistory = [...history];

  for (const item of items) {
    const dedupeKey = createDedupeKey(plugin, item);
    item.dedupeKey = dedupeKey;

    if (seen.has(dedupeKey)) {
      duplicateItems.push(item);
      continue;
    }

    freshItems.push(item);
    newHistory.push({
      key: dedupeKey,
      pluginId: plugin.id,
      title: item.title || '',
      link: item.link || '',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString()
    });
    seen.add(dedupeKey);
  }

  saveHistory(newHistory);

  return {
    freshItems,
    duplicateItems
  };
}

function showNotifications(plugin, items) {
  const appNotificationsEnabled = Boolean(store.get('notificationsEnabled'));
  if (!appNotificationsEnabled) return;
  if (!plugin.notifications) return;
  if (!Notification.isSupported()) return;

  const toNotify = items.slice(0, 3);

  for (const item of toNotify) {
    const summary = item.matchedPositive
      .slice(0, 3)
      .map(x => x.term)
      .join(', ');

    const notification = new Notification({
      title: `${plugin.name} (${item.score})`,
      body: summary ? `${item.title} • ${summary}` : item.title || 'New match found',
      icon: getIconPath(),
      silent: false
    });

    if (item.link) {
      notification.on('click', () => {
        shell.openExternal(item.link).catch(() => {});
      });
    }

    notification.show();
  }
}

async function runPlugin(plugin) {
  if (!plugin.enabled) {
    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      ok: false,
      skipped: true,
      reason: 'Plugin disabled',
      freshMatches: [],
      duplicateMatches: []
    };
  }

  if (plugin.invalid) {
    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      ok: false,
      skipped: true,
      reason: 'Plugin invalid',
      freshMatches: [],
      duplicateMatches: []
    };
  }

  try {
    const response = await fetchRemote(plugin);

    let extractedItems = [];

    if (plugin.type === 'json-feed') {
      const parsed = safeJsonParse(response.text, null);
      if (!parsed) {
        throw new Error('Response was not valid JSON');
      }
      extractedItems = extractJsonFeedItems(parsed, plugin);
    } else if (plugin.type === 'html-feed') {
      extractedItems = extractHtmlFeedItems(response.text, plugin);
    } else {
      throw new Error(`Unsupported plugin type: ${plugin.type}`);
    }

    const scoredItems = extractedItems
      .map(item => scoreItem(plugin, item))
      .filter(item => item.passed)
      .sort((a, b) => b.score - a.score);

    const { freshItems, duplicateItems } = applyDedupe(plugin, scoredItems);
    showNotifications(plugin, freshItems);

    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      fetchedUrl: plugin.url,
      type: plugin.type,
      extractedCount: extractedItems.length,
      passedCount: scoredItems.length,
      freshCount: freshItems.length,
      duplicateCount: duplicateItems.length,
      freshMatches: freshItems,
      duplicateMatches: duplicateItems
    };
  } catch (error) {
    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      ok: false,
      type: plugin.type,
      error: error.message,
      freshMatches: [],
      duplicateMatches: []
    };
  }
}

async function runFullScan() {
  if (isScanning) {
    return {
      ok: false,
      busy: true,
      message: 'Scan already running'
    };
  }

  isScanning = true;

  try {
    const startedAt = new Date().toISOString();
    const plugins = loadPlugins();
    const enabledPlugins = plugins.filter(p => p.enabled && !p.invalid);

    const results = [];
    for (const plugin of enabledPlugins) {
      const result = await runPlugin(plugin);
      results.push(result);
    }

    const freshFound = results.flatMap(r =>
      (r.freshMatches || []).map(item => ({
        pluginId: r.pluginId,
        pluginName: r.pluginName,
        title: item.title || '',
        body: item.body || '',
        link: item.link || '',
        score: item.score || 0,
        matchedPositive: item.matchedPositive || [],
        matchedNegative: item.matchedNegative || [],
        dedupeKey: item.dedupeKey || ''
      }))
    ).sort((a, b) => b.score - a.score);

    const duplicateFound = results.flatMap(r =>
      (r.duplicateMatches || []).map(item => ({
        pluginId: r.pluginId,
        pluginName: r.pluginName,
        title: item.title || '',
        body: item.body || '',
        link: item.link || '',
        score: item.score || 0,
        matchedPositive: item.matchedPositive || [],
        matchedNegative: item.matchedNegative || [],
        dedupeKey: item.dedupeKey || ''
      }))
    ).sort((a, b) => b.score - a.score);

    const finishedAt = new Date().toISOString();

    const payload = {
      ok: true,
      startedAt,
      finishedAt,
      pluginCount: enabledPlugins.length,
      totalFreshMatches: freshFound.length,
      totalDuplicateMatches: duplicateFound.length,
      results,
      freshFound,
      duplicateFound
    };

    store.set('lastScanAt', finishedAt);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-complete', payload);
    }

    return payload;
  } finally {
    isScanning = false;
  }
}

function clearScanTimer() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

function startScanTimer() {
  clearScanTimer();

  const autoScanEnabled = Boolean(store.get('autoScanEnabled'));
  const scanIntervalMinutes = Number(store.get('scanIntervalMinutes') || 5);

  if (!autoScanEnabled || scanIntervalMinutes <= 0) return;

  scanTimer = setInterval(async () => {
    if (!isScanning) {
      await runFullScan();
    }
  }, scanIntervalMinutes * 60 * 1000);
}

function createWindow() {
  const savedWindow = store.get('window') || {};
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: savedWindow.width || 1280,
    height: savedWindow.height || 900,
    minWidth: 980,
    minHeight: 700,
    title: 'feretory',
    icon: iconPath,
    backgroundColor: '#101317',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(app.getAppPath(), 'index.html'));

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    store.set('window', { width, height });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  purgeExpiredHistory();
  startScanTimer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:get-state', async () => {
  const plugins = loadPlugins();
  purgeExpiredHistory();

  return {
    appName: 'feretory',
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    pluginsDir: getPluginsDir(),
    settings: {
      scanIntervalMinutes: Number(store.get('scanIntervalMinutes') || 5),
      autoScanEnabled: Boolean(store.get('autoScanEnabled')),
      notificationsEnabled: Boolean(store.get('notificationsEnabled')),
      lastScanAt: store.get('lastScanAt') || null,
      pluginsDirectoryOverride: store.get('pluginsDirectoryOverride') || ''
    },
    dedupeStats: {
      historyCount: getHistory().length,
      maxEntries: Number((store.get('dedupe') || {}).maxEntries || 4000)
    },
    plugins: plugins.map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      enabled: plugin.enabled,
      invalid: Boolean(plugin.invalid),
      fileName: plugin.fileName,
      url: plugin.url || '',
      type: plugin.type || '',
      minimumScore: plugin.score?.minimumScore || 0
    }))
  };
});

ipcMain.handle('scan:run', async () => {
  return await runFullScan();
});

ipcMain.handle('settings:update', async (_event, partialSettings) => {
  if (typeof partialSettings.scanIntervalMinutes !== 'undefined') {
    const minutes = Math.max(1, Number(partialSettings.scanIntervalMinutes) || 5);
    store.set('scanIntervalMinutes', minutes);
  }

  if (typeof partialSettings.autoScanEnabled !== 'undefined') {
    store.set('autoScanEnabled', Boolean(partialSettings.autoScanEnabled));
  }

  if (typeof partialSettings.notificationsEnabled !== 'undefined') {
    store.set('notificationsEnabled', Boolean(partialSettings.notificationsEnabled));
  }

  if (typeof partialSettings.pluginsDirectoryOverride !== 'undefined') {
    store.set('pluginsDirectoryOverride', String(partialSettings.pluginsDirectoryOverride || ''));
  }

  startScanTimer();

  return {
    ok: true,
    settings: {
      scanIntervalMinutes: Number(store.get('scanIntervalMinutes') || 5),
      autoScanEnabled: Boolean(store.get('autoScanEnabled')),
      notificationsEnabled: Boolean(store.get('notificationsEnabled')),
      lastScanAt: store.get('lastScanAt') || null,
      pluginsDirectoryOverride: store.get('pluginsDirectoryOverride') || ''
    },
    pluginsDir: getPluginsDir()
  };
});

ipcMain.handle('plugins:choose-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }

  const chosen = result.filePaths[0];
  store.set('pluginsDirectoryOverride', chosen);

  return {
    ok: true,
    path: chosen
  };
});

ipcMain.handle('plugins:reload', async () => {
  const plugins = loadPlugins();

  return {
    ok: true,
    pluginsDir: getPluginsDir(),
    plugins: plugins.map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      enabled: plugin.enabled,
      invalid: Boolean(plugin.invalid),
      fileName: plugin.fileName,
      url: plugin.url || '',
      type: plugin.type || '',
      minimumScore: plugin.score?.minimumScore || 0
    }))
  };
});

ipcMain.handle('dedupe:clear', async () => {
  store.set('dedupe', {
    ...(store.get('dedupe') || {}),
    history: []
  });

  return {
    ok: true,
    historyCount: 0
  };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (!url || typeof url !== 'string') return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') return { ok: false };
  await shell.openPath(targetPath);
  return { ok: true };
});
