# 🗳️ CivicMind

> A non-partisan, accessible election education assistant — powered by Google Gemini AI, Google Civic Info API, and Google Calendar API.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Non-Partisan](https://img.shields.io/badge/Politics-Non--Partisan-gold)](https://vote.gov)

---

## Architecture

```
Browser → Express Server (server/server.js)
               ├── POST /api/gemini       → Google Gemini 2.5 Flash
               ├── GET  /api/civic/*      → Google Civic Info API
               ├── POST /api/calendar/*   → Google Calendar deep-link
               └── Static files          → public/ (index.html, styles.css, src/app.js)
```

**API keys never reach the browser.** All Google API calls are proxied through the Express backend.

---

## Project Structure

```
CivicMindd/
├── public/                  # Static files served to the browser
│   ├── index.html           # Main HTML (accessibility-first)
│   └── styles.css           # All styles including skip-link, sr-only
├── src/
│   ├── app.js               # Client-side JS (NO API keys)
│   └── utils/
│       ├── guardrails.js    # Input validation & prompt injection blocking
│       ├── cache.js         # node-cache wrapper (Gemini + Civic caches)
│       └── accessibility.js # Screen reader, focus trap, WCAG utilities
├── server/
│   └── server.js            # Express app — proxy routes, helmet, rate-limit
├── tests/
│   ├── guardrails.test.js   # Unit tests for guardrails utilities
│   ├── api.test.js          # Supertest API integration tests
│   └── accessibility.test.js # WCAG contrast + HTML structure tests
├── .env.example             # All required env vars documented
├── .gitignore
├── .eslintrc.json
├── Dockerfile               # Multi-stage, non-root
├── .dockerignore
└── package.json
```

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/surajapple/CivicMindd.git
cd CivicMindd
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 3. Add your API keys to `.env`

| Variable | Where to get it |
|----------|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `CIVIC_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → Enable "Google Civic Information API" |
| `CALENDAR_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → Enable "Google Calendar API" |

### 4. Run locally

```bash
npm run dev
# Server starts at http://localhost:8080
```

### 5. Run tests

```bash
npm test
# Runs Jest with coverage report
```

### 6. Lint

```bash
npm run lint
```

---

## Features

| Feature | Implementation |
|---------|---------------|
| 💬 **AI Chat** | Gemini 2.5 Flash via backend proxy — guardrails enforced server-side |
| 📝 **Voter Registration** | Eligibility, deadlines, how-to steps |
| 📅 **Election Timelines** | Primary, general, runoff dates |
| 🗳️ **Voting Process** | Polling places, early voting, mail-in |
| 📋 **Ballot Guide** | How to read measures, propositions |
| 📊 **Results & Certification** | How votes are counted |
| 🏛️ **Civics 101** | Electoral college, redistricting |
| 📍 **Google Maps** | Directions to polling places (deep-link) |
| 📅 **Google Calendar** | Add election deadlines (server-validated deep-link) |
| ♿ **Accessibility** | Skip link, aria-live, focus trap, WCAG AA contrast |
| 🌐 **Multi-language** | 8 languages (en, es, zh, vi, ko, tl, hi, ar) |
| 🎙️ **Voice Input** | Web Speech API (Chrome/Edge) |
| 🔒 **Security** | Helmet, CORS, rate-limiting, input validation, no client-side keys |
| ⚡ **Caching** | node-cache for Civic API (1h) and Gemini (5min) |

---

## Security

- **No API keys in client code** — all Google API calls are server-side
- **Helmet.js** — sets Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options
- **Rate limiting** — 100 req/15 min global; 15 req/15 min on the AI endpoint per IP
- **Input validation** — `express-validator` on all API route inputs
- **Server-side injection guard** — `src/utils/guardrails.js` blocks prompt injection patterns before they reach Gemini
- **Non-root Docker** — container runs as `civicmind` user

---

## Google Services Integration

| API | How it's used |
|-----|--------------|
| **Gemini 2.5 Flash** | Powers the AI chat — non-partisan Q&A with structured JSON responses |
| **Google Civic Info API** | `/api/civic/elections` and `/api/civic/voterinfo` return live election data |
| **Google Calendar API** | `/api/calendar/create` generates validated deep-links for election reminders |
| **Google Maps** | Polling place addresses from Civic API are linked to Google Maps directions |
| **Google Fonts** | Inter + Fraunces fonts for accessible, readable typography |

---

## Deployment (Google Cloud Run)

```bash
# Build and push
docker build -t gcr.io/YOUR_PROJECT/civicmind .
docker push gcr.io/YOUR_PROJECT/civicmind

# Deploy
gcloud run deploy civicmind \
  --image gcr.io/YOUR_PROJECT/civicmind \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key,CIVIC_API_KEY=your_key,NODE_ENV=production
```

---

## Guardrails

CivicMind enforces strict non-partisan content policy at **both** client and server:

- ❌ Never endorses candidates or parties
- ❌ Never discourages voting
- ❌ Never requests sensitive PII
- ❌ Never speculates on election outcomes
- ✅ Blocks prompt injection attempts (server-authoritative)
- ✅ Corrects misinformation with official source citations
- ✅ Directs users to `vote.gov` or state election authority for verification

---

## Accessibility

WCAG 2.1 AA compliance features:
- **Skip-to-content link** — first focusable element on every page
- **`aria-live` regions** — polite announcements for new messages, assertive for errors
- **Focus trap** — keyboard navigation stays within modals/panels
- **`aria-pressed`** on toggle buttons, `aria-modal` on dialogs
- **`role="log"`** on chat container for screen reader-friendly message stream
- **High contrast mode**, **large text mode**, **reduce motion mode**

---

## Testing

```
tests/
├── guardrails.test.js    ~30 tests  — injection, sanitization, prompt builder
├── api.test.js           ~25 tests  — all routes, validation, security headers
└── accessibility.test.js ~25 tests  — WCAG contrast, HTML structure, focus utils
```

Run with coverage: `npm test`
