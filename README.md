<p align="center">
  <img src="/src/assets/logo.png">
</p>
# feretory

feretory is a lightweight desktop scanner for tracking Diablo 4 cosmetic drops, shop updates, and promotions using a simple **scored keyword system**.

Version: 1.6.0  
Author: piercedfreak

---

## Overview

feretory scans websites (like Reddit and Blizzard forums), scores content using weighted keywords, and alerts you only when results are relevant.

This version focuses on:
- simplicity
- low false positives
- easy plugin tuning
- no overcomplicated parsing systems

---

## Features

### Scored Matching System
- weighted keyword scoring
- positive and negative terms
- configurable minimum score
- title weighting vs body weighting

### Plugin-Based Sources
- JSON feeds (Reddit, APIs)
- HTML feeds (basic page scraping)
- no code changes needed to add sources

### Smart Filtering
- dedupe history (no repeated alerts)
- result ranking by score
- threshold-based filtering

### Notifications & Sound
- desktop notifications
- global sound toggle
- volume control
- custom sound file support
- bundled sound fallback

### Tray Integration
- runs in system tray
- minimize to tray support
- quick actions (scan, show, quit)

---

## How It Works

1. Fetch source (JSON or HTML)
2. Extract items
3. Score each item:
   - add points for positive terms
   - subtract for negative terms
4. Filter by minimum score
5. remove duplicates
6. notify + display results

---

## Plugin Format

Plugins are simple JSON files located in the `plugins/` folder.

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
  },
  "dedupeHours": 168,
  "notifications": true
}
