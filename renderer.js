let persistentResults = [];
const $ = (selector) => document.querySelector(selector);

let currentEffectiveSoundPath = '';

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

function installPanelCollapseStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .panel > h2 {
      cursor: pointer;
      user-select: none;
    }

    .panel > h2::after {
      content: " ▾";
      color: var(--muted);
      font-size: 13px;
    }

    .panel.collapsed > h2 {
      margin-bottom: 0;
    }

    .panel.collapsed > h2::after {
      content: " ▸";
    }

    .panel.collapsed > :not(h2) {
      display: none !important;
    }

    .score-badge small {
      display: block;
      font-size: 10px;
      margin-top: 2px;
      color: var(--muted);
    }
  `;
  document.head.appendChild(style);
}

function setBusy(isBusy) {
  $('#scanNowBtn').disabled = isBusy;
  $('#reloadPluginsBtn').disabled = isBusy;
  $('#saveSettingsBtn').disabled = isBusy;
  $('#clearDedupeBtn').disabled = isBusy;

  const clearLearningBtn = $('#clearLearningBtn');
  if (clearLearningBtn) clearLearningBtn.disabled = isBusy;
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

function renderLearningStats(stats) {
  if (!stats) return;

  const feedbackCount = $('#learningFeedbackCount');
  const termCount = $('#learningTermCount');
  const topTerms = $('#topLearnedTerms');

  if (!feedbackCount || !termCount || !topTerms) return;

  feedbackCount.textContent = String(stats.feedbackCount || 0);
  termCount.textContent = String(stats.learnedTermCount || 0);

  const boosted = (stats.boosted || [])
    .slice(0, 5)
    .map(x => `${x.term} +${x.weight}`);

  const penalized = (stats.penalized || [])
    .slice(0, 5)
    .map(x => `${x.term} ${x.weight}`);

  const terms = [...boosted, ...penalized];
  topTerms.textContent = terms.length ? terms.join(', ') : '(none yet)';
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

  if (payload.learningStats) {
    renderLearningStats(payload.learningStats);
  }

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

    // add new results without duplicates
for (const item of payload.freshFound) {
  if (!persistentResults.find(x => x.dedupeKey === item.dedupeKey)) {
    persistentResults.push(item);
  }
}

// render everything we have
for (const item of persistentResults) {
	const positive = (item.matchedPositive || [])
      .map(x => `<span class="term positive">+${escapeHtml(x.term)} (${escapeHtml(x.score)})</span>`)
      .join('');

    const negative = (item.matchedNegative || [])
      .map(x => `<span class="term negative">${escapeHtml(x.term)} (${escapeHtml(x.score)})</span>`)
      .join('');

    const learning = (item.learningHits || [])
      .map(x => `<span class="term">${escapeHtml(x.term)} (${escapeHtml(x.score)})</span>`)
      .join('');

    const itemJson = escapeHtmlAttr(JSON.stringify(item));
    const learnedScore = Number(item.learnedScore || 0);

    const card = document.createElement('div');
    card.className = 'result-card';

    card.innerHTML = `
      <div class="result-top">
        <div class="result-top-left">
          <div class="result-title">${escapeHtml(item.title || '(untitled)')}</div>
          <div class="result-source">${escapeHtml(item.pluginName || '')}</div>
        </div>
        <div class="score-badge">
          ${escapeHtml(item.score || 0)}
          ${learnedScore !== 0 ? `<small>${learnedScore > 0 ? '+' : ''}${escapeHtml(learnedScore)} learned</small>` : ''}
        </div>
      </div>

      ${item.link ? `
        <div class="result-link-row">
          <a href="#" class="external-link" data-url="${escapeHtmlAttr(item.link)}">${escapeHtml(item.link)}</a>
        </div>
      ` : ''}

      ${item.body ? `<div class="result-body">${escapeHtml(String(item.body).slice(0, 300))}</div>` : ''}

      ${positive ? `<div class="term-group"><strong>Matched:</strong> ${positive}</div>` : ''}
      ${negative ? `<div class="term-group"><strong>Penalties:</strong> ${negative}</div>` : ''}
      ${learnedScore !== 0 ? `<div class="term-group"><strong>Learning:</strong> ${learning || escapeHtml(learnedScore)}</div>` : ''}

      <div class="term-group">
        <button class="learn-btn" data-vote="up" data-item="${itemJson}">Useful</button>
        <button class="learn-btn" data-vote="down" data-item="${itemJson}">Not useful</button>
      </div>
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

  for (const button of list.querySelectorAll('.learn-btn')) {
    button.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const vote = target.getAttribute('data-vote');
      const item = JSON.parse(target.getAttribute('data-item') || '{}');

      const result = await window.feretoryAPI.sendLearningFeedback(item, vote);
     
	    if (result.ok) {
  const card = target.closest('.result-card');
  if (card) card.remove();

  persistentResults = persistentResults.filter(x => x.dedupeKey !== item.dedupeKey);
}
      if (result.ok && result.learningStats) {
        renderLearningStats(result.learningStats);
      }

      $('#summaryText').textContent = result.ok
        ? vote === 'up'
          ? 'Learned: show more results like that.'
          : 'Learned: avoid results like that.'
        : result.error || 'Learning failed.';
    });
  }
}

async function playSound(filePath, volumePercent) {
  if (!filePath) return;

  try {
    const audio = new Audio(`file:///${filePath.replace(/\\/g, '/')}`);
    audio.volume = Math.max(0, Math.min(1, Number(volumePercent || 0) / 100));
    await audio.play();
  } catch (error) {
    console.warn('Sound playback failed:', error);
  }
}

async function refreshAppState() {
  const appState = await window.feretoryAPI.getState();

  $('#autoScanEnabled').checked = !!appState.settings.autoScanEnabled;
  $('#notificationsEnabled').checked = !!appState.settings.notificationsEnabled;
  $('#minimizeToTray').checked = !!appState.settings.minimizeToTray;
  $('#soundEnabled').checked = !!appState.settings.soundEnabled;
  $('#soundVolume').value = Number(appState.settings.soundVolume || 70);
  $('#soundVolumeValue').textContent = `${Number(appState.settings.soundVolume || 70)}%`;

  $('#scanIntervalMinutes').value = Number(appState.settings.scanIntervalMinutes || 5);
  $('#lastScanAt').textContent = formatDateTime(appState.settings.lastScanAt);
  $('#pluginsDir').textContent = appState.pluginsDir || '(unknown)';
  $('#historyCount').textContent = String(appState.dedupeStats?.historyCount || 0);

  renderLearningStats(appState.learningStats);

  currentEffectiveSoundPath = appState.settings.effectiveSoundPath || '';
  $('#soundFilePath').textContent = appState.settings.soundFilePath || (currentEffectiveSoundPath || '(bundled default or none)');

  renderPlugins(appState.plugins || []);
}

async function saveSettings() {
  const autoScanEnabled = $('#autoScanEnabled').checked;
  const notificationsEnabled = $('#notificationsEnabled').checked;
  const minimizeToTray = $('#minimizeToTray').checked;
  const soundEnabled = $('#soundEnabled').checked;
  const soundVolume = Number($('#soundVolume').value || 70);
  const scanIntervalMinutes = Number($('#scanIntervalMinutes').value || 5);

  const result = await window.feretoryAPI.updateSettings({
    autoScanEnabled,
    notificationsEnabled,
    minimizeToTray,
    soundEnabled,
    soundVolume,
    scanIntervalMinutes
  });

  $('#lastScanAt').textContent = formatDateTime(result.settings.lastScanAt);
  $('#pluginsDir').textContent = result.pluginsDir || '(unknown)';
  currentEffectiveSoundPath = result.settings.effectiveSoundPath || currentEffectiveSoundPath;
  $('#soundFilePath').textContent = result.settings.soundFilePath || (currentEffectiveSoundPath || '(bundled default or none)');
  $('#summaryText').textContent = 'Settings saved.';
}

async function runScan() {
  setBusy(true);
  $('#summaryText').textContent = 'Scanning...';

  try {
    const payload = await window.feretoryAPI.runScan();
    renderResults(payload);

    if (payload.sound?.shouldPlay && payload.sound?.filePath) {
      await playSound(payload.sound.filePath, payload.sound.volume);
    }

    const latest = await window.feretoryAPI.getState();
    $('#lastScanAt').textContent = formatDateTime(latest.settings.lastScanAt);
    $('#historyCount').textContent = String(latest.dedupeStats?.historyCount || 0);
    renderLearningStats(latest.learningStats);
    currentEffectiveSoundPath = latest.settings.effectiveSoundPath || currentEffectiveSoundPath;
    $('#soundFilePath').textContent = latest.settings.soundFilePath || (currentEffectiveSoundPath || '(bundled default or none)');
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

async function chooseSoundFile() {
  const result = await window.feretoryAPI.chooseSoundFile();
  if (result.ok && result.path) {
    currentEffectiveSoundPath = result.effectiveSoundPath || result.path;
    $('#soundFilePath').textContent = result.path;
    $('#summaryText').textContent = 'Sound file updated.';
  }
}

async function clearSoundFile() {
  const result = await window.feretoryAPI.clearSoundFile();
  if (result.ok) {
    currentEffectiveSoundPath = result.effectiveSoundPath || '';
    $('#soundFilePath').textContent = currentEffectiveSoundPath || '(bundled default or none)';
    $('#summaryText').textContent = 'Using bundled/default sound.';
  }
}

async function testSound() {
  const enabled = $('#soundEnabled').checked;
  const volume = Number($('#soundVolume').value || 70);

  if (!enabled) {
    $('#summaryText').textContent = 'Sound is currently disabled.';
    return;
  }

  if (!currentEffectiveSoundPath) {
    $('#summaryText').textContent = 'No sound file found. Add assets/alert.wav or choose a custom file.';
    return;
  }

  await playSound(currentEffectiveSoundPath, volume);
  $('#summaryText').textContent = 'Played test sound.';
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

async function clearLearning() {
  const result = await window.feretoryAPI.clearLearning();

  if (result.ok) {
    renderLearningStats(result.learningStats);
    $('#summaryText').textContent = 'Learning reset.';
  }
}

function bindPanelCollapse() {
  for (const panel of document.querySelectorAll('.sidebar .panel')) {
    const title = panel.querySelector('h2');
    if (!title) continue;

    const panelName = title.textContent.trim();
    const storageKey = `feretory.panel.${panelName}.collapsed`;

    if (localStorage.getItem(storageKey) === 'true') {
      panel.classList.add('collapsed');
    }

    title.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      localStorage.setItem(storageKey, panel.classList.contains('collapsed') ? 'true' : 'false');
    });
  }
}

function bindEvents() {
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#scanNowBtn').addEventListener('click', runScan);
  $('#choosePluginsDirBtn').addEventListener('click', choosePluginsFolder);
  $('#reloadPluginsBtn').addEventListener('click', reloadPlugins);
  $('#clearDedupeBtn').addEventListener('click', clearDedupeHistory);

  const clearLearningBtn = $('#clearLearningBtn');
  if (clearLearningBtn) clearLearningBtn.addEventListener('click', clearLearning);

  $('#chooseSoundBtn').addEventListener('click', chooseSoundFile);
  $('#clearSoundBtn').addEventListener('click', clearSoundFile);
  $('#testSoundBtn').addEventListener('click', testSound);

  $('#soundVolume').addEventListener('input', () => {
    $('#soundVolumeValue').textContent = `${Number($('#soundVolume').value || 70)}%`;
  });

  $('#openPluginsDirBtn').addEventListener('click', async () => {
    const dir = $('#pluginsDir').textContent;
    if (dir && dir !== '(unknown)' && dir !== '(loading)') {
      await window.feretoryAPI.openPath(dir);
    }
  });

  window.feretoryAPI.onScanComplete(async (payload) => {
    renderResults(payload);
    $('#lastScanAt').textContent = formatDateTime(payload.finishedAt);

    if (payload.learningStats) {
      renderLearningStats(payload.learningStats);
    }

    if (payload.sound?.shouldPlay && payload.sound?.filePath) {
      await playSound(payload.sound.filePath, payload.sound.volume);
    }
  });
}

async function init() {
  installPanelCollapseStyles();
  bindEvents();
  bindPanelCollapse();
  await refreshAppState();
}

init();
