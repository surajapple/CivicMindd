'use strict';

/**
 * @fileoverview Accessibility tests for CivicMind.
 *
 * Tests cover:
 *   - WCAG utility functions (getContrastRatio, meetsWCAGAA, relativeLuminance)
 *   - Focus trap utility (getFocusableElements logic)
 *   - HTML structure checks (skip link, aria-live regions, button labels)
 *     using jsdom to parse public/index.html
 */

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const {
  getContrastRatio,
  meetsWCAGAA,
  relativeLuminance,
  getFocusableElements,
} = require('../src/utils/accessibility');

// ─── WCAG contrast utilities ──────────────────────────────────

describe('relativeLuminance', () => {
  test('black has luminance 0', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0);
  });

  test('white has luminance 1', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1);
  });

  test('mid-grey has luminance ~0.216', () => {
    expect(relativeLuminance(128, 128, 128)).toBeCloseTo(0.216, 1);
  });
});

describe('getContrastRatio', () => {
  test('black on white has contrast 21', () => {
    const ratio = getContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(21, 0);
  });

  test('white on white has contrast 1', () => {
    const ratio = getContrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(1, 0);
  });

  test('CivicMind blue (#2563EB) on white passes WCAG AA (>4.5)', () => {
    const ratio = getContrastRatio({ r: 37, g: 99, b: 235 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('is symmetric', () => {
    const fg = { r: 37, g: 99, b: 235 };
    const bg = { r: 255, g: 255, b: 255 };
    expect(getContrastRatio(fg, bg)).toBeCloseTo(getContrastRatio(bg, fg), 5);
  });
});

describe('meetsWCAGAA', () => {
  test('black on white passes for normal text', () => {
    const result = meetsWCAGAA({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 'normal');
    expect(result.passes).toBe(true);
    expect(result.required).toBe(4.5);
  });

  test('black on white passes for large text', () => {
    const result = meetsWCAGAA({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 'large');
    expect(result.passes).toBe(true);
    expect(result.required).toBe(3);
  });

  test('light grey on white fails normal text', () => {
    const result = meetsWCAGAA({ r: 200, g: 200, b: 200 }, { r: 255, g: 255, b: 255 }, 'normal');
    expect(result.passes).toBe(false);
  });

  test('returns ratio rounded to 2 decimal places', () => {
    const result = meetsWCAGAA({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(result.ratio).toBe(21);
  });
});

// ─── HTML structure (jsdom) ───────────────────────────────────

describe('public/index.html structure', () => {
  let document;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(html);
    document = dom.window.document;
  });

  test('has a skip-to-content link', () => {
    const skip = document.querySelector('.skip-link');
    expect(skip).not.toBeNull();
    expect(skip.getAttribute('href')).toBe('#main-content');
  });

  test('skip link points to an element that exists', () => {
    const target = document.getElementById('main-content');
    expect(target).not.toBeNull();
  });

  test('has a polite aria-live region (#a11y-announcer)', () => {
    const el = document.getElementById('a11y-announcer');
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('role')).toBe('status');
  });

  test('has an assertive aria-live region (#status-announcer)', () => {
    const el = document.getElementById('status-announcer');
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-live')).toBe('assertive');
    expect(el.getAttribute('role')).toBe('alert');
  });

  test('chat container has role=log and aria-live=polite', () => {
    const chat = document.getElementById('chatContainer');
    expect(chat).not.toBeNull();
    expect(chat.getAttribute('role')).toBe('log');
    expect(chat.getAttribute('aria-live')).toBe('polite');
  });

  test('all icon buttons have aria-label attributes', () => {
    const iconBtns = document.querySelectorAll('.icon-btn');
    expect(iconBtns.length).toBeGreaterThan(0);
    iconBtns.forEach(btn => {
      const label = btn.getAttribute('aria-label') || btn.getAttribute('title');
      expect(label).toBeTruthy();
    });
  });

  test('send button has aria-label', () => {
    const sendBtn = document.getElementById('sendBtn');
    expect(sendBtn).not.toBeNull();
    expect(sendBtn.getAttribute('aria-label')).toBeTruthy();
  });

  test('voice button has aria-label', () => {
    const voiceBtn = document.getElementById('voiceBtn');
    expect(voiceBtn).not.toBeNull();
    expect(voiceBtn.getAttribute('aria-label')).toBeTruthy();
  });

  test('user input textarea has aria-label', () => {
    const input = document.getElementById('userInput');
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBeTruthy();
  });

  test('location modal has role=dialog and aria-modal=true', () => {
    const modal = document.getElementById('locationModal');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-labelledby')).toBeTruthy();
  });

  test('accessibility panel has role=dialog', () => {
    const panel = document.getElementById('accessibilityPanel');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
  });

  test('language panel has role=dialog', () => {
    const panel = document.getElementById('langPanel');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
  });

  test('sidebar nav has aria-label', () => {
    const nav = document.querySelector('.sidebar-nav');
    expect(nav).not.toBeNull();
    expect(nav.getAttribute('aria-label')).toBeTruthy();
  });

  test('html element has lang attribute', () => {
    const html = document.documentElement;
    expect(html.getAttribute('lang')).toBe('en');
  });

  test('page has exactly one h1', () => {
    const h1s = document.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
  });

  test('all SVG icons in buttons have aria-hidden=true', () => {
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
      const svgs = btn.querySelectorAll('svg');
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });
});

// ─── getFocusableElements utility ────────────────────────────

describe('getFocusableElements', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <div id="container">
        <a href="/test" id="link1">Link</a>
        <button id="btn1">Button</button>
        <button id="btn2" disabled>Disabled</button>
        <input id="input1" type="text" />
        <input id="input2" type="text" disabled />
        <div id="div1" tabindex="0">Focusable div</div>
        <div id="div2" tabindex="-1">Not in tab order</div>
        <div hidden><button id="hiddenBtn">Hidden</button></div>
      </div>
    `);
    document = dom.window.document;
  });

  test('returns links, enabled buttons, enabled inputs, and tabindex=0 elements', () => {
    const container = document.getElementById('container');
    const focusable = getFocusableElements(container);
    const ids = focusable.map(el => el.id);
    expect(ids).toContain('link1');
    expect(ids).toContain('btn1');
    expect(ids).toContain('input1');
    expect(ids).toContain('div1');
  });

  test('excludes disabled buttons', () => {
    const container = document.getElementById('container');
    const focusable = getFocusableElements(container);
    const ids = focusable.map(el => el.id);
    expect(ids).not.toContain('btn2');
  });

  test('excludes disabled inputs', () => {
    const container = document.getElementById('container');
    const focusable = getFocusableElements(container);
    const ids = focusable.map(el => el.id);
    expect(ids).not.toContain('input2');
  });

  test('excludes tabindex=-1 elements', () => {
    const container = document.getElementById('container');
    const focusable = getFocusableElements(container);
    const ids = focusable.map(el => el.id);
    expect(ids).not.toContain('div2');
  });
});
