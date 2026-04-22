const $ = (selector) => document.querySelector(selector);

function formatDateTime(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function setBusy(isBusy) {
  $('#scanNowBtn').disabled = isBusy;
  $('#reloadPluginsBtn').disabled = isBusy;
  $('#saveSettingsBtn').disabled = isBusy;
  $('#clearDedupeBtn').disabled = isBusy;
}

function renderPlugins(plugins) {
  const root = $('#pluginList');
  root.innerHTML = '';

  if (!plugins || !plugins.length) {
    root.innerHTML = `<div class="empty">No plugins found.</div>`;
    return;
  }

  for (const plugin of plugins) {
    const el = document.createElement('div');
    el.className = `plugin-card ${plugin.invalid ? 'invalid' : ''}`;

    el.innerHTML = `
      <div class="plugin-card-top">
        <strong>${escapeHtml(plugin.name || plugin.id || 'Unnamed')}</strong>
        <span class="badge ${plugin.enabled ? 'on' : 'off'}">${plugin.enabled ? 'enabled' : 'disabled'}</span>
      </div>
      <div class="plugin-file">${escapeHtml(plugin.fileName || '')}</div>
      <div class="plugin-desc">${escapeHtml(plugin.description || '')}</div>
      <div class="plugin-url">${escapeHtml(plugin.url || '')}</div>
      <div class="plugin-mode">type: ${escapeHtml(plugin.type || 'unknown')} • min score: ${escapeHtml(plugin.minimumScore || 0)}</div>
      ${plugin.invalid ? `<div class="plugin-error">Invalid plugin JSON</div>` : ''}
    `;

    root.appendChild(el);
  }
}

function renderResults(payload) {
  const meta = $('#resultsMeta');
  const list = $('#resultsList');

  meta.innerHTML = '';
  list.innerHTML = '';

  if (!payload || !payload.ok) {
    $('#summaryText').textContent = payload?.message || 'No results.';
    return;
  }

  $('#summaryText').textContent =
    `Scan finished. ${payload.totalFreshMatches} new scored hit(s), ${payload.totalDuplicateMatches} duplicate(s).`;

  meta.innerHTML = `
    <div class="meta-pill">Plugins: ${payload.pluginCount}</div>
    <div class="meta-pill">New: ${payload.totalFreshMatches}</div>
    <div class="meta-pill">Duplicates: ${payload.totalDuplicateMatches}</div>
    <div class="meta-pill">Finished: ${escapeHtml(formatDateTime(payload.finishedAt))}</div>
  `;

  if (!payload.freshFound || !payload.freshFound.length) {
    list.innerHTML = `<div class="empty">No new scored matches passed the threshold.</div>`;
    return;
  }

  for (const item of payload.freshFound) {
    const positive = (item.matchedPositive || [])
      .map(x => `<span class="term positive">+${escapeHtml(x.term)} (${escapeHtml(x.score)})</span>`)
      .join('');

    const negative = (item.matchedNegative || [])
      .map(x => `<span class="term negative">${escapeHtml(x.term)} (${escapeHtml(x.score)})</span>`)
      .join('');

    const card = document.createElement('div');
    card.className = 'result-card';

    card.innerHTML = `
      <div class="result-top">
        <div class="result-top-left">
          <div class="result-title">${escapeHtml(item.title || '(untitled)')}</div>
          <div class="result-source">${escapeHtml(item.pluginName || '')}</div>
        </div>
        <div class="score-badge">${escapeHtml(item.score || 0)}</div>
      </div>

      ${item.link ? `
        <div class="result-link-row">
          <a href="#" class="external-link" data-url="${escapeHtmlAttr(item.link)}">${escapeHtml(item.link)}</a>
        </div>
      ` : ''}

      ${item.body ? `<div class="result-body">${escapeHtml(String(item.body).slice(0, 300))}</div>` : ''}

      ${positive ? `<div class="term-group"><strong>Matched:</strong> ${positive}</div>` : ''}
      ${negative ? `<div class="term-group"><strong>Penalties:</strong> ${negative}</div>` : ''}
    `;

    list.appendChild(card);
  }

  for (const link of list.querySelectorAll('.external-link')) {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const url = event.currentTarget.getAttribute('data-url');
      if (url) await window.feretoryAPI.openExternal(url);
    });
  }
}

async function refreshAppState() {
  const appState = await window.feretoryAPI.getState();

  $('#autoScanEnabled').checked = !!appState.settings.autoScanEnabled;
  $('#notificationsEnabled').checked = !!appState.settings.notificationsEnabled;
  $('#scanIntervalMinutes').value = Number(appState.settings.scanIntervalMinutes || 5);
  $('#lastScanAt').textContent = formatDateTime(appState.settings.lastScanAt);
  $('#pluginsDir').textContent = appState.pluginsDir || '(unknown)';
  $('#historyCount').textContent = String(appState.dedupeStats?.historyCount || 0);

  renderPlugins(appState.plugins || []);
}

async function saveSettings() {
  const autoScanEnabled = $('#autoScanEnabled').checked;
  const notificationsEnabled = $('#notificationsEnabled').checked;
  const scanIntervalMinutes = Number($('#scanIntervalMinutes').value || 5);

  const result = await window.feretoryAPI.updateSettings({
    autoScanEnabled,
    notificationsEnabled,
    scanIntervalMinutes
  });

  $('#lastScanAt').textContent = formatDateTime(result.settings.lastScanAt);
  $('#pluginsDir').textContent = result.pluginsDir || '(unknown)';
  $('#summaryText').textContent = 'Settings saved.';
}

async function runScan() {
  setBusy(true);
  $('#summaryText').textContent = 'Scanning...';

  try {
    const payload = await window.feretoryAPI.runScan();
    renderResults(payload);

    const latest = await window.feretoryAPI.getState();
    $('#lastScanAt').textContent = formatDateTime(latest.settings.lastScanAt);
    $('#historyCount').textContent = String(latest.dedupeStats?.historyCount || 0);
  } catch (error) {
    $('#summaryText').textContent = `Scan failed: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function choosePluginsFolder() {
  const result = await window.feretoryAPI.choosePluginsDirectory();
  if (result.ok && result.path) {
    $('#pluginsDir').textContent = result.path;
    await reloadPlugins();
    $('#summaryText').textContent = 'Plugin folder updated.';
  }
}

async function reloadPlugins() {
  const result = await window.feretoryAPI.reloadPlugins();
  $('#pluginsDir').textContent = result.pluginsDir || '(unknown)';
  renderPlugins(result.plugins || []);
  $('#summaryText').textContent = 'Plugins reloaded.';
}

async function clearDedupeHistory() {
  const result = await window.feretoryAPI.clearDedupeHistory();
  if (result.ok) {
    $('#historyCount').textContent = String(result.historyCount || 0);
    $('#summaryText').textContent = 'Dedupe history cleared.';
  }
}

function bindEvents() {
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#scanNowBtn').addEventListener('click', runScan);
  $('#choosePluginsDirBtn').addEventListener('click', choosePluginsFolder);
  $('#reloadPluginsBtn').addEventListener('click', reloadPlugins);
  $('#clearDedupeBtn').addEventListener('click', clearDedupeHistory);

  $('#openPluginsDirBtn').addEventListener('click', async () => {
    const dir = $('#pluginsDir').textContent;
    if (dir && dir !== '(unknown)' && dir !== '(loading)') {
      await window.feretoryAPI.openPath(dir);
    }
  });

  window.feretoryAPI.onScanComplete((payload) => {
    renderResults(payload);
    $('#lastScanAt').textContent = formatDateTime(payload.finishedAt);
  });
}

async function init() {
  bindEvents();
  await refreshAppState();
}

init();
