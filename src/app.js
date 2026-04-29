// ============================================================
//  CivicMind — Client-side Application
//  src/app.js | All API calls go to /api/* backend routes.
//  NO API KEYS exist in this file.
// ============================================================

'use strict';

// ─── CONFIG (no secrets) ──────────────────────────────────────
const CONFIG = {
  MAX_INPUT: 1000,
  RATE_LIMIT_MS: 1500,
  DEBOUNCE_MS: 300,
};

// ─── STATE ───────────────────────────────────────────────────
const state = {
  userLocation: null,
  currentTopic: 'general',
  language: 'en',
  isTyping: false,
  lastRequestTime: 0,
  simpleLang: false,
  messageHistory: [],
};

// ─── DOM REFS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const splashScreen = $('splash-screen');
const app = $('app');
const startBtn = $('startBtn');
const chatContainer = $('chatContainer');
const userInput = $('userInput');
const sendBtn = $('sendBtn');
const charCount = $('charCount');
const typingIndicator = $('typingIndicator');
const jurisdictionText = $('jurisdictionText');
const sidebarEl = $('sidebar');
const sidebarToggle = $('sidebarToggle');
const mobileMenuBtn = $('mobileMenuBtn');

// ─── ACCESSIBILITY HELPERS (inline; no ES module import needed) ─
/**
 * Announces a message to the screen reader live region.
 * @param {string} message
 * @param {'polite'|'assertive'} [priority='polite']
 */
function announceToScreenReader(message, priority = 'polite') {
  const id = priority === 'assertive' ? 'status-announcer' : 'a11y-announcer';
  const el = $(id);
  if (!el) { return; }
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}

// ─── SPLASH → APP ─────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  splashScreen.style.animation = 'fadeOut 0.4s ease forwards';
  setTimeout(() => {
    splashScreen.classList.add('hidden');
    app.classList.remove('hidden');
    userInput.focus();
    announceToScreenReader('CivicMind chat is ready. Type your election question below.');
  }, 380);
});

const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = '@keyframes fadeOut{to{opacity:0;transform:translateY(-10px)}}';
document.head.appendChild(fadeOutStyle);

// ─── SIDEBAR ──────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  const collapsed = sidebarEl.classList.toggle('collapsed');
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
});

mobileMenuBtn.addEventListener('click', () => {
  const open = sidebarEl.classList.toggle('open');
  mobileMenuBtn.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.topic-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.topic-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.currentTopic = btn.dataset.topic;
    updateTopicHeader(btn.dataset.topic);

    const topicPrompts = {
      general: null,
      registration: 'How do I register to vote?',
      timeline: 'What are the key election dates and timelines?',
      voting: 'How does the voting process work?',
      ballot: 'How do I read and understand my ballot?',
      results: 'How are votes counted and results certified?',
      civics: 'Can you give me a civics overview — electoral college, redistricting?',
    };
    if (topicPrompts[btn.dataset.topic]) {
      sendMessage(topicPrompts[btn.dataset.topic]);
    }
  });
});

/**
 * Updates the main content header to reflect the selected topic.
 * @param {string} topic
 */
function updateTopicHeader(topic) {
  const map = {
    general: ['Election Education Chat', 'Ask me anything about voting and elections'],
    registration: ['Voter Registration', 'Eligibility, deadlines, and how to register'],
    timeline: ['Election Timelines', 'Key dates for primaries, general elections, and more'],
    voting: ['Voting Process', 'Polling places, early voting, mail-in ballots'],
    ballot: ['Ballot Guide', 'How to read and understand your ballot'],
    results: ['Results & Certification', 'How votes are counted and when results are final'],
    civics: ['Civics 101', 'Electoral college, redistricting, campaign finance'],
  };
  $('currentTopicTitle').textContent = map[topic]?.[0] || 'Election Education Chat';
  $('currentTopicSubtitle').textContent = map[topic]?.[1] || 'Ask me anything about voting and elections';
}

// ─── INPUT HANDLING ───────────────────────────────────────────
let _debounceTimer = null;

userInput.addEventListener('input', () => {
  const len = userInput.value.length;
  charCount.textContent = `${len} / ${CONFIG.MAX_INPUT}`;
  sendBtn.disabled = len === 0;
  sendBtn.setAttribute('aria-disabled', String(len === 0));
  autoResizeTextarea();

  // Debounce: only process after user pauses typing
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    // Could trigger live suggestions here in future
  }, CONFIG.DEBOUNCE_MS);
});

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

sendBtn.addEventListener('click', handleSend);

/** Auto-resizes the textarea up to 140px tall. */
function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
}

/** Handles the send action: validates rate-limit, dispatches sendMessage. */
function handleSend() {
  const text = userInput.value.trim();
  if (!text || state.isTyping) { return; }
  const now = Date.now();
  if (now - state.lastRequestTime < CONFIG.RATE_LIMIT_MS) { return; }
  state.lastRequestTime = now;
  sendMessage(text);
  userInput.value = '';
  charCount.textContent = '0 / 1000';
  sendBtn.disabled = true;
  sendBtn.setAttribute('aria-disabled', 'true');
  userInput.style.height = 'auto';
}

/**
 * Sanitizes and sends a user message; handles the full AI round-trip.
 * @param {string} text
 */
function sendMessage(text) {
  if (!sanitizeInput(text)) { return; }
  appendUserMessage(text);
  state.messageHistory.push({ role: 'user', content: text });
  showTyping();
  announceToScreenReader('CivicMind is thinking…');

  callGeminiProxy(text)
    .then(response => {
      hideTyping();
      appendBotMessage(response);
      state.messageHistory.push({ role: 'assistant', content: response.answer });
      announceToScreenReader('New response from CivicMind received.');
    })
    .catch(err => {
      hideTyping();
      appendBotMessage(fallbackResponse(err));
      announceToScreenReader('Error receiving response. Please try again.', 'assertive');
    });
}

// ─── INPUT SANITIZATION (client-side, defence-in-depth) ───────
/**
 * Client-side input sanitization check. Server is the authoritative gate.
 * @param {string} text
 * @returns {boolean} true if input is acceptable
 */
function sanitizeInput(text) {
  if (!text || text.length > CONFIG.MAX_INPUT) { return false; }
  const injections = [
    'ignore previous instructions', 'forget your instructions',
    'you are now', 'act as ', 'jailbreak', 'dan ',
  ];
  if (injections.some(p => text.toLowerCase().includes(p))) {
    appendBotMessage({
      answer: "I'm only able to help with election education questions.",
      isGuardrail: true,
      guardrailMsg: 'Prompt injection attempt detected.',
      quickReplies: ['How do I register?', 'Find my polling place', 'What is early voting?'],
      hasSteps: false, offerCalendar: false, offerMap: false,
    });
    announceToScreenReader('Your message was blocked by content policy.', 'assertive');
    return false;
  }
  return true;
}

/** Strips dangerous HTML characters from address strings. */
function sanitizeAddress(addr) {
  return addr.replace(/[<>"']/g, '').trim().slice(0, 200);
}

// ─── API CALLS — ALL GO TO /api/* BACKEND ROUTES ─────────────

/**
 * Calls the backend Gemini proxy. API key is handled server-side.
 * @param {string} userText - The user's message
 * @returns {Promise<object>} Parsed structured response
 */
async function callGeminiProxy(userText) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userText,
      history: state.messageHistory.slice(-8),
      location: state.userLocation || undefined,
      language: state.language,
      simpleLang: state.simpleLang,
    }),
  });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    if (body.guardrail) {
      return {
        answer: "I'm only able to help with election education questions.",
        isGuardrail: true,
        guardrailMsg: body.guardrailMsg || 'Content policy violation.',
        quickReplies: ['How do I register?', 'Find my polling place', 'What is early voting?'],
        hasSteps: false, offerCalendar: false, offerMap: false,
      };
    }
    const msg = body?.error?.message || 'Invalid request.';
    throw Object.assign(new Error(msg), { statusCode: 400 });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error?.message || `Server error ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Calls the backend Civic Info proxy for elections list.
 * @returns {Promise<object|null>}
 */
async function fetchElectionInfo() {
  try {
    const res = await fetch('/api/civic/elections');
    if (!res.ok) { return null; }
    return await res.json();
  } catch { return null; }
}

/**
 * Calls the backend Civic Info proxy for voter info.
 * @param {string} address
 * @param {string} electionId
 * @returns {Promise<object|null>}
 */
async function fetchVoterInfo(address, electionId) {
  try {
    const params = new URLSearchParams({ address, electionId });
    const res = await fetch(`/api/civic/voterinfo?${params}`);
    if (!res.ok) { return null; }
    return await res.json();
  } catch { return null; }
}

/**
 * Gets a validated Google Calendar deep-link from the backend.
 * @param {string} eventName
 * @returns {Promise<string|null>} The calendar URL, or null on error
 */
async function getCalendarUrl(eventName) {
  try {
    const res = await fetch('/api/calendar/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName }),
    });
    if (!res.ok) { return null; }
    const data = await res.json();
    return data.calendarUrl || null;
  } catch { return null; }
}

// ─── FALLBACK RESPONSE ────────────────────────────────────────
/**
 * Generates a user-friendly fallback message when the API call fails.
 * @param {Error} err
 * @returns {object} Fallback response object
 */
function fallbackResponse(err) {
  const msg = err?.message || '';
  let answer;
  if (msg.includes('429') || err.statusCode === 429) {
    answer = '⏳ Rate limit reached. Please wait a moment and try again.';
  } else if (msg.includes('503') || err.statusCode === 503) {
    answer = '⚙️ The AI service is temporarily unavailable. Please try again shortly.';
  } else {
    answer = `⚠️ Connection error: ${msg}. Please check your connection and try again, or visit vote.gov.`;
  }
  return {
    answer,
    hasSteps: false, hasTimeline: false,
    source: 'vote.gov — Official U.S. Voter Information',
    quickReplies: ['How do I check my registration?', 'What ID do I need to vote?', 'What is early voting?'],
    offerCalendar: false, offerMap: false, isGuardrail: false,
  };
}

// ─── MESSAGE RENDERING ────────────────────────────────────────
/**
 * Appends a user message bubble to the chat.
 * @param {string} text
 */
function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.setAttribute('role', 'article');
  div.setAttribute('aria-label', `You said: ${text}`);
  div.innerHTML = `
    <div class="msg-avatar" style="background:var(--blue);color:white;font-weight:700;font-size:0.8rem;" aria-hidden="true">
      YOU
    </div>
    <div class="msg-body">
      <div class="msg-bubble">${escHtml(text)}</div>
      <span class="msg-time" aria-label="Sent at ${getTime()}">${getTime()}</span>
    </div>`;
  chatContainer.appendChild(div);
  scrollBottom();
}

/**
 * Appends a bot response bubble to the chat.
 * @param {object} data - Structured response from Gemini proxy
 */
function appendBotMessage(data) {
  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.setAttribute('role', 'article');
  div.setAttribute('aria-label', `CivicMind response: ${data.answer || ''}`);

  const gradId = `avMsg${Date.now()}`;
  let html = `
    <div class="msg-avatar" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22" fill="url(#${gradId})"/>
        <path d="M14 24l7 7 13-13" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/>
        </linearGradient></defs>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-bubble${data.isGuardrail ? ' guardrail-bubble' : ''}">`;

  if (data.answer) {
    html += `<div class="answer-section"><p>${escHtml(data.answer)}</p></div>`;
  }
  if (data.hasTimeline && data.timelineNote) {
    html += `<div class="timeline-pill" role="note">⏱️ ${escHtml(data.timelineNote)}</div>`;
  }
  if (data.hasSteps && data.steps?.length) {
    html += `<div class="steps-section"><div class="section-label">📋 Steps</div><ol class="steps-list">`;
    data.steps.forEach(s => { html += `<li>${escHtml(s)}</li>`; });
    html += `</ol></div>`;
  }
  if (data.source) {
    html += `<div class="source-section"><div class="source-box">📚 <strong>Source:</strong> ${linkifySource(data.source)}<br/><small style="color:var(--text3)">Retrieved: ${getTodayDate()} · Always verify with your local election authority</small></div></div>`;
  }
  if (data.offerMap && data.mapAddress) {
    const enc = encodeURIComponent(sanitizeAddress(data.mapAddress));
    html += `<a href="https://maps.google.com/?q=${enc}" target="_blank" rel="noopener noreferrer" class="map-link" aria-label="Get directions in Google Maps for ${escHtml(data.mapAddress)}">🗺️ Get Directions in Google Maps</a>`;
  }
  if (data.quickReplies?.length) {
    html += `<div class="next-steps-section"><div class="section-label">💬 What's next?</div><div class="quick-replies" role="group" aria-label="Suggested follow-up questions">`;
    data.quickReplies.forEach(r => {
      html += `<button class="quick-reply" data-prompt="${escAttr(r)}">${escHtml(r)}</button>`;
    });
    html += `</div></div>`;
  }
  if (data.offerCalendar && data.calendarEventName) {
    html += `<div class="calendar-section"><button class="calendar-offer" data-event="${escAttr(data.calendarEventName)}" aria-label="Add ${escHtml(data.calendarEventName)} to Google Calendar">📅 Add "${escHtml(data.calendarEventName)}" to Google Calendar</button></div>`;
  }

  html += `</div><span class="msg-time">CivicMind · ${getTime()}</span></div></div>`;
  div.innerHTML = html;

  div.querySelectorAll('.quick-reply').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
  });
  div.querySelectorAll('.calendar-offer').forEach(btn => {
    btn.addEventListener('click', () => addToCalendar(btn.dataset.event));
  });

  chatContainer.appendChild(div);
  scrollBottom();
}

// ─── TYPING ───────────────────────────────────────────────────
function showTyping() {
  state.isTyping = true;
  typingIndicator.classList.remove('hidden');
  userInput.setAttribute('aria-busy', 'true');
  scrollBottom();
}
function hideTyping() {
  state.isTyping = false;
  typingIndicator.classList.add('hidden');
  userInput.setAttribute('aria-busy', 'false');
}

// ─── CALENDAR ─────────────────────────────────────────────────
/**
 * Fetches a validated calendar deep-link from the backend and opens it.
 * @param {string} eventName
 */
async function addToCalendar(eventName) {
  const url = await getCalendarUrl(eventName);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast();
    announceToScreenReader('Google Calendar opened in a new tab.');
  }
}

function showToast() {
  const toast = $('calendarToast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}
$('toastClose').addEventListener('click', () => $('calendarToast').classList.add('hidden'));

// ─── LOCATION MODAL ───────────────────────────────────────────
$('setLocationBtn').addEventListener('click', () => {
  $('locationModal').classList.remove('hidden');
  setTimeout(() => $('locationInput').focus(), 50);
});
$('locationModalClose').addEventListener('click', () => $('locationModal').classList.add('hidden'));
$('locationModalCancel').addEventListener('click', () => $('locationModal').classList.add('hidden'));
$('locationModalConfirm').addEventListener('click', () => {
  const loc = $('locationInput').value.trim();
  if (loc) {
    state.userLocation = sanitizeAddress(loc);
    jurisdictionText.textContent = `📍 Location: ${state.userLocation} — showing local election info`;
    sendMessage(`I'm located in ${state.userLocation}. What local election information do you have for me?`);
    announceToScreenReader(`Location set to ${state.userLocation}`);
  }
  $('locationModal').classList.add('hidden');
});

// ─── ACCESSIBILITY PANEL ──────────────────────────────────────
$('accessibilityBtn').addEventListener('click', () => {
  $('accessibilityPanel').classList.remove('hidden');
  setTimeout(() => $('a11yPanelClose').focus(), 50);
});
$('a11yPanelClose').addEventListener('click', () => $('accessibilityPanel').classList.add('hidden'));
$('accessibilityPanel').addEventListener('click', e => {
  if (e.target === $('accessibilityPanel')) { $('accessibilityPanel').classList.add('hidden'); }
});

$('largeTextToggle').addEventListener('change', e => {
  document.body.classList.toggle('large-text', e.target.checked);
  e.target.setAttribute('aria-checked', String(e.target.checked));
  announceToScreenReader(`Large text ${e.target.checked ? 'enabled' : 'disabled'}.`);
});
$('highContrastToggle').addEventListener('change', e => {
  document.body.classList.toggle('high-contrast', e.target.checked);
  e.target.setAttribute('aria-checked', String(e.target.checked));
  announceToScreenReader(`High contrast ${e.target.checked ? 'enabled' : 'disabled'}.`);
});
$('reduceMotionToggle').addEventListener('change', e => {
  document.body.classList.toggle('reduce-motion', e.target.checked);
  e.target.setAttribute('aria-checked', String(e.target.checked));
  announceToScreenReader(`Reduced motion ${e.target.checked ? 'enabled' : 'disabled'}.`);
});
$('simpleLangToggle').addEventListener('change', e => {
  state.simpleLang = e.target.checked;
  e.target.setAttribute('aria-checked', String(e.target.checked));
  announceToScreenReader(`Simple language mode ${e.target.checked ? 'enabled' : 'disabled'}.`);
});

// ─── LANGUAGE PANEL ───────────────────────────────────────────
$('langBtn').addEventListener('click', () => {
  $('langPanel').classList.remove('hidden');
  setTimeout(() => $('langPanelClose').focus(), 50);
});
$('langPanelClose').addEventListener('click', () => $('langPanel').classList.add('hidden'));
$('langPanel').addEventListener('click', e => {
  if (e.target === $('langPanel')) { $('langPanel').classList.add('hidden'); }
});

document.querySelectorAll('.lang-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-option').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.language = btn.dataset.lang;
    document.documentElement.lang = btn.dataset.lang;
    $('langPanel').classList.add('hidden');
    announceToScreenReader(`Language changed to ${btn.textContent.trim()}`);
  });
});

// ─── VOICE INPUT ─────────────────────────────────────────────
const voiceBtn = $('voiceBtn');
let recognition = null;
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript;
    userInput.value = transcript;
    charCount.textContent = `${transcript.length} / ${CONFIG.MAX_INPUT}`;
    sendBtn.disabled = false;
    sendBtn.setAttribute('aria-disabled', 'false');
    voiceBtn.classList.remove('listening');
    voiceBtn.setAttribute('aria-pressed', 'false');
    announceToScreenReader(`Voice input captured: ${transcript}`);
  };
  recognition.onerror = () => {
    voiceBtn.classList.remove('listening');
    voiceBtn.setAttribute('aria-pressed', 'false');
    announceToScreenReader('Voice input error. Please try again.', 'assertive');
  };
  recognition.onend = () => {
    voiceBtn.classList.remove('listening');
    voiceBtn.setAttribute('aria-pressed', 'false');
  };

  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('listening')) {
      recognition.stop();
      voiceBtn.classList.remove('listening');
      voiceBtn.setAttribute('aria-pressed', 'false');
    } else {
      recognition.lang = state.language + '-US';
      recognition.start();
      voiceBtn.classList.add('listening');
      voiceBtn.setAttribute('aria-pressed', 'true');
      announceToScreenReader('Voice input started. Speak your question now.');
    }
  });
} else {
  voiceBtn.title = 'Voice input not supported in this browser';
  voiceBtn.setAttribute('aria-label', 'Voice input not supported in this browser');
  voiceBtn.style.opacity = '0.4';
  voiceBtn.disabled = true;
}

// ─── CLEAR CHAT ───────────────────────────────────────────────
$('clearChatBtn').addEventListener('click', () => {
  const msgs = chatContainer.querySelectorAll('.message:not(#welcomeMsg)');
  msgs.forEach(m => m.remove());
  state.messageHistory = [];
  announceToScreenReader('Chat history cleared.');
});

// ─── QUICK TOPICS (welcome message) ──────────────────────────
document.querySelectorAll('.quick-topic').forEach(btn => {
  btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
});

// ─── UTILS ───────────────────────────────────────────────────
/** HTML-escape a string for safe DOM insertion. */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a string for use in an HTML attribute value. */
function escAttr(s) { return escHtml(s); }

/**
 * Converts a source string into a clickable link if it contains a URL.
 * @param {string} src
 * @returns {string} HTML string
 */
function linkifySource(src) {
  const urlMatch = src.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${escHtml(src.replace(url, '').trim() || url)}</a>`;
  }
  if (src.toLowerCase().includes('vote.gov')) {
    return `<a href="https://vote.gov" target="_blank" rel="noopener noreferrer">${escHtml(src)}</a>`;
  }
  return escHtml(src);
}

/** Returns current time as HH:MM string. */
function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Returns today's date as "Mon DD, YYYY". */
function getTodayDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Smoothly scrolls the chat container to the bottom. */
function scrollBottom() {
  setTimeout(() => chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' }), 50);
}

// Suppress unused-variable warnings for functions available globally for testing
void fetchElectionInfo;
void fetchVoterInfo;
//This is for deploying

//Added package