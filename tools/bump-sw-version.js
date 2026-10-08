#!/usr/bin/env node
// node tools/bump-sw-version.js          write sw.js VERSION = hash of the shell files
// node tools/bump-sw-version.js --check  exit 1 if VERSION is stale (tools/test.js runs this)
//
// The shell is what sw.js precaches: STATIC (read from sw.js itself), every
// relative <script src> and <link href> in index.html, and the url()s inside
// those stylesheets. Run this after changing any of them, before deploying;
// the new VERSION changes sw.js, which is how phones learn there is an update.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

// Same patterns as sw.js.
const SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
const HREF_RE = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
const URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const matches = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const isLocal = (p) => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('//');

function shellFiles() {
  const sw = fs.readFileSync(SW, 'utf8');
  const block = sw.match(/const STATIC = \[([\s\S]*?)\];/);
  if (!block) throw new Error('STATIC list not found in sw.js');
  const statics = matches(/'([^']+)'/g, block[1]);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const files = new Set();
  const add = (rel) => {
    rel = rel.split(/[?#]/)[0];
    if (rel === './' || rel === '') rel = 'index.html';
    const norm = path.posix.normalize(rel.replace(/^\.\//, ''));
    if (files.has(norm)) return;
    files.add(norm);
    if (norm.endsWith('.css')) {
      const css = fs.readFileSync(path.join(ROOT, norm), 'utf8');
      for (const u of matches(URL_RE, css)) {
        if (isLocal(u) && !u.startsWith('data:')) add(path.posix.join(path.posix.dirname(norm), u));
      }
    }
  };
  for (const p of [...statics, ...matches(SRC_RE, html), ...matches(HREF_RE, html)]) {
    if (isLocal(p)) add(p);
  }
  return [...files].sort();
}

function computeVersion() {
  const h = crypto.createHash('sha256');
  for (const f of shellFiles()) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) throw new Error(`shell file missing: ${f}`);
    h.update(f + '\0');
    h.update(fs.readFileSync(full));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

function currentVersion() {
  const m = fs.readFileSync(SW, 'utf8').match(/const VERSION = '([^']*)';/);
  return m ? m[1] : null;
}

module.exports = { shellFiles, computeVersion, currentVersion };

if (require.main === module) {
  const want = computeVersion();
  const have = currentVersion();
  if (process.argv.includes('--check')) {
    if (want !== have) {
      console.error(`sw.js VERSION is ${have}, shell hash is ${want}: run node tools/bump-sw-version.js`);
      process.exit(1);
    }
    console.log(`sw.js VERSION ${have} is current`);
  } else if (process.argv.includes('--list')) {
    console.log(shellFiles().join('\n'));
  } else if (want === have) {
    console.log(`sw.js VERSION ${have} already current`);
  } else {
    const sw = fs.readFileSync(SW, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${want}';`);
    fs.writeFileSync(SW, sw);
    console.log(`sw.js VERSION ${have} -> ${want}`);
  }
}
