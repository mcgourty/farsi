#!/usr/bin/env node
// apply-examples.js: write example sentences from tools/stories-src/examples.json
// into the vocabulary items of lessons/*.js as an `examples: [...]` field.
//
//   node tools/apply-examples.js           # rewrite lesson files
//   node tools/apply-examples.js --check   # exit 1 if any file would change
//
// examples.json is keyed "<session>|<fa exactly as in the deck>" (built by
// tools/stories-src/build-examples.js). Idempotent: an item's previous
// examples block is replaced, every other byte of the item line is kept, and
// items without examples are left as they were. Sentences whose source is a
// practice story that is not in lessons/stories.js are dropped, as are
// sentences identical to the item itself.
//
// Item format this relies on (every lesson file uses it): one item per line,
//     { id: "35.v.miz", type: "vocabulary", ... },
// which this tool turns into
//     { id: "35.v.miz", type: "vocabulary", ...,
//       examples: [
//         { fa: "…", pin: "…", en: "…", source: "phrase:35" },
//       ] },
'use strict';
const fs = require('fs');
const path = require('path');
const lemma = require('../js/lemma.js');
const { loadStories } = require('./coverage.js');

const ROOT = path.resolve(__dirname, '..');
const LESSONS = path.join(ROOT, 'lessons');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, 'stories-src', 'examples.json'), 'utf8'));
const shipped = new Set(loadStories(path.join(LESSONS, 'stories.js')).map(s => s.id));

const J = v => JSON.stringify(v);
// An item line plus an optional examples block this tool wrote earlier.
const ITEM_RE = /^( *)(\{ id: "[^"]+", type: "vocabulary", .*?)(?: \},|,\n\1 {2}examples: \[\n(?:\1 {4}\{.*\},\n)*\1 {2}\] \},)$/gm;

function sessionOf(src) {
  const m = src.match(/F\.lesson\(\{\s*\n\s*id: "([^"]+)"/);
  return m ? m[1] : null;
}
function field(line, name) {
  const m = line.match(new RegExp(`\\b${name}: ("(?:[^"\\\\]|\\\\.)*")`));
  return m ? JSON.parse(m[1]) : null;
}

function examplesFor(session, fa) {
  const list = examples[session + '|' + fa] || [];
  return list.filter(ex => {
    if (!ex || !String(ex.fa || '').trim() || !String(ex.en || '').trim()) return false;
    const st = /^story:(st-.+)$/.exec(ex.source || '');
    if (st && !shipped.has(st[1])) return false;
    return lemma.key(ex.fa).replace(/[.!?؟،]/g, '').trim() !== lemma.key(fa);
  });
}

const check = process.argv.includes('--check');
let changedFiles = 0, withEx = 0, total = 0, sentences = 0;
for (const f of fs.readdirSync(LESSONS).filter(f => /^s\d.*\.js$/.test(f)).sort()) {
  const file = path.join(LESSONS, f);
  const src = fs.readFileSync(file, 'utf8');
  const session = sessionOf(src);
  if (!session) continue;
  const next = src.replace(ITEM_RE, (all, ind, line) => {
    total++;
    const ex = examplesFor(session, field(line, 'fa'));
    if (!ex.length) return `${ind}${line} },`;
    withEx++; sentences += ex.length;
    return `${ind}${line},\n${ind}  examples: [\n`
      + ex.map(e => `${ind}    { fa: ${J(e.fa)}, pin: ${J(e.pin || '')}, en: ${J(e.en)}, source: ${J(e.source || '')} },\n`).join('')
      + `${ind}  ] },`;
  });
  if (next !== src) {
    changedFiles++;
    if (!check) fs.writeFileSync(file, next);
    console.log(`${check ? 'would update' : 'updated'} lessons/${f}`);
  }
}
console.log(`${withEx}/${total} vocabulary items have examples (${sentences} sentences)`);
if (check && changedFiles) process.exitCode = 1;
