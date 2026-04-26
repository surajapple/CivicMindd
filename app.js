// ============================================================
//  CivicMind — Election Education Assistant
//  app.js  |  Non-partisan · Accessible · Civic-minded
// ============================================================

'use strict';

// ─── CONFIG ─────────────────────────────────────────────────
const CONFIG = {
  GEMINI_API_KEY: 'AIzaSyA-lt49QIWagOaFomzpr30-duynkjaqCGY',
  CIVIC_API_KEY: 'YOUR_CIVIC_API_KEY',     // Google Civic Info API
  CALENDAR_API_KEY: 'YOUR_CALENDAR_KEY',   // Google Calendar API
  CIVIC_BASE: 'https://www.googleapis.com/civicinfo/v2',
  MAX_INPUT: 1000,
  RATE_LIMIT_MS: 1500,
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

// ─── SYSTEM PROMPT ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are CivicMind, a non-partisan, accessible election education assistant.

MISSION: Demystify the democratic process — registration, voting timelines, ballot types, results, and civics — for any user, regardless of literacy level, language preference, or political background.

STRICT RULES:
1. NEVER endorse political parties, candidates, or ideologies.
2. NEVER discourage voting.
3. ALWAYS present balanced, factual, officially sourced information.
4. NEVER make up election dates, polling locations, or legal deadlines.
5. NEVER collect or request sensitive PII (SSN, full DOB, driver license number).
6. NEVER speculate about election outcomes or poll predictions.
7. NEVER amplify election misinformation — gently correct with source citations.
8. NEVER advise on WHO to vote for — only HOW to vote (the process).
9. If asked about contested elections or fraud claims: "I can share what election authorities and courts have officially stated. Would that be helpful?"
10. If asked anything outside election education: "I'm only able to help with election education questions."

TOPICS YOU CAN HELP WITH:
- Voter registration (eligibility, deadlines, online/in-person, ID requirements, status checks)
- Election timelines (candidate filing, primaries, general election, runoffs, certification)
- Voting process (polling locations, early voting, absentee/mail-in ballots, accessibility)
- Ballot guide (how to read a ballot, measures, propositions, judicial retention)
- Results & certification (how votes are counted, canvassed, certified)
- Civics (electoral college, ranked choice voting, redistricting, campaign finance)

TONE: Warm, patient, civic-minded. Like a trusted librarian, not a government form.
LANGUAGE: Default plain language (Grade 6–8 reading level). If user writes in another language, respond in that language. Keep sentences under 20 words where possible.

RESPONSE FORMAT — Always use this exact JSON structure:
{
  "answer": "Direct 2-4 sentence answer",
  "hasSteps": true/false,
  "steps": ["Step 1 text", "Step 2 text"],
  "hasTimeline": true/false,
  "timelineNote": "e.g. You have X days until the deadline",
  "source": "Official source name and URL if known",
  "quickReplies": ["Option 1", "Option 2", "Option 3"],
  "offerCalendar": true/false,
  "calendarEventName": "Event name if offerCalendar is true",
  "offerMap": false,
  "mapAddress": "",
  "isGuardrail": false,
  "guardrailMsg": ""
}

If you cannot answer accurately, say so and direct to vote.gov or the user's state election authority.`;

// ─── DOM REFS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const splashScreen   = $('splash-screen');
const app            = $('app');
const startBtn       = $('startBtn');
const chatContainer  = $('chatContainer');
const userInput      = $('userInput');
const sendBtn        = $('sendBtn');
const charCount      = $('charCount');
const typingIndicator= $('typingIndicator');
const jurisdictionText = $('jurisdictionText');
const sidebarEl      = $('sidebar');
const sidebarToggle  = $('sidebarToggle');
const mobileMenuBtn  = $('mobileMenuBtn');

// ─── SPLASH → APP ─────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  splashScreen.style.animation = 'fadeOut 0.4s ease forwards';
  setTimeout(() => {
    splashScreen.classList.add('hidden');
    app.classList.remove('hidden');
    userInput.focus();
  }, 380);
});

// Inject fadeOut keyframe
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = '@keyframes fadeOut{to{opacity:0;transform:translateY(-10px)}}';
document.head.appendChild(fadeOutStyle);

// ─── SIDEBAR ──────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => sidebarEl.classList.toggle('collapsed'));
mobileMenuBtn.addEventListener('click', () => sidebarEl.classList.toggle('open'));

document.querySelectorAll('.topic-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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

function updateTopicHeader(topic) {
  const map = {
    general:      ['Election Education Chat', 'Ask me anything about voting and elections'],
    registration: ['Voter Registration', 'Eligibility, deadlines, and how to register'],
    timeline:     ['Election Timelines', 'Key dates for primaries, general elections, and more'],
    voting:       ['Voting Process', 'Polling places, early voting, mail-in ballots'],
    ballot:       ['Ballot Guide', 'How to read and understand your ballot'],
    results:      ['Results & Certification', 'How votes are counted and when results are final'],
    civics:       ['Civics 101', 'Electoral college, redistricting, campaign finance'],
  };
  $('currentTopicTitle').textContent = map[topic]?.[0] || 'Election Education Chat';
  $('currentTopicSubtitle').textContent = map[topic]?.[1] || 'Ask me anything about voting and elections';
}

// ─── INPUT HANDLING ───────────────────────────────────────────
userInput.addEventListener('input', () => {
  const len = userInput.value.length;
  charCount.textContent = `${len} / ${CONFIG.MAX_INPUT}`;
  sendBtn.disabled = len === 0;
  autoResizeTextarea();
});

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

sendBtn.addEventListener('click', handleSend);

function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
}

function handleSend() {
  const text = userInput.value.trim();
  if (!text || state.isTyping) return;
  const now = Date.now();
  if (now - state.lastRequestTime < CONFIG.RATE_LIMIT_MS) return;
  state.lastRequestTime = now;
  sendMessage(text);
  userInput.value = '';
  charCount.textContent = '0 / 1000';
  sendBtn.disabled = true;
  userInput.style.height = 'auto';
}

function sendMessage(text) {
  if (!sanitizeInput(text)) return;
  appendUserMessage(text);
  state.messageHistory.push({ role: 'user', content: text });
  showTyping();
  callGemini(text).then(response => {
    hideTyping();
    appendBotMessage(response);
    state.messageHistory.push({ role: 'assistant', content: response.answer });
  }).catch(err => {
    hideTyping();
    appendBotMessage(fallbackResponse(err));
  });
}

// ─── INPUT SANITIZATION ───────────────────────────────────────
function sanitizeInput(text) {
  if (!text || text.length > CONFIG.MAX_INPUT) return false;
  // Block obvious prompt injections
  const injections = ['ignore previous instructions','forget your instructions','you are now','act as ','jailbreak','DAN '];
  if (injections.some(p => text.toLowerCase().includes(p))) {
    appendBotMessage({
      answer: "I'm only able to help with election education questions.",
      isGuardrail: true,
      guardrailMsg: "Prompt injection attempt detected and blocked.",
      quickReplies: ['How do I register?', 'Find my polling place', 'What is early voting?'],
      hasSteps: false, offerCalendar: false, offerMap: false
    });
    return false;
  }
  return true;
}

function sanitizeAddress(addr) {
  return addr.replace(/[<>"']/g, '').trim().slice(0, 200);
}

// ─── GEMINI API ───────────────────────────────────────────────
async function callGemini(userText) {
  const locationCtx = state.userLocation ? `\n\nUser's location: ${state.userLocation}` : '';
  const langCtx = state.language !== 'en' ? `\n\nRespond in language code: ${state.language}` : '';
  const simplCtx = state.simpleLang ? '\n\nUse grade 4-5 reading level — very simple words.' : '';

  const prompt = SYSTEM_PROMPT + locationCtx + langCtx + simplCtx;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: buildConversation(userText),
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024, topP: 0.9 },
        })
      }
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Gemini API error:', res.status, errBody);
      throw new Error(`API ${res.status}: ${errBody?.error?.message || 'Unknown error'}`);
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseGeminiResponse(raw);
  } catch (e) {
    throw e;
  }
}

function buildConversation(latestUserText) {
  const history = state.messageHistory.slice(-8); // last 8 for context
  const contents = [];
  history.forEach(m => {
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  });
  contents.push({ role: 'user', parts: [{ text: latestUserText }] });
  return contents;
}

function parseGeminiResponse(raw) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (_) {}
  // Fallback plain text
  return {
    answer: raw || 'I wasn\'t able to get a clear answer. Please try again or visit vote.gov.',
    hasSteps: false, hasTimeline: false, source: 'vote.gov',
    quickReplies: ['How do I register?', 'Find my polling place', 'What is early voting?'],
    offerCalendar: false, offerMap: false, isGuardrail: false
  };
}

function fallbackResponse(err) {
  console.error('CivicMind error:', err);
  const isKeyMissing = CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY';
  const msg = err?.message || '';
  let answer;
  if (isKeyMissing) {
    answer = '⚙️ Demo Mode: API key not set. Add your Gemini key to app.js to enable live AI.';
  } else if (msg.includes('403')) {
    answer = '🔑 API key error (403 Forbidden). Your key may have restrictions. In Google AI Studio → API Keys, make sure there are no HTTP referrer restrictions, or generate a new unrestricted key.';
  } else if (msg.includes('429')) {
    answer = '⏳ Rate limit reached. Please wait a moment and try again.';
  } else {
    answer = `⚠️ Connection error: ${msg}. Please try again.`;
  }
  return {
    answer,
    hasSteps: isKeyMissing,
    steps: isKeyMissing ? [
      'Visit your state\'s official Secretary of State website',
      'Click "Register to Vote" and fill in your name, address, and ID info',
      'Submit before your state\'s registration deadline',
      'Check your registration status online after 3-5 business days',
    ] : [],
    hasTimeline: isKeyMissing,
    timelineNote: isKeyMissing ? 'General deadlines vary by state — many require registration 15-30 days before Election Day' : '',
    source: 'vote.gov — Official U.S. Voter Information',
    quickReplies: ['How do I check my registration?', 'What ID do I need to vote?', 'What is early voting?'],
    offerCalendar: false,
    offerMap: false,
    isGuardrail: false,
  };
}

// ─── MESSAGE RENDERING ────────────────────────────────────────
function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `
    <div class="msg-avatar" style="background:var(--blue);color:white;font-weight:700;font-size:0.8rem;">
      YOU
    </div>
    <div class="msg-body">
      <div class="msg-bubble">${escHtml(text)}</div>
      <span class="msg-time">${getTime()}</span>
    </div>`;
  chatContainer.appendChild(div);
  scrollBottom();
}

function appendBotMessage(data) {
  const div = document.createElement('div');
  div.className = 'message bot-message';
  let html = `
    <div class="msg-avatar">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22" fill="url(#avMsg${Date.now()})"/>
        <path d="M14 24l7 7 13-13" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <defs><linearGradient id="avMsg${Date.now()}" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/>
        </linearGradient></defs>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-bubble${data.isGuardrail ? ' guardrail-bubble' : ''}">`;

  // ANSWER
  if (data.answer) {
    html += `<div class="answer-section"><p>${escHtml(data.answer)}</p></div>`;
  }

  // TIMELINE PILL
  if (data.hasTimeline && data.timelineNote) {
    html += `<div class="timeline-pill">⏱️ ${escHtml(data.timelineNote)}</div>`;
  }

  // STEPS
  if (data.hasSteps && data.steps?.length) {
    html += `<div class="steps-section"><div class="section-label">📋 Steps</div><ol class="steps-list">`;
    data.steps.forEach(s => { html += `<li>${escHtml(s)}</li>`; });
    html += `</ol></div>`;
  }

  // SOURCE
  if (data.source) {
    html += `<div class="source-section"><div class="source-box">📚 <strong>Source:</strong> ${linkifySource(data.source)}<br/><small style="color:var(--text3)">Retrieved: ${getTodayDate()} · Always verify with your local election authority</small></div></div>`;
  }

  // MAP LINK
  if (data.offerMap && data.mapAddress) {
    const enc = encodeURIComponent(sanitizeAddress(data.mapAddress));
    html += `<a href="https://maps.google.com/?q=${enc}" target="_blank" rel="noopener" class="map-link">🗺️ Get Directions in Google Maps</a>`;
  }

  // QUICK REPLIES
  if (data.quickReplies?.length) {
    html += `<div class="next-steps-section"><div class="section-label">💬 What's next?</div><div class="quick-replies">`;
    data.quickReplies.forEach(r => {
      html += `<button class="quick-reply" data-prompt="${escAttr(r)}">${escHtml(r)}</button>`;
    });
    html += `</div></div>`;
  }

  // CALENDAR OFFER
  if (data.offerCalendar && data.calendarEventName) {
    html += `<div class="calendar-section"><button class="calendar-offer" data-event="${escAttr(data.calendarEventName)}">📅 Add "${escHtml(data.calendarEventName)}" to Google Calendar</button></div>`;
  }

  html += `</div><span class="msg-time">CivicMind · ${getTime()}</span></div></div>`;
  div.innerHTML = html;

  // Wire up quick replies
  div.querySelectorAll('.quick-reply').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
  });
  // Wire up calendar buttons
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
  scrollBottom();
}
function hideTyping() {
  state.isTyping = false;
  typingIndicator.classList.add('hidden');
}

// ─── CIVIC API ────────────────────────────────────────────────
async function fetchElectionInfo(address) {
  if (CONFIG.CIVIC_API_KEY === 'YOUR_CIVIC_API_KEY') return null;
  try {
    const clean = encodeURIComponent(sanitizeAddress(address));
    const res = await fetch(`${CONFIG.CIVIC_BASE}/elections?key=${CONFIG.CIVIC_API_KEY}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchVoterInfo(address, electionId) {
  if (CONFIG.CIVIC_API_KEY === 'YOUR_CIVIC_API_KEY') return null;
  try {
    const clean = encodeURIComponent(sanitizeAddress(address));
    const res = await fetch(`${CONFIG.CIVIC_BASE}/voterinfo?address=${clean}&electionId=${electionId}&key=${CONFIG.CIVIC_API_KEY}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── CALENDAR ─────────────────────────────────────────────────
function addToCalendar(eventName) {
  // Opens Google Calendar "create event" page (no OAuth needed for basic link)
  const title = encodeURIComponent(eventName);
  const today = new Date();
  const dateStr = today.toISOString().replace(/-|:|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${encodeURIComponent('Reminder from CivicMind — verify with your local election authority at vote.gov')}&sf=true`;
  window.open(url, '_blank');
  showToast();
}

function showToast() {
  const toast = $('calendarToast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}
$('toastClose').addEventListener('click', () => $('calendarToast').classList.add('hidden'));

// ─── LOCATION MODAL ───────────────────────────────────────────
$('setLocationBtn').addEventListener('click', () => $('locationModal').classList.remove('hidden'));
$('locationModalClose').addEventListener('click', () => $('locationModal').classList.add('hidden'));
$('locationModalCancel').addEventListener('click', () => $('locationModal').classList.add('hidden'));
$('locationModalConfirm').addEventListener('click', () => {
  const loc = $('locationInput').value.trim();
  if (loc) {
    state.userLocation = sanitizeAddress(loc);
    jurisdictionText.textContent = `📍 Location: ${state.userLocation} — showing local election info`;
    sendMessage(`I'm located in ${state.userLocation}. What local election information do you have for me?`);
  }
  $('locationModal').classList.add('hidden');
});

// ─── ACCESSIBILITY PANEL ──────────────────────────────────────
$('accessibilityBtn').addEventListener('click', () => $('accessibilityPanel').classList.remove('hidden'));
$('a11yPanelClose').addEventListener('click', () => $('accessibilityPanel').classList.add('hidden'));
$('accessibilityPanel').addEventListener('click', e => { if (e.target === $('accessibilityPanel')) $('accessibilityPanel').classList.add('hidden'); });

$('largeTextToggle').addEventListener('change', e => document.body.classList.toggle('large-text', e.target.checked));
$('highContrastToggle').addEventListener('change', e => document.body.classList.toggle('high-contrast', e.target.checked));
$('reduceMotionToggle').addEventListener('change', e => document.body.classList.toggle('reduce-motion', e.target.checked));
$('simpleLangToggle').addEventListener('change', e => { state.simpleLang = e.target.checked; });

// ─── LANGUAGE PANEL ───────────────────────────────────────────
$('langBtn').addEventListener('click', () => $('langPanel').classList.remove('hidden'));
$('langPanelClose').addEventListener('click', () => $('langPanel').classList.add('hidden'));
$('langPanel').addEventListener('click', e => { if (e.target === $('langPanel')) $('langPanel').classList.add('hidden'); });

document.querySelectorAll('.lang-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.language = btn.dataset.lang;
    $('langPanel').classList.add('hidden');
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
    voiceBtn.classList.remove('listening');
  };
  recognition.onerror = () => voiceBtn.classList.remove('listening');
  recognition.onend = () => voiceBtn.classList.remove('listening');

  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('listening')) {
      recognition.stop();
      voiceBtn.classList.remove('listening');
    } else {
      recognition.lang = state.language + '-US';
      recognition.start();
      voiceBtn.classList.add('listening');
    }
  });
} else {
  voiceBtn.title = 'Voice input not supported in this browser';
  voiceBtn.style.opacity = '0.4';
  voiceBtn.disabled = true;
}

// ─── CLEAR CHAT ───────────────────────────────────────────────
$('clearChatBtn').addEventListener('click', () => {
  // Keep welcome message, remove rest
  const msgs = chatContainer.querySelectorAll('.message:not(#welcomeMsg)');
  msgs.forEach(m => m.remove());
  state.messageHistory = [];
});

// ─── QUICK TOPICS (in welcome message) ───────────────────────
document.querySelectorAll('.quick-topic').forEach(btn => {
  btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
});

// ─── UTILS ───────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(s) { return escHtml(s); }

function linkifySource(src) {
  const urlMatch = src.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    return `<a href="${url}" target="_blank" rel="noopener">${escHtml(src.replace(url, '').trim() || url)}</a>`;
  }
  if (src.toLowerCase().includes('vote.gov')) {
    return `<a href="https://vote.gov" target="_blank" rel="noopener">${escHtml(src)}</a>`;
  }
  return escHtml(src);
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getTodayDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scrollBottom() {
  setTimeout(() => chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' }), 50);
}
