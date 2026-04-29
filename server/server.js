'use strict';

/**
 * @fileoverview CivicMind Express server — API proxy + static file serving.
 *
 * Architecture:
 *   Browser → Express (this file) → Google APIs (Gemini, Civic, Calendar)
 *
 * API keys are NEVER sent to the client. All Google API calls are made
 * server-side and results are proxied back to the browser via /api/* routes.
 *
 * @module server
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fetch = require('node-fetch');
const { body, query, validationResult } = require('express-validator');

const { checkInjection, sanitizeInput, sanitizeAddress, buildSystemPrompt } = require('../src/utils/guardrails');
const { getOrFetch, geminiCache, civicCache } = require('../src/utils/cache');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CIVIC_API_KEY = process.env.CIVIC_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CIVIC_BASE = 'https://www.googleapis.com/civicinfo/v2';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const LOG_FORMAT = process.env.LOG_FORMAT || 'dev';

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;
const GEMINI_RATE_LIMIT_MAX = parseInt(process.env.GEMINI_RATE_LIMIT_MAX, 10) || 15;

// ─── APP SETUP ────────────────────────────────────────────────────────────────

const app = express();

// ─── SECURITY HEADERS (Helmet) ────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        fontSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
  }),
);

// ─── BODY PARSING ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ─── LOGGING ──────────────────────────────────────────────────────────────────

app.use(morgan(LOG_FORMAT));

// ─── GLOBAL RATE LIMIT ────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 429, message: 'Too many requests. Please try again later.' } },
});

/** Strict rate limiter for the Gemini AI endpoint. */
const geminiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: GEMINI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 429, message: 'AI rate limit reached. Please wait a moment and try again.' } },
  keyGenerator: req => req.ip,
});

app.use('/api/', globalLimiter);

// ─── STATIC FILES ─────────────────────────────────────────────────────────────

// Serve public/ at root (index.html, styles.css)
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  etag: true,
  index: 'index.html',
}));

// Serve src/ at /src so the browser can load /src/app.js with the correct MIME type
app.use('/src', express.static(path.join(__dirname, '..', 'src'), {
  maxAge: '0',
  etag: true,
}));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

/**
 * Health check endpoint — used by Cloud Run and load balancers.
 * @route GET /api/health
 * @returns {{ status: string, timestamp: string, version: string }} Health status
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
  });
});

// ─── VALIDATION HELPERS ───────────────────────────────────────────────────────

/**
 * Express middleware that returns 400 if any express-validator errors exist.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 400,
        message: 'Validation failed',
        details: errors.array().map(e => ({ field: e.path, msg: e.msg })),
      },
    });
  }
  return next();
}

// ─── GEMINI PROXY ─────────────────────────────────────────────────────────────

/**
 * Proxies a chat message to the Gemini AI API.
 * Performs server-side input validation, injection detection, and caching.
 *
 * @route POST /api/gemini
 * @param {object} req.body
 * @param {string} req.body.message - The user's question (1–1000 chars)
 * @param {Array}  [req.body.history] - Prior conversation turns (max 10)
 * @param {string} [req.body.location] - User's city/zip for local context
 * @param {string} [req.body.language] - BCP-47 language code (default: 'en')
 * @param {boolean}[req.body.simpleLang] - Use grade 4–5 reading level
 * @returns {object} Parsed Gemini structured response
 */
app.post(
  '/api/gemini',
  geminiLimiter,
  [
    body('message')
      .isString().withMessage('message must be a string')
      .trim()
      .isLength({ min: 1, max: 1000 }).withMessage('message must be 1–1000 characters'),
    body('history').optional().isArray({ max: 10 }).withMessage('history must be an array with at most 10 items'),
    body('location').optional().isString().trim().isLength({ max: 200 }),
    body('language').optional().isString().trim().isLength({ min: 2, max: 10 }),
    body('simpleLang').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { message, history = [], location, language = 'en', simpleLang = false } = req.body;

      // Server-side injection guard (authoritative — client guard is defence-in-depth only)
      const injectionResult = checkInjection(message);
      if (injectionResult.blocked) {
        return res.status(400).json({
          error: { code: 400, message: 'Input blocked by content policy.' },
          guardrail: true,
          guardrailMsg: injectionResult.reason,
        });
      }

      if (!GEMINI_API_KEY) {
        return res.status(503).json({
          error: { code: 503, message: 'AI service is not configured. Please contact the administrator.' },
        });
      }

      const cleanMessage = sanitizeInput(message, 1000);
      const cleanLocation = location ? sanitizeAddress(location) : null;
      const systemPrompt = buildSystemPrompt({ location: cleanLocation, language, simpleLang });

      // Build conversation history for Gemini multi-turn format
      const safeHistory = (Array.isArray(history) ? history.slice(-8) : [])
        .filter(turn => turn && typeof turn.role === 'string' && typeof turn.content === 'string')
        .map(turn => ({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: sanitizeInput(turn.content, 2000) }],
        }));

      safeHistory.push({ role: 'user', parts: [{ text: cleanMessage }] });

      // Cache key based on the full prompt context
      const cacheKey = `gemini:${language}:${simpleLang}:${cleanMessage.slice(0, 100)}`;

      const responseData = await getOrFetch(geminiCache, cacheKey, async () => {
        const geminiRes = await fetch(
          `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: safeHistory,
              generationConfig: { temperature: 0.3, maxOutputTokens: 1024, topP: 0.9 },
            }),
          },
        );

        if (!geminiRes.ok) {
          const errBody = await geminiRes.json().catch(() => ({}));
          const status = geminiRes.status;
          const msg = errBody?.error?.message || 'Unknown Gemini API error';
          const err = new Error(msg);
          err.statusCode = status;
          throw err;
        }

        return geminiRes.json();
      });

      const raw = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseGeminiResponse(raw);
      return res.json(parsed);

    } catch (err) {
      return next(err);
    }
  },
);

// ─── CIVIC INFO PROXY — ELECTIONS LIST ────────────────────────────────────────

/**
 * Returns the current list of available elections from the Google Civic Info API.
 *
 * @route GET /api/civic/elections
 * @returns {object} Google Civic Info elections response
 */
app.get(
  '/api/civic/elections',
  [
    query('address').optional().isString().trim().isLength({ max: 200 }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      if (!CIVIC_API_KEY) {
        return res.status(503).json({ error: { code: 503, message: 'Civic API not configured.' } });
      }

      const data = await getOrFetch(civicCache, 'civic:elections', async () => {
        const civicRes = await fetch(
          `${CIVIC_BASE}/elections?key=${CIVIC_API_KEY}`,
          { headers: { Accept: 'application/json' } },
        );
        if (!civicRes.ok) {
          const err = new Error('Civic API error');
          err.statusCode = civicRes.status;
          throw err;
        }
        return civicRes.json();
      });

      return res.json(data);
    } catch (err) {
      return next(err);
    }
  },
);

// ─── CIVIC INFO PROXY — VOTER INFO ────────────────────────────────────────────

/**
 * Returns voter information for a given address and election ID.
 *
 * @route GET /api/civic/voterinfo
 * @param {string} req.query.address - Voter's address (required)
 * @param {string} req.query.electionId - Election ID from /api/civic/elections
 * @returns {object} Google Civic Info voterinfo response
 */
app.get(
  '/api/civic/voterinfo',
  [
    query('address')
      .isString().withMessage('address is required')
      .trim()
      .isLength({ min: 1, max: 200 }).withMessage('address must be 1–200 characters'),
    query('electionId')
      .isString().withMessage('electionId is required')
      .trim()
      .isLength({ min: 1, max: 20 }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      if (!CIVIC_API_KEY) {
        return res.status(503).json({ error: { code: 503, message: 'Civic API not configured.' } });
      }

      const address = sanitizeAddress(req.query.address);
      const { electionId } = req.query;
      const cacheKey = `civic:voterinfo:${electionId}:${address.slice(0, 50)}`;

      const data = await getOrFetch(civicCache, cacheKey, async () => {
        const civicRes = await fetch(
          `${CIVIC_BASE}/voterinfo?address=${encodeURIComponent(address)}&electionId=${encodeURIComponent(electionId)}&key=${CIVIC_API_KEY}`,
          { headers: { Accept: 'application/json' } },
        );
        if (!civicRes.ok) {
          const err = new Error('Civic voterinfo API error');
          err.statusCode = civicRes.status;
          throw err;
        }
        return civicRes.json();
      });

      return res.json(data);
    } catch (err) {
      return next(err);
    }
  },
);

// ─── CALENDAR DEEP-LINK GENERATOR ─────────────────────────────────────────────

/**
 * Generates a validated Google Calendar event creation deep-link.
 * No OAuth required — opens Google Calendar in the user's browser.
 *
 * @route POST /api/calendar/create
 * @param {string} req.body.eventName - Name of the election event (max 200 chars)
 * @param {string} [req.body.details] - Optional event details (max 500 chars)
 * @returns {{ calendarUrl: string }} Deep-link URL for Google Calendar
 */
app.post(
  '/api/calendar/create',
  [
    body('eventName')
      .isString().withMessage('eventName is required')
      .trim()
      .isLength({ min: 1, max: 200 }).withMessage('eventName must be 1–200 characters'),
    body('details')
      .optional()
      .isString().trim().isLength({ max: 500 }),
  ],
  handleValidationErrors,
  (req, res) => {
    const { eventName, details } = req.body;
    const safeTitle = sanitizeInput(eventName, 200);
    const safeDetails = details
      ? sanitizeInput(details, 500)
      : 'Reminder from CivicMind — verify with your local election authority at vote.gov';

    const calendarUrl =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(safeTitle)}` +
      `&details=${encodeURIComponent(safeDetails)}` +
      `&sf=true`;

    return res.json({ calendarUrl });
  },
);

// ─── FALLBACK — SPA ───────────────────────────────────────────────────────────

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── ERROR HANDLING MIDDLEWARE ────────────────────────────────────────────────

/**
 * Central error handler — normalises all errors to a consistent JSON structure.
 * Must be last middleware registered.
 *
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  // eslint-disable-next-line no-console
  console.error(`[CivicMind Error] ${status}:`, err.message);
  res.status(status).json({
    error: {
      code: status,
      message: isProd && status >= 500 ? 'An internal error occurred. Please try again.' : err.message,
    },
  });
});

// ─── SERVER BOOT ──────────────────────────────────────────────────────────────

// Only bind to a port when run directly (not when require()'d by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`✅ CivicMind server running on port ${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    // eslint-disable-next-line no-console
    console.log(`   Gemini key  : ${GEMINI_API_KEY ? '✓ loaded' : '✗ NOT SET'}`);
    // eslint-disable-next-line no-console
    console.log(`   Civic key   : ${CIVIC_API_KEY ? '✓ loaded' : '✗ NOT SET'}`);
  });
}

// ─── HELPERS (module-local) ───────────────────────────────────────────────────

/**
 * Parses Gemini's raw text response into a structured object.
 * Falls back gracefully if JSON extraction fails.
 *
 * @param {string} raw - Raw text from Gemini API
 * @returns {object} Parsed response object with at minimum an `answer` field
 */
function parseGeminiResponse(raw) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (_) {
    // fall through to plain-text fallback
  }
  return {
    answer: raw || 'I wasn\'t able to get a clear answer. Please try again or visit vote.gov.',
    hasSteps: false,
    hasTimeline: false,
    source: 'vote.gov — Official U.S. Voter Information',
    quickReplies: ['How do I register?', 'Find my polling place', 'What is early voting?'],
    offerCalendar: false,
    offerMap: false,
    isGuardrail: false,
  };
}

module.exports = app; // export for supertest
