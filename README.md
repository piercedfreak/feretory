
<p align="center">
  <img src="/assets/logo.png">
</p>

# feretory

**v2.0.0 — adaptive scored scanner with learning feedback**

feretory is a lightweight desktop scanner that monitors sources (like Reddit or forums), scores content using keyword rules, and **learns from your feedback over time**.

---

## 🔥 What’s new in v2

### 🧠 Learning Feedback

* Mark results as **Useful** or **Not useful**
* Adjusts future scoring automatically
* Prevents duplicate voting on the same item
* Displays top learned terms in the UI

### 📌 Persistent Results

* Results stay on screen until you act on them
* New scans add to the list instead of clearing it
* You control what gets dismissed

### 🧩 Collapsible Panels

* Sidebar panels can be collapsed
* State is saved between sessions

---

## ⚙️ Core Features

* **Plugin-based scanning**

  * JSON feeds (Reddit, APIs)
  * HTML sources (basic scraping)

* **Keyword scoring system**

  * weighted positive terms
  * weighted penalties
  * separate title/body multipliers

* **Deduplication system**

  * prevents repeated alerts
  * configurable history window

* **Desktop notifications**

  * clickable results
  * optional sound alerts

* **Tray support**

  * run in background
  * quick scan access

---

## 📦 How it works

1. Plugins fetch content from sources
2. Items are scored based on keyword rules
3. High-scoring results are shown
4. You give feedback (Useful / Not useful)
5. feretory adjusts scoring over time

---

## 🧠 Learning System

feretory uses a simple local learning model:

* Extracts meaningful terms from results
* Adjusts weights based on feedback:

  * 👍 Useful → increase weight
  * 👎 Not useful → decrease weight
* Clamped weights prevent runaway behavior
* No external APIs or cloud required

---

## 📁 Plugins

Plugins live in the `plugins/` folder and are simple JSON files.

Example:

```json
{
  "id": "reddit-d4",
  "name": "Reddit Diablo 4",
  "enabled": true,
  "url": "https://www.reddit.com/r/diablo4/new/.json",
  "type": "json-feed",
  "itemPath": "data.children",
  "fields": {
    "title": "data.title",
    "body": "data.selftext",
    "link": "data.url"
  },
  "score": {
    "terms": {
      "cosmetic": 3,
      "twitch drop": 7
    },
    "penalties": {
      "build guide": -6
    },
    "minimumScore": 1
  }
}
```

---

## 🚀 Running

```bash
npm install
npm start
```

---

## 🧪 Tips

* Use a low `minimumScore` when testing plugins
* Add temporary keywords to force matches
* Reset learning if behavior gets skewed

---

## ⚠️ Notes

* Learning is **local only**
* No data leaves your machine
* Designed for personal filtering workflows

---

## 📌 Roadmap Ideas

* highlight strong learned matches
* auto-expire results
* dismiss all button
* learning decay over time

---

## 🧠 Philosophy

feretory is built to be:

* simple
* fast
* local-first
* user-controlled

No accounts, no cloud, no noise — just signal.

---

## 🏷️ Version

v2.0.0

---

## 👤 Author

piercedfreak

---

## ⭐

If you find this useful, feel free to star the repo.
