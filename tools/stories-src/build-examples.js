// Build tools/stories-src/examples.json: up to 4 example sentences for every
// vocabulary card, drawn from the deck's phrases and story lines (any session)
// and the practice stories in lessons/stories.js. Prints coverage stats.
// Keys are "<session>|<fa exactly as in the deck>".
//
//   node tools/stories-src/build-examples.js [--forms] [--zero]
//   node tools/apply-examples.js            # then write them into lessons/*.js
'use strict';
const fs = require('fs');
const path = require('path');
const cov = require('../coverage.js');

const ROOT = path.resolve(__dirname, '..', '..');
const deck = cov.loadDeck({ repo: ROOT });
const stories = cov.loadStories(path.join(ROOT, 'lessons', 'stories.js'));
const lex = cov.buildLexicon(deck, null, {});
const order = new Map(deck.sessions.map((s, i) => [s.id, i]));
const K = cov.key;

// A word that is a dictionary entry or a function word (بدون, خونه) is not read as a verb
// form (بـ + دون, خون + ه) unless it is literally one of the deck's verb forms.
const NOT_VERBS = new Set();
for (const s of deck.sessions) for (const it of s.items) if (it.type === 'vocabulary' && !/^to /.test(it.en)) for (const w of cov.tokenise(it.fa)) NOT_VERBS.add(K(w));
const NEVER_VERBS = new Set(['بدون', 'باید', 'بعد', 'برای', 'بین', 'بیشتر', 'نه', 'بد', 'مردم'].map(K)); // مردم: "people" in this deck
function verbSafe(k, lem) {
  if (!NEVER_VERBS.has(k) && (!NOT_VERBS.has(k) || lex.formMap.has(k))) return lem;
  return new Set([...lem].filter(x => !x.startsWith('V:')));
}

// ---- sentence pool
const pool = [];
for (const s of deck.sessions) {
  for (const it of s.items) {
    if (it.type !== 'phrases' && it.type !== 'story') continue;
    pool.push({ fa: it.fa, pin: it.pin, en: it.en, source: (it.type === 'phrases' ? 'phrase:' : 'story:') + s.id, si: order.get(s.id) });
  }
}
for (const st of stories) for (const l of st.lines) pool.push({ fa: l.fa, pin: l.pin, en: l.en, source: 'story:' + st.id, si: order.get(st.session) });
for (const p of pool) {
  p.toks = cov.tokenise(p.fa).map(t => ({ t, k: K(t), lem: verbSafe(K(t), cov.lemmas(t, lex)) })).filter(x => /[؀-ۿ]/.test(x.k));
  p.norm = p.toks.map(x => x.k).join(' ');
}

// ---- matching
// words that are dictionary entries in their own right never get split (دوست is not دو + ست)
const dictWords = new Set();
for (const s of deck.sessions) for (const it of s.items) if (it.type === 'vocabulary') for (const alt of String(it.fa).split(/\s*\/\s*/)) for (const w of cov.tokenise(alt)) dictWords.add(K(w));
for (const v of deck.verbs) if (v.pre) for (const w of cov.tokenise(v.pre)) dictWords.add(K(w));

const SAFE = new Set();
for (const a of ['', 'ها', 'های'])
  for (const b of ['', 'م', 'ت', 'ش', 'مون', 'تون', 'شون', 'ام', 'ات', 'اش', 'ی', 'ای'])
    for (const c of ['', 'ه', 'ست', 'و', 'رو', 'م', 'ی', 'یم', 'ید', 'ین', 'ن', 'ند'])
      if (a + b + c) SAFE.add(a + b + c);
for (const c of ['', 'ه', 'ی', 'ن', 'ند', 'م']) { SAFE.add('تر' + c); SAFE.add('ترین' + c); }

// For a joined form, the word is the longest dictionary word it starts with:
// گوشیم is گوشی + م, not گوش + یم
const prefixWords = new Set([...dictWords, 'توی', 'روی']);
function longestDictPrefix(k) {
  let best = '';
  for (let i = k.length; i >= 2; i--) {
    const head = k.slice(0, i);
    if (prefixWords.has(head) && (i === k.length || SAFE.has(k.slice(i)))) { best = head; break; }
  }
  return best;
}
const PURE_NOUN = new Set(['ها', 'های', 'هام', 'هات', 'هاش', 'هامون', 'هاتون', 'هاشون', 'ی', 'م', 'ت', 'ش', 'مون', 'تون', 'شون', 'ام', 'ات', 'اش']);
const HOMOGRAPHS = new Set(['نوش', 'نون', 'صدای', 'مردم', 'باش', 'باشه']);
function tokenMatchesWord(tok, w) {
  if (tok.k === w) return true;
  const raw = cov.normChars(tok.t);
  const zw = raw.split('‌');
  if (zw.length > 1 && K(zw[0]) === w && SAFE.has(K(zw.slice(1).join('')))) return true;
  if (zw.length > 1) {
    // خونه‌ی / مامان‌بزرگش : leading parts joined, then a suffix
    for (let i = 2; i <= zw.length; i++) {
      if (K(zw.slice(0, i).join('')) === w && (i === zw.length || SAFE.has(K(zw.slice(i).join(''))))) return true;
    }
  }
  if (dictWords.has(tok.k) || HOMOGRAPHS.has(tok.k) || !tok.k.startsWith(w) || w.length < 2) return false;
  const suf = tok.k.slice(w.length);
  if (!SAFE.has(suf)) return false;
  const hasVerb = [...tok.lem].some(x => x.startsWith('V:'));
  if (hasVerb && (w.length < 3 || !PURE_NOUN.has(suf))) return false;   // خوابید is "slept"
  const lp = longestDictPrefix(tok.k);
  return !lp || lp === w;
}

const verbsByInf = new Map();
for (const v of lex.verbs) {
  const inf = K(String(v.fa).trim().split(/\s+/).pop());
  if (!verbsByInf.has(inf)) verbsByInf.set(inf, new Set());
  verbsByInf.get(inf).add('V:' + v.id);
}
// A word of a vocab entry: either a plain word or an infinitive (matches any form of any verb on it)
// formal infinitives taught next to their spoken form (خواندن = khāndan / khoondan)
const ALIAS = new Map();
for (const s of deck.sessions) for (const it of s.items) {
  if (it.type !== 'vocabulary' || !/^to /.test(it.en)) continue;
  const P = x => String(x).trim().toLowerCase().replace(/oo/g, 'u');
  const pins = String(it.pin).split(/\s*\/\s*/).map(P);
  for (const v of deck.verbs) if (pins.slice(1).includes(P(v.pin)) && K(v.fa) !== K(it.fa)) ALIAS.set(K(it.fa), v);
}
function wordMatcher(w, isLastVerb, fullFa) {
  if (isLastVerb) {
    const ids = new Set(verbsByInf.get(w) || []);
    const al = ALIAS.get(K(fullFa));
    if (al) { ids.clear(); ids.add('V:' + al.id); for (const v of lex.verbs) if (K(v.fa) === K(fullFa)) ids.add('V:' + v.id); return tok => [...ids].some(id => tok.lem.has(id)) || tok.k === w; }
    // prefer the exact compound verb when the deck has it (درس خوندن -> V:dars-khoondan)
    for (const v of lex.verbs) if (K(v.fa) === K(fullFa)) { ids.clear(); ids.add('V:' + v.id); }
    if (ids.size) return tok => [...ids].some(id => tok.lem.has(id)) || tok.k === w;
  }
  return tok => tokenMatchesWord(tok, w);
}

function matchersFor(fa) {
  const alts = String(fa).replace(/\(.*?\)/g, ' ').split(/\s*\/\s*/).map(a => a.trim()).filter(Boolean);
  const out = [];
  for (const alt of alts) {
    let words = cov.tokenise(alt).map(K).filter(w => /[؀-ۿ]/.test(w));
    if (!words.length) continue;
    // "دست زدن به": drop a trailing preposition after an infinitive
    if (words.length > 1 && /^(به|برای|از|با)$/.test(words[words.length - 1]) && verbsByInf.has(words[words.length - 2])) words = words.slice(0, -1);
    const vi = words.findIndex(w => verbsByInf.has(w) && /ن$/.test(w));
    const seq = words.map((w, i) => wordMatcher(w, i === vi, words.slice(0, i + 1).join(' ')));
    out.push({ words, seq, verbAt: vi });
  }
  return out;
}

function sentenceMatch(p, m) {
  const n = m.seq.length;
  for (let i = 0; i + n <= p.toks.length; i++) {
    let ok = true;
    for (let j = 0; j < n && ok; j++) ok = m.seq[j](p.toks[i + j]);
    if (ok) return p.toks.slice(i, i + n).map(x => x.k).join(' ');
  }
  // compound verbs may have the object marker or a word in between: "دندون‌ها رو مسواک بزن" is fine,
  // but "دست ... زدن" with a gap is allowed only for one intervening token
  if (n === 2 && m.verbAt === 1) {
    for (let i = 0; i + 2 < p.toks.length; i++) {
      if (m.seq[0](p.toks[i]) && m.seq[1](p.toks[i + 2]) && /^(رو|را|هم|نمی|می)$/.test(p.toks[i + 1].k)) return p.toks[i].k + ' ' + p.toks[i + 2].k;
    }
  }
  return null;
}

// ---- selection: up to 4, most varied first
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
}

function pick(cands, itemSi) {
  const chosen = [];
  const forms = new Set(), sources = new Set(), sessions = new Set();
  const left = cands.slice();
  while (chosen.length < 4 && left.length) {
    let best = null, bestScore = -Infinity;
    for (const c of left) {
      let s = 0;
      if (c.p.si <= itemSi) s += 3;
      if (!forms.has(c.form)) s += 2;
      const kind = c.p.source.startsWith('story:st-') ? 'gen' : c.p.source.split(':')[0];
      if (!sources.has(kind)) s += 1;
      if (!sessions.has(c.p.si)) s += 0.5;
      const len = c.p.toks.length;
      if (len >= 3 && len <= 14) s += 1;
      if (len < 3) s -= 1;
      for (const x of chosen) if (jaccard(x.p.toks.map(t => t.k), c.p.toks.map(t => t.k)) > 0.5) s -= 4;
      s -= Math.abs(c.p.si - itemSi) * 0.02;   // tiebreak: closer sessions
      if (s > bestScore) { bestScore = s; best = c; }
    }
    chosen.push(best);
    left.splice(left.indexOf(best), 1);
    forms.add(best.form);
    sources.add(best.p.source.startsWith('story:st-') ? 'gen' : best.p.source.split(':')[0]);
    sessions.add(best.p.si);
  }
  return chosen;
}

const examples = {};
const stats = { 0: 0, 1: 0, '2+': 0 };
const zero = [];
let items = 0;
for (const s of deck.sessions) {
  for (const it of s.items) {
    if (it.type !== 'vocabulary') continue;
    const id = s.id + '|' + it.fa;
    if (examples[id]) continue;
    items++;
    const ms = matchersFor(it.fa);
    const self = K(it.fa);
    const cands = [];
    const seenFa = new Set();
    for (const p of pool) {
      if (p.norm === cov.tokenise(it.fa).map(K).join(' ') || K(p.fa).replace(/[.!?؟،]/g, '').trim() === self) continue;
      if (seenFa.has(p.norm)) continue;
      for (const m of ms) {
        const form = sentenceMatch(p, m);
        if (form) { cands.push({ p, form }); seenFa.add(p.norm); break; }
      }
    }
    const chosen = pick(cands, order.get(s.id));
    examples[id] = chosen.map(c => ({ fa: c.p.fa, pin: c.p.pin, en: c.p.en, source: c.p.source }));
    if (process.argv.includes('--forms')) for (const c of chosen) if (c.form !== cov.tokenise(it.fa).map(K).join(' ')) console.log('FORM', id, '=>', c.form);
    const n = chosen.length;
    if (n === 0) { stats[0]++; zero.push(id); } else if (n === 1) stats[1]++; else stats['2+']++;
  }
}
fs.writeFileSync(path.join(__dirname, 'examples.json'), JSON.stringify(examples, null, 1) + '\n');
console.log(`vocab items: ${items}  0 examples: ${stats[0]}  1: ${stats[1]}  2+: ${stats['2+']}`);
if (process.argv.includes('--zero')) console.log(zero.join('\n'));
