#!/usr/bin/env node
// coverage.js: how much of a Persian text is already known at a given session?
//
// Tokenises Persian text, normalises it, lemmatises every token and checks it
// against what the deck has taught up to and including a cutoff session: all
// vocabulary, grammar, phrase and story cards of those sessions, every word
// that appears anywhere in them, and every conjugated form of each verb the
// deck has introduced by then (built with the deck's own conj()).
// The tokeniser and lemmatiser live in js/lemma.js (shared with the reader view
// in the browser); this file adds deck loading and the command line.
//
// No dependencies. Usage (from the repo root):
//
//   node tools/coverage.js --cutoff 35 "کلیدم روی میزه."              # a text
//   node tools/coverage.js --cutoff 35 --file story.txt                 # a text file
//   node tools/coverage.js --stories lessons/stories.js [--id st-35-1]  # shipped stories, each at its own session
//   node tools/coverage.js --stories draft.json [--update]              # stories as JSON; --update rewrites coverage
//   node tools/coverage.js --lemmas "کتاب‌هامون"                        # debug: show candidate lemmas
//   node tools/coverage.js --dump-deck deck.json                        # write the normalised deck
//
// To write new practice stories, edit tools/stories-src/stories.src.js and run
// node tools/stories-src/build-stories.js (see the header of that file).
//
// Deck source (first that applies):
//   --deck deck.json          a deck already dumped with --dump-deck
//   --deck flashcards.html    the legacy single-file app (const sNN_vocab = [...], VERBS, conj)
//   --repo /path/to/farsi     the modular app (index.html + lessons/*.js + js/verbs.js via tools/load.js)
//   (default) the repo this file lives in
//
// Other options:
//   --names "نام۱ نام۲"       extra proper names to treat as known
//   --known "word word"       extra words to treat as known
//   --notes-dir DIR           where ALEX-SESSION-NN_*.md|.txt lesson notes live (default: the repo root).
//                             Words in a session's notes unlock FUNCTION_WORDS only.
//   --json                    machine-readable output
//
// As a library: const cov = require('./tools/coverage.js');
//   const deck = cov.loadDeck({ repo }); const lex = cov.buildLexicon(deck, '35', { notesFiles: cov.findNotes(dir) });
//   cov.analyse(text, lex) -> { total, known, coverage, unknown:[{token,count,laterSession}] }
//   cov.lemmas(token, lex) -> Set of candidate lemma keys (nouns: normalised word, verbs: 'V:<verbId>')
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const lemma = require('../js/lemma.js');
const { normChars, key, tokenise, finishVerbs, buildLexicon, lemmas, classify, analyse, nounCandidates, verbCandidates } = lemma;

// ---------------------------------------------------------------- deck loading
// Legacy flashcards.html: pull out the declarations we need and run them in a sandbox.
function extractDecl(src, name) {
  const re = new RegExp('(?:^|\\n)\\s*(const|let|var|function)\\s+' + name + '\\b');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  // find the opening bracket of the value / body
  const open = src.slice(i).search(/[\[{(]/);
  i += open;
  let depth = 0, str = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) {
      depth--;
      if (depth === 0) {
        // for functions, the first (...) is the parameter list; keep going to the body
        if (m[1] === 'function' && c === ')') continue;
        return src.slice(m.index, j + 1) + ';';
      }
    }
  }
  return null;
}

function loadLegacyHtml(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sessionNames = [...src.matchAll(/const (s(\d+)_(vocab|grammar|phrases|story))\s*=\s*\[/g)];
  const ctx = {};
  vm.createContext(ctx);
  const sessions = new Map();
  for (const m of sessionNames) {
    const code = extractDecl(src, m[1]);
    const arr = vm.runInContext(code.replace(/^\s*const /, 'var ') + '\n' + m[1], ctx);
    const digits = m[2];
    const id = digits.length === 4 ? digits.slice(0, 2) + '-' + digits.slice(2) : digits;
    const type = { vocab: 'vocabulary', grammar: 'grammar', phrases: 'phrases', story: 'story' }[m[3]];
    if (!sessions.has(id)) sessions.set(id, { id, items: [] });
    for (const it of arr) sessions.get(id).items.push({ type, fa: it[0], pin: it[1], en: it[2], notes: it[3] || '' });
  }
  // The verb block runs from the verb dataset to the end of conj(); it has no DOM access.
  const a = src.search(/\n\s*(\/\/ =+ Verb dataset|const PERSONS\s*=)/);
  const b = src.search(/\n\s*function drillKey\b/);
  if (a < 0 || b < 0) throw new Error('verb block not found in ' + file);
  vm.runInContext(src.slice(a, b).replace(/(^|\n)\s*(const|let) /g, '$1var ') + '\nthis.VERBS = VERBS; this.conj = conj;', ctx);
  const order = [...sessions.values()].sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
  return { sessions: order, verbs: finishVerbs(ctx.VERBS, ctx.conj) };
}

function loadRepo(root) {
  const loader = require(path.join(root, 'tools', 'load.js'));
  const { F } = loader.loadApp();
  return lemma.deckFromF(F);
}

function loadDeck(opts = {}) {
  if (opts.deck) {
    if (/\.json$/i.test(opts.deck)) return JSON.parse(fs.readFileSync(opts.deck, 'utf8'));
    return loadLegacyHtml(opts.deck);
  }
  if (opts.repo) return loadRepo(path.resolve(opts.repo));
  const here = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(here, 'tools', 'load.js'))) return loadRepo(here);
  throw new Error('No deck found: pass --deck <deck.json|flashcards.html> or --repo <path>');
}

// Stories: a JSON array, or a lessons/stories.js file (F.stories = [...]).
function loadStories(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) return JSON.parse(src);
  const ctx = { F: {} };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: file });
  return JSON.parse(JSON.stringify(ctx.F.stories || []));
}


// ---------------------------------------------------------------- CLI
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['json', 'update'].includes(k)) o[k] = true;
      else o[k] = argv[++i];
    } else o._.push(a);
  }
  return o;
}

function storyText(st) { return (st.lines || []).map(l => l.fa).join(' '); }

function report(label, res, asJson) {
  if (asJson) return;
  const pct = (res.coverage * 100).toFixed(1);
  console.log(`${label}: ${pct}% known (${res.known}/${res.total} tokens)`);
  for (const u of res.unknown) console.log(`   unknown: ${u.token}${u.count > 1 ? ' x' + u.count : ''}${u.laterSession ? '  (taught in ' + u.laterSession + ')' : ''}`);
}

// Find lesson-notes files: ALEX-SESSION-24_formatted.md -> session '24'
// Find lesson-notes files: ALEX-SESSION-24_formatted.md -> session '24' (with their text)
function findNotes(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => ({ f, m: f.match(/^ALEX-SESSION-(\d+)(?:-\d+)?.*\.(md|txt)$/i) }))
    .filter(x => x.m).map(x => {
      const file = path.join(dir, x.f);
      return { session: x.m[1], file, text: fs.readFileSync(file, 'utf8') };
    });
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const deck = loadDeck({ deck: o.deck, repo: o.repo });
  const notesDir = o['notes-dir'] || o.repo || (o.deck && !/\.json$/i.test(o.deck) ? path.dirname(o.deck) : path.resolve(__dirname, '..'));
  const extra = { names: (o.names || '').split(/\s+/).filter(Boolean), known: (o.known || '').split(/\s+/).filter(Boolean),
    notesFiles: findNotes(notesDir) };
  if (o['dump-deck']) { fs.writeFileSync(o['dump-deck'], JSON.stringify(deck, null, 1)); console.log('wrote ' + o['dump-deck']); return; }
  if (o.lemmas) {
    const lex = buildLexicon(deck, o.cutoff || null, extra);
    for (const t of tokenise(o.lemmas)) console.log(t, [...lemmas(t, lex)].join(' '), JSON.stringify(classify(t, lex)));
    return;
  }
  if (o.stories) {
    const stories = loadStories(o.stories);
    if (o.update && !/\.json$/i.test(o.stories)) { console.error('--update only rewrites JSON; rebuild lessons/stories.js with node tools/stories-src/build-stories.js'); process.exit(2); }
    const results = [];
    let fail = 0;
    for (const st of stories) {
      if (o.id && st.id !== o.id) continue;
      const lex = buildLexicon(deck, o.cutoff || st.session, Object.assign({}, extra, { names: extra.names.concat(st.names || []) }));
      const res = analyse(storyText(st), lex);
      if (res.coverage < 0.95) fail++;
      results.push(Object.assign({ id: st.id, session: st.session }, res));
      report(`${st.id} @${lex.cutoffId}`, res, o.json);
      if (o.update) st.coverage = Math.round(res.coverage * 1000) / 1000;
    }
    if (o.update) fs.writeFileSync(o.stories, JSON.stringify(stories, null, 1) + '\n');
    if (o.json) console.log(JSON.stringify(results, null, 1));
    process.exitCode = fail ? 1 : 0;
    return;
  }
  const text = o.file ? fs.readFileSync(o.file, 'utf8') : o._.join(' ');
  if (!text.trim()) { console.error('Nothing to check. See the header of coverage.js for usage.'); process.exit(2); }
  const lex = buildLexicon(deck, o.cutoff || null, extra);
  const res = analyse(text, lex);
  if (o.json) console.log(JSON.stringify(res, null, 1)); else report(`@${lex.cutoffId}`, res);
}

module.exports = { findNotes, normChars, key, tokenise, loadDeck, loadLegacyHtml, loadRepo, loadStories, buildLexicon, lemmas, classify, analyse, nounCandidates, verbCandidates, lemma };
if (require.main === module) main();