/**
 * @fileoverview CivicMind client-side accessibility utilities.
 *
 * Provides helpers for:
 *   - Screen reader live region announcements
 *   - Focus trapping in modal dialogs
 *   - Reduced-motion preference detection
 *   - WCAG AA color contrast calculation
 *
 * Designed to be loaded in the browser (no Node.js dependencies).
 *
 * @module utils/accessibility
 */

'use strict';

// ─── SCREEN READER ANNOUNCEMENTS ─────────────────────────────────────────────

/**
 * Announces a message to screen readers via an aria-live region.
 *
 * Uses the `#a11y-announcer` element (polite) for informational messages
 * and `#status-announcer` (assertive) for urgent alerts.
 *
 * @param {string} message - The text to announce
 * @param {'polite'|'assertive'} [priority='polite'] - Announcement urgency
 * @returns {void}
 * @example
 * announceToScreenReader('New message from CivicMind received.');
 * announceToScreenReader('Error: could not send message.', 'assertive');
 */
function announceToScreenReader(message, priority = 'polite') {
  const id = priority === 'assertive' ? 'status-announcer' : 'a11y-announcer';
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  // Clear then set — forces re-announcement even if text is identical
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

// ─── FOCUS TRAP ───────────────────────────────────────────────────────────────

/** @type {HTMLElement|null} Element that had focus before the trap was set */
let _previouslyFocusedElement = null;

/** @type {((e: KeyboardEvent) => void)|null} Active keydown handler */
let _trapHandler = null;

/**
 * Traps keyboard focus inside a given element (e.g., a modal dialog).
 * Pressing Tab/Shift+Tab will cycle only within `element`.
 * Stores the previously focused element so `releaseFocus()` can restore it.
 *
 * @param {HTMLElement} element - The container to trap focus within
 * @returns {void}
 * @example
 * trapFocus(document.getElementById('locationModal'));
 */
function trapFocus(element) {
  if (!element) {
    return;
  }
  _previouslyFocusedElement = document.activeElement;

  const focusable = getFocusableElements(element);
  if (focusable.length === 0) {
    return;
  }

  // Remove any existing trap
  if (_trapHandler) {
    document.removeEventListener('keydown', _trapHandler);
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  _trapHandler = e => {
    if (e.key !== 'Tab') {
      return;
    }
    if (e.shiftKey) {
      // Shift+Tab: going backwards
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: going forwards
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', _trapHandler);
  first.focus();
}

/**
 * Releases the focus trap set by `trapFocus()` and restores focus to the
 * element that was focused before the trap was activated.
 *
 * @returns {void}
 * @example
 * releaseFocus(); // call when closing a modal
 */
function releaseFocus() {
  if (_trapHandler) {
    document.removeEventListener('keydown', _trapHandler);
    _trapHandler = null;
  }
  if (_previouslyFocusedElement && typeof _previouslyFocusedElement.focus === 'function') {
    _previouslyFocusedElement.focus();
  }
  _previouslyFocusedElement = null;
}

/**
 * Returns all focusable elements within a container, in DOM order.
 *
 * @param {HTMLElement} container - The element to search within
 * @returns {HTMLElement[]} Array of focusable elements
 */
function getFocusableElements(container) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return Array.from(container.querySelectorAll(selector)).filter(
    el => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'),
  );
}

// ─── REDUCED MOTION ───────────────────────────────────────────────────────────

/**
 * Returns `true` if the user has requested reduced motion in their OS settings.
 * Use this to conditionally skip animations.
 *
 * @returns {boolean}
 * @example
 * if (!prefersReducedMotion()) {
 *   element.animate([...], { duration: 300 });
 * }
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── COLOR CONTRAST (WCAG 2.1) ────────────────────────────────────────────────

/**
 * Calculates the WCAG 2.1 relative luminance of an RGB color.
 *
 * @param {number} r - Red channel (0–255)
 * @param {number} g - Green channel (0–255)
 * @param {number} b - Blue channel (0–255)
 * @returns {number} Relative luminance (0–1)
 */
function relativeLuminance(r, g, b) {
  const toLinear = c => {
    const srgb = c / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates the WCAG 2.1 contrast ratio between two RGB colors.
 * A ratio of 4.5:1 or higher meets WCAG AA for normal text.
 * A ratio of 3:1 or higher meets WCAG AA for large text.
 *
 * @param {{ r: number, g: number, b: number }} fg - Foreground color
 * @param {{ r: number, g: number, b: number }} bg - Background color
 * @returns {number} Contrast ratio (1–21)
 * @example
 * getContrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
 * // → 21 (maximum contrast)
 *
 * getContrastRatio({ r: 37, g: 99, b: 235 }, { r: 255, g: 255, b: 255 });
 * // → ~4.8 (passes WCAG AA)
 */
function getContrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns whether a color pair meets WCAG 2.1 AA contrast requirements.
 *
 * @param {{ r: number, g: number, b: number }} fg - Foreground color
 * @param {{ r: number, g: number, b: number }} bg - Background color
 * @param {'normal'|'large'} [textSize='normal'] - Text size (large = 18pt+ or 14pt bold)
 * @returns {{ passes: boolean, ratio: number, required: number }}
 */
function meetsWCAGAA(fg, bg, textSize = 'normal') {
  const ratio = getContrastRatio(fg, bg);
  const required = textSize === 'large' ? 3 : 4.5;
  return { passes: ratio >= required, ratio: Math.round(ratio * 100) / 100, required };
}

// Export for both browser (global) and Node.js (require) environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    announceToScreenReader,
    trapFocus,
    releaseFocus,
    getFocusableElements,
    prefersReducedMotion,
    getContrastRatio,
    meetsWCAGAA,
    relativeLuminance,
  };
}
