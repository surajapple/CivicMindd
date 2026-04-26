# 🗳️ CivicMind

> A non-partisan, accessible election education assistant — powered by Google Gemini AI.

## Quick Start

No build step needed. Just open `index.html` in any browser.

```bash
open index.html
```

## API Keys (Required for live data)

Edit `app.js` and replace the placeholder keys at the top:

```js
const CONFIG = {
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',   // generativelanguage.googleapis.com
  CIVIC_API_KEY:  'YOUR_CIVIC_API_KEY',    // Google Civic Information API
  CALENDAR_API_KEY: 'YOUR_CALENDAR_KEY',   // Google Calendar API (optional)
};
```

### Getting API Keys

| Key | Where to get |
|-----|-------------|
| Gemini API | https://aistudio.google.com/app/apikey |
| Google Civic Info API | https://console.cloud.google.com → Enable "Google Civic Information API" |
| Google Calendar API | https://console.cloud.google.com → Enable "Google Calendar API" |

## Features

- 💬 **AI Chat** — Gemini 1.5 Flash answers election questions with guardrails
- 📝 **Voter Registration** — Eligibility, deadlines, how-to steps
- 📅 **Election Timelines** — Primary, general, runoff dates
- 🗳️ **Voting Process** — Polling places, early voting, mail-in
- 📋 **Ballot Guide** — How to read measures, propositions
- 📊 **Results & Certification** — How votes are counted
- 🏛️ **Civics 101** — Electoral college, redistricting
- 📍 **Google Maps** — Polling place directions
- 📅 **Google Calendar** — Add deadlines with reminders
- ♿ **Accessibility** — Large text, high contrast, reduce motion, simple language
- 🌐 **Multi-language** — 8 languages supported
- 🎙️ **Voice Input** — Speech-to-text (Chrome/Edge)

## Guardrails

CivicMind enforces strict non-partisan rules:
- Never endorses candidates or parties
- Never discourages voting
- Blocks prompt injection attempts
- Never requests sensitive personal data
- Corrects misinformation with official citations
