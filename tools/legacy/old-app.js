// Loads the pre-split single-file app (flashcards.html at LEGACY_REF) into a
// node vm so tests can compare against the old card list, the old cardKey()
// and the old FSRS code. Nothing in the running app depends on this file.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

// Last commit where flashcards.html was the whole app (session 35 included).
const LEGACY_REF = '218298c';
const ROOT = path.resolve(__dirname, '..', '..');

function legacyHtml() {
  try {
    return execFileSync('git', ['show', `${LEGACY_REF}:flashcards.html`], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return null;
  }
}

// A DOM stand-in that swallows everything the old init() and render() touch.
function fakeEl() {
  const el = {
    innerHTML: '', textContent: '', title: '', hidden: false, disabled: false, value: '',
    className: '', style: {}, onclick: null,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, insertAdjacentHTML() {}, focus() {}, addEventListener() {},
    querySelector() { return fakeEl(); }, querySelectorAll() { return []; },
  };
  return el;
}

function makeContext({ now = Date.UTC(2026, 0, 1, 12), seed = 1, storage = {} } = {}) {
  let t = now;
  let s = seed >>> 0;
  const rand = () => {   // mulberry32, so fuzz is reproducible
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(t); }
    static now() { return t; }
  }
  const math = Object.create(Math);
  math.random = rand;
  const ls = {
    _d: storage,
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  const document = {
    getElementById: () => fakeEl(), querySelector: () => fakeEl(), createElement: () => fakeEl(),
    addEventListener() {}, body: fakeEl(),
  };
  const ctx = {
    console, Date: FakeDate, Math: math, JSON, Set, Map, Object, Array, String, Number, RegExp,
    localStorage: ls, document, confirm: () => true, navigator: {}, innerWidth: 375,
    matchMedia: () => ({ matches: false }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return {
    ctx,
    setNow(v) { t = v; },
    getNow() { return t; },
    storage: ls._d,
    run(code) { return vm.runInContext(code, ctx); },
  };
}

// Returns a vm wrapper with the old app booted (or null if git is unavailable).
function loadOldApp(opts) {
  const html = legacyHtml();
  if (!html) return null;
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error('legacy flashcards.html: script block not found');
  const app = makeContext(opts);
  app.run(m[1]);
  return app;
}

module.exports = { LEGACY_REF, legacyHtml, loadOldApp, makeContext };
