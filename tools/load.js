// Loads the app's data modules into a node vm, in the order index.html lists
// them, so tools and tests see exactly the deck the browser builds.
// UI scripts (js/ui/*, js/app.js, js/audio.js) are skipped unless asked for.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function scriptList() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

const DATA_SCRIPTS = src => !/^js\/(ui\/|app\.js|audio\.js)/.test(src);

function memoryStorage(init = {}) {
  const d = Object.assign({}, init);
  return {
    _d: d,
    getItem: k => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; },
    key: i => Object.keys(d)[i] || null,
    get length() { return Object.keys(d).length; },
  };
}

// opts.filter(src) chooses scripts; opts.storage seeds localStorage.
function loadApp(opts = {}) {
  const filter = opts.filter || DATA_SCRIPTS;
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON,
    Date: opts.Date || Date,
    Math: opts.Math || Math,
    localStorage: opts.localStorage || memoryStorage(opts.storage),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const src of scriptList().filter(filter)) {
    const file = path.join(ROOT, src);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  const F = ctx.F;
  if (F.cards && F.cards.build) F.cards.build();
  return { F, ctx, run: code => vm.runInContext(code, ctx) };
}

module.exports = { ROOT, scriptList, loadApp, memoryStorage };
