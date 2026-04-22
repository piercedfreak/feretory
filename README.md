<p align="center">
  <img src="/src/assets/logo.png">
</p>
# feretory

Lightweight desktop scanner for Diablo 4 cosmetics, shop updates, and promotions using a **scored keyword system**.

**Version:** 1.6.0
**Author:** piercedfreak

---

## Overview

feretory scans sources like Reddit and Blizzard forums, scores content using weighted keywords, and alerts only when results are relevant.

Designed to stay:

* simple
* low-noise
* easy to tune
* easy to extend

---

## Features

### 🔍 Scored Matching

* weighted keyword system
* positive + negative terms
* minimum score threshold
* title vs body weighting

### 🔌 Plugin-Based Sources

* JSON feeds (Reddit, APIs)
* HTML fallback scanning
* add/edit sources without code changes

### 🧠 Smart Filtering

* dedupe history (no repeat alerts)
* results sorted by score
* threshold-based filtering

### 🔔 Notifications & Sound

* desktop notifications
* sound on/off
* volume control
* custom sound file support
* bundled fallback sound

### 🖥 Tray Integration

* runs in system tray
* minimize to tray
* quick actions (scan / show / quit)

---

## How It Works

1. Fetch source (JSON or HTML)
2. Extract items
3. Score content:

   * add points for relevant terms
   * subtract for unwanted terms
4. Filter by minimum score
5. remove duplicates
6. notify + display results

---

## Installation

### Download

Get the latest release from GitHub:

* Download the `.exe` installer from the Releases page

### First Run (Important)

Because feretory is **unsigned**, Windows may show a warning.

If that happens:

1. Right-click the installer → **Properties**
2. Check **Unblock** (if present)
3. Click **Apply**
4. Run the installer

Or:

* Click **More info → Run anyway** on the SmartScreen prompt

---

## Usage

* Click **Scan Now** to run manually
* Enable **Auto Scan** for background monitoring
* Adjust interval as needed
* Results are ranked by score

---

## Plugin Format

Plugins live in the `plugins/` folder.

### Example (Reddit)

```json
{
  "id": "reddit-diablo4",
  "name": "Reddit Diablo 4",
  "enabled": true,
  "url": "https://www.reddit.com/r/diablo4/new/.json",
  "headers": {
    "accept": "application/json",
    "user-agent": "feretory/1.6.0"
  },
  "type": "json-feed",
  "linkTemplate": "https://www.reddit.com{data.permalink}",
  "itemPath": "data.children",
  "fields": {
    "title": "data.title",
    "body": "data.selftext",
    "link": "data.permalink",
    "id": "data.id"
  },
  "score": {
    "terms": {
      "free cosmetic": 6,
      "twitch drop": 7
    },
    "penalties": {
      "build guide": -6
    },
    "titleMultiplier": 2,
    "bodyMultiplier": 1,
    "minimumScore": 8
  }
}
```

---

## Sound Settings

* Enable/disable alerts
* Adjust volume (0–100)
* Choose custom audio file (wav/mp3/etc)

If no custom file is set, feretory will use:

```
assets/alert.wav
```

---

## Dedupe System

* prevents repeat alerts
* tracks items by ID or content hash
* expires automatically
* capped history size

---

## Troubleshooting

### Installer does nothing

* Right-click → **Run as administrator**
* or unblock in Properties

### No results

* check plugin URL (must return JSON or readable HTML)
* lower `minimumScore`
* adjust keywords

### Too many false positives

* increase `minimumScore`
* add negative terms
* reduce generic keywords

---

## Disclaimer

feretory is provided **"as is"**, without warranty of any kind.

Use at your own risk. The author is not responsible for any issues, data loss, or damages resulting from its use.

The application is open source—review the code if you have concerns.

---

## License

GPLv3

---

## Credits

Built by piercedfreak
