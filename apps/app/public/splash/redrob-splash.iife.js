(function () {
/* Redrob launch splash - Redrob Design System 2026.
 *
 * Two beats, once per session:
 *   1. The Redrob lockup, uncovered along a 40 degree edge with light riding on it
 *      (MarkReveal, 10-logo.md "Animation"). Primary on light, Primary White on dark.
 *   2. The product icon settles in from 90 percent, one pass of light crosses it, and
 *      its symbol keeps its one quiet working state (40-surfaces-and-motion.md,
 *      "Product symbols") with the product name in Pretendard SemiBold beneath it.
 *
 * Reduced motion: nothing moves; the lockup, then the still icon. Any key or click skips.
 * Generated from the DS files by brand-2026/kit-src; the artwork is never redrawn.
 */

const PRODUCT = "cowork"
const NAME = "Redrob Cowork"

const ARRIVE = 1400 // MarkReveal arrival
const HOLD = 300 // the lockup at rest before it hands over
const COVER = 320 // the lockup re-covered along the same edge (duration-slow)
const SETTLE = 600 // product icon settling in from 90 percent
const MIN_PRODUCT = 900 // the product beat is seen even when the app is already up
const OUT = 280 // the splash leaving

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function seen(key) {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markSeen(key) {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    /* a private window still shows the splash, just every time */
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Show the splash over the page and remove it when `ready` settles.
 *
 * @param {object} opts
 * @param {string} opts.logoLight  URL of redrob-logo-primary.png (light ground)
 * @param {string} opts.logoDark   URL of redrob-logo-primary-white.png (dark ground)
 * @param {Promise<unknown>} [opts.ready]  settles when the app can be used
 * @param {'light'|'dark'|'system'} [opts.theme]  default: data-theme, then the system
 * @param {HTMLElement} [opts.parent]  default: document.body
 * @param {boolean} [opts.once]  once per session (sessionStorage), default true
 * @param {number} [opts.maxMs]  give up waiting for `ready` after this, default 20000
 * @returns {Promise<void>} resolves once the splash is gone
 */
function showRedrobSplash(opts) {
  // Round 33: BOTH renderer logo reveals were removed at the user's request --
  // beat 1 (the lockup/MarkReveal) AND beat 2 (the Cowork glyph, which flashed the
  // old red mark). This renderer splash now paints no logo at all; the launcher's
  // own window animation is the launch moment. The function keeps its signature and
  // resolves once the app is ready, so index.html's call chain is unaffected.
  const key = `redrob-splash:${PRODUCT}`
  const once = opts.once !== false
  if (once && seen(key)) return Promise.resolve()
  if (once) markSeen(key)
  // Resolve as soon as the app is ready (or the maxMs ceiling), rendering nothing.
  return Promise.race([Promise.resolve(opts.ready).catch(() => {}), wait(opts.maxMs ?? 20000)])
}


window.showRedrobSplash = showRedrobSplash
})()
