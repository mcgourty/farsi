// lemma.js: Persian tokeniser, normaliser and lemmatiser shared by the
// browser (the reader view) and node (tools/coverage.js, tools/stories-src).
// Pure functions, no DOM and no fs: works as a classic <script> (F.lemma) and
// as a CommonJS module (require('../js/lemma.js')).
//
// Normalises Arabic/Persian letter variants, ZWNJ and diacritics; peels off
// plural / possessive / object / ezāfe / copula suffixes and verb prefixes +
// person endings; checks tokens against a lexicon built from the deck up to a
// cutoff session (every word on the cards, and every conjugated form of each
// verb the deck has introduced, from the deck's own conj()).
//
//   const deck = lemma.deckFromF(F);           // or tools/coverage.js loadDeck()
//   const lex = lemma.buildLexicon(deck, '35');
//   lemma.analyse(text, lex) -> { total, known, coverage, unknown:[{token,count,laterSession}] }
//   lemma.lemmas(token, lex) -> Set of candidate lemma keys (nouns: normalised word, verbs: 'V:<verbId>')
//   lemma.segments(text)     -> [{text, word: bool}] for rendering tappable words
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.F = root.F || {}; root.F.lemma = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
'use strict';

// ---------------------------------------------------------------- normalise
const ZWNJ = '‌';
const DIACRITICS = /[ً-ٰٟـۖ-ۭ]/g; // harakat, superscript alef, tatweel

function normChars(s) {
  return String(s)
    .replace(/ي/g, 'ی').replace(/ى/g, 'ی')   // ي ى -> ی
    .replace(/ك/g, 'ک')                                 // ك -> ک
    .replace(/ة/g, 'ه')                                 // ة -> ه
    .replace(/[أإ]/g, 'ا')                         // أ إ -> ا
    .replace(/ؤ/g, 'و')                                 // ؤ -> و
    .replace(/[ۀهٔ]/g, m => (m === 'ٔ' ? '' : 'ه')) // ۀ -> ه, hamza above dropped
    .replace(DIACRITICS, '')
    .replace(/[‍‏‎﻿]/g, '')
    .replace(/[۰-۹٠-٩]/g, d => String((d.charCodeAt(0) & 0xF)));
}
// Matching key: characters normalised and ZWNJ removed (کتاب‌ها == کتابها).
function key(s) { return normChars(s).replace(/‌/g, '').trim(); }

const PUNCT = /[.,،؛;:!?؟«»"“”'‘’()\[\]{}…\-–—\/\\|*_~<>=+#@^%&]+/g;
const PERSIAN_LETTER = /[ء-يپچژکگیۀ]/;

// Split text into word tokens (original spelling kept, ZWNJ kept).
function tokenise(text) {
  const raw = normChars(text).replace(PUNCT, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    // "می خورم" written with a space: glue the prefix back on
    if ((t === 'می' || t === 'نمی') && raw[i + 1] && PERSIAN_LETTER.test(raw[i + 1])) { t = t + ZWNJ + raw[++i]; }
    // "کتاب ها" written with a space: glue the plural back on
    if (/^(ها|های|هایی|هام|هات|هاش|هامون|هاتون|هاشون)$/.test(t) && out.length) { out[out.length - 1] += ZWNJ + t; continue; }
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- deck
// Normalised deck shape:
// { sessions: [{ id, items: [{ type, fa, pin, en, notes }] }],
//   verbs:    [{ id, fa, pin, en, pre, forms: [fa...], presStems: [...], pastStems: [...] }] }

function verbForms(v, conj) {
  const forms = new Set();
  for (const t of ['present', 'negative', 'past', 'pastneg', 'continuous']) {
    for (let p = 0; p < 6; p++) {
      try { const f = conj(v, t, p); if (f && f.fa) forms.add(f.fa); } catch (e) { /* skip */ }
    }
  }
  if (v.imp) for (const k of ['sgFa', 'plFa', 'negSgFa', 'negPlFa']) if (v.imp[k]) forms.add(v.imp[k]);
  return [...forms];
}

function lastWord(s) { const w = String(s).trim().split(/\s+/); return w[w.length - 1]; }

function verbStems(v) {
  const pres = new Set(), past = new Set();
  const inf = key(lastWord(v.fa));
  if (inf.endsWith('ن')) past.add(inf.slice(0, -1));
  if (v.pastStemFa) past.add(key(v.pastStemFa));
  if (v.negPastFa) past.add(key(lastWord(v.negPastFa)));
  if (v.stemFa) pres.add(key(v.stemFa));
  if (v.id === 'boodan') { pres.add('باش'); }
  else if (/^بر/.test(inf) && v.imp && /^بر/.test(key(lastWord(v.imp.sgFa)))) { pres.add(key(lastWord(v.imp.sgFa))); }
  else if (v.imp && v.imp.sgFa && !v.stemFa) {
    const s = key(lastWord(v.imp.sgFa));
    if (s.startsWith('بی') && s.length > 2) pres.add(s.slice(2));
    if (s.startsWith('ب') && s.length > 1) pres.add(s.slice(1));
    else if (!v.stemFa) pres.add(s);
  }
  if (v.id === 'gozashtan') { pres.add('گذار'); past.add('ذاشت'); }
  return { pres: [...pres].filter(s => s.length >= 1), past: [...past].filter(s => s.length >= 2) };
}

// Deck verbs keep the raw fields stems are derived from, so a dumped deck.json
// picks up stem-rule fixes in this file without re-dumping.
function finishVerbs(rawVerbs, conj) {
  return rawVerbs.map(v => ({
    id: v.id, fa: v.fa, pin: v.pin, en: v.en, pre: v.pre ? v.pre.fa : null,
    stemFa: v.stemFa || null, pastStemFa: v.pastStemFa || null, negPastFa: v.negPastFa || null,
    imp: v.imp ? { sgFa: v.imp.sgFa || null } : null, noMi: !!v.noMi,
    forms: verbForms(v, conj),
  }));
}

// The deck the app has loaded (F.lessons + F.verbs), in the normalised shape.
function deckFromF(F) {
  const sessions = F.lessons
    .filter(l => l.id !== 'alphabet' && (l.items || []).some(it => it.type !== 'letter'))
    .map(l => ({ id: l.id, items: l.items.filter(it => it.type !== 'letter').map(it => ({ type: it.type, fa: it.fa, pin: it.pin, en: it.en, notes: it.notes || '' })) }));
  return { sessions, verbs: finishVerbs(F.verbs.VERBS, F.verbs.conj) };
}

// Split a line into word and non-word runs, keeping every character, so a
// renderer can wrap the words in tappable spans.
const WORD_RUN = /[\u0621-\u063A\u0640-\u065F\u0670-\u06D3\u06F0-\u06F9\u0660-\u0669\u200C\u200DA-Za-z0-9]+/g;
function segments(text) {
  const s = String(text), out = [];
  let last = 0;
  for (const m of s.matchAll(WORD_RUN)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), word: false });
    out.push({ text: m[0], word: PERSIAN_LETTER.test(normChars(m[0])) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), word: false });
  return out;
}

// ---------------------------------------------------------------- lexicon
// Proper names a learner reads without being taught them.
const NAMES = `علی سارا مریم رضا حسن حسین زهرا فاطمه محمد احمد مینا نازنین نیما امیر بهرام لیلا پریسا سعید میترا سیاوش سام
  کاوه بابک داریوش کوروش آرش سینا مهسا نگار الکس الکساندر تام آنا لندن پاریس منچستر آلمان امریکا آمریکا انگلیس
  تهران شیراز اصفهان مشهد تبریز یزد کرمان رشت کیش قشم ایران فارس خزر البرز دماوند تجریش ونک`.split(/\s+/).filter(Boolean);

// Everyday function words. They count as known only when they occur somewhere
// in the sessions up to the cutoff (cards, notes or breakdowns).
const FUNCTION_WORDS = `و که به از در با را رو یه یک این اون آن هم هر چه چی چرا کجا کی چند چطور
  ولی اما یا تا برای بعد قبل اگه اگر نه آره بله خیلی هم همه دیگه هنوز فقط بیشتر کمی یکم الان حالا
  من تو او اون ما شما اونا آنها ایشون خودم خودت خودش`.split(/\s+/).filter(Boolean);

const NOUN_SUFFIXES = [
  'هایی', 'هامون', 'هاتون', 'هاشون', 'های', 'هام', 'هات', 'هاش', 'ها',
  'ترین', 'تر', 'مون', 'تون', 'شون', 'مان', 'تان', 'شان',
  'هست', 'ست', 'است', 'اید', 'ایم', 'اند', 'ام', 'ات', 'اش', 'ای', 'یی',
  'یم', 'ید', 'ین', 'ند', 'رو', 'ی', 'ه', 'م', 'ت', 'ش', 'و', 'ن', 'ان', 'یان', 'گان',
];
// Suffixes safe to strip from a taught word to recover its base (see buildLexicon).
const DERIVE_SUFFIXES = ['هامون', 'هاتون', 'هاشون', 'هایی', 'های', 'هام', 'هات', 'هاش', 'ها',
  'مون', 'تون', 'شون', 'ترین', 'تر', 'ام', 'ات', 'اش', 'م', 'ت', 'ش'];
// Pronoun suffixes are the only ones a function word takes: بهش، باهات، روش
// (plus the copula: کجاست، منه، چیه)
const PRONOUN_SUFFIXES = new Set(['م', 'ت', 'ش', 'مون', 'تون', 'شون', 'ام', 'ات', 'اش', 'ست', 'ه', 'هست']);
// Copula endings, allowed on function words of 3+ letters: چطورن، کجایی، چطورید
const COPULA_SUFFIXES = new Set(['م', 'ی', 'ه', 'یم', 'ید', 'ین', 'ن', 'ند', 'ست', 'هست']);
// (بر- verbs such as برداشتن keep بر in their stem; their می/ن forms come from conj())
const VERB_PREFIXES = ['نمی', 'می', 'ب', 'ن', ''];
const PRES_ENDINGS = ['یم', 'ید', 'ین', 'ند', 'م', 'ی', 'ه', 'د', 'ن', ''];
const PAST_ENDINGS = ['هایم', 'هاید', 'هاند', 'هام', 'های', 'ه', 'یم', 'ید', 'ین', 'ند', 'م', 'ی', 'ن', ''];

function sessionIndex(deck, id) {
  const i = deck.sessions.findIndex(s => s.id === String(id));
  if (i >= 0) return i;
  // numeric cutoff: the last session whose leading number is <= it ('24-25' counts as 25)
  const n = parseFloat(id);
  let best = -1;
  deck.sessions.forEach((s, j) => { const m = String(s.id).match(/\d+/g); if (m && parseInt(m[m.length - 1], 10) <= n) best = j; });
  if (best < 0) throw new Error('Unknown session ' + id);
  return best;
}

function cardTexts(item) {
  // vocab like "او / اون" or "کلید / کلیدم": every alternative is taught
  return String(item.fa).split(/\s*[\/=]\s*/);
}

function wordsOf(s) { return tokenise(String(s).replace(/\(.*?\)/g, ' ')).map(key).filter(w => PERSIAN_LETTER.test(w)); }

// Use the pinglish to undo written ezāfe / copula: "غذای" (ghazā-ye) also teaches
// "غذا", "یخچاله" (yakhchāl-eh) also teaches "یخچال". Only when the word counts line up.
function pinLemmas(fa, pin) {
  const fw = wordsOf(fa);
  const pw = String(pin || '').split(/\s*[\/=]\s*/)[0].replace(/[.,!?؟…«»"()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const out = [];
  if (fw.length !== pw.length) return out;
  fw.forEach((w, i) => {
    const p = pw[i].toLowerCase();
    if (/-ye$/.test(p) && w.endsWith('ی') && w.length > 2) out.push(w.slice(0, -1));
    if (/-(e|eh)$/.test(p) && w.endsWith('ه') && w.length > 2 && !/[ae]h?-(e|eh)$/.test(p)) out.push(w.slice(0, -1));
  });
  return out;
}

// Build the known-word lexicon for a cutoff (session id, e.g. '35', '24-25').
// Words taught after the cutoff are remembered too, so reports can say "taught in 36".
function buildLexicon(deck, cutoff, extra = {}) {
  const cut = cutoff == null ? deck.sessions.length - 1 : sessionIndex(deck, cutoff);
  const firstSeen = new Map();           // word key -> session index
  const noteWords = new Map();           // words seen only in notes/breakdowns
  const see = (map, w, si) => { if (!map.has(w) || map.get(w) > si) map.set(w, si); };
  const corpus = [];                     // normalised card texts with session index (for verb detection)
  deck.sessions.forEach((s, si) => {
    for (const it of s.items) {
      for (const alt of cardTexts(it)) {
        for (const w of wordsOf(alt)) see(firstSeen, w, si);
        for (const w of pinLemmas(alt, it.pin)) see(firstSeen, w, si);
        corpus.push({ si, text: ' ' + wordsOf(alt).join(' ') + ' ' });
      }
      for (const w of wordsOf(it.notes || '')) see(noteWords, w, si);
    }
  });
  // Verbs: a verb is introduced in the first session whose cards contain its
  // infinitive or any of its forms. From then on every form counts.
  const deckVerbs = deck.verbs.map(v => {
    if (v.presStems && v.pastStems) return v;
    const st = verbStems(v);
    return Object.assign({}, v, { presStems: st.pres, pastStems: st.past });
  });
  const verbs = deckVerbs.map(v => {
    const probes = [v.fa, ...v.forms].map(f => ' ' + wordsOf(f).join(' ') + ' ');
    let si = Infinity;
    for (const c of corpus) if (c.si < si && probes.some(p => p.trim() && c.text.includes(p))) si = c.si;
    return Object.assign({}, v, { si });
  });
  // Infinitives taught as vocab but missing from VERBS (e.g. جوشیدن): regular -idan verbs.
  const verbFas = new Set(deck.verbs.map(v => key(v.fa)));
  deck.sessions.forEach((s, si) => {
    for (const it of s.items) {
      const fa = key(it.fa);
      if (it.type !== 'vocabulary' || verbFas.has(fa) || !/^(to |)/.test(it.en) || !/^to /.test(it.en)) continue;
      const inf = lastWord(fa);
      if (!/ن$/.test(inf)) continue;
      const past = inf.slice(0, -1);
      const pres = /یدن$/.test(inf) ? [inf.slice(0, -3)] : [];
      const pre = fa.split(/\s+/).length > 1 ? fa.split(/\s+/).slice(0, -1).join(' ') : null;
      // if the base verb exists in VERBS reuse its stems (e.g. "توصیف کردن")
      const base = deckVerbs.find(v => !v.pre && key(v.fa) === inf);
      verbs.push({ id: 'vocab:' + fa, fa: it.fa, pre, si, forms: base ? base.forms : [], noMi: base ? base.noMi : false,
        presStems: base ? base.presStems : pres, pastStems: base ? base.pastStems : [past] });
      verbFas.add(fa);
    }
  });
  // Lesson-notes files (ALEX-SESSION-NN_formatted.md / .txt): their words only
  // ever unlock FUNCTION_WORDS, never content words.
  for (const nf of extra.notesFiles || []) {
    let si;
    try { si = sessionIndex(deck, nf.session); } catch (e) { continue; }
    if (String(deck.sessions[si].id).split('-').pop() !== String(nf.session).split('-').pop() &&
        !String(deck.sessions[si].id).split('-').includes(String(nf.session))) continue;
    for (const w of wordsOf(nf.text || '')) see(noteWords, w, si);
  }
  const names = new Set([...NAMES, ...(extra.names || [])].map(key));
  const known = new Set(), later = new Map();
  for (const [w, si] of firstSeen) { if (si <= cut) known.add(w); else later.set(w, si); }
  for (const w of FUNCTION_WORDS) {
    const k = key(w);
    const si = Math.min(firstSeen.has(k) ? firstSeen.get(k) : Infinity, noteWords.has(k) ? noteWords.get(k) : Infinity);
    if (si <= cut) known.add(k);
  }
  for (const w of extra.known || []) known.add(key(w));
  // A taught inflected form also teaches its base: خسته‌ام -> خسته, کیفش -> کیف.
  // One suffix level, base of 3+ letters, so short words don't spawn junk lemmas.
  for (const w of [...known]) {
    for (const suf of DERIVE_SUFFIXES) {
      if (w.endsWith(suf) && w.length - suf.length >= 3) known.add(w.slice(0, -suf.length));
    }
  }
  // verb tables
  const verbAt = verbs.map(v => Object.assign(v, { known: v.si <= cut }));
  const formMap = new Map();  // word key -> [verb]
  const presStem = new Map(), pastStem = new Map();
  const push = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const v of verbAt) {
    // index only the main verb word of each form: the auxiliary دارم in "دارم می‌رم"
    // and the پیش‌فعل in "درس می‌خونم" are not forms of the verb on their own
    for (const f of v.forms) { const ws = wordsOf(f); if (ws.length === 1 || (ws.length > 1 && v.pre)) push(formMap, ws[ws.length - 1], v); }
    { const ws = wordsOf(v.fa); if (ws.length) push(formMap, ws[ws.length - 1], v); }
    for (const s of v.presStems) push(presStem, key(s), v);
    for (const s of v.pastStems) push(pastStem, key(s), v);
    if (v.known && v.pre) for (const w of wordsOf(v.pre)) known.add(w);
  }
  return { deck, cut, cutoffId: deck.sessions[cut].id, known, later, firstSeen, names, verbs: verbAt, formMap, presStem, pastStem };
}

// ---------------------------------------------------------------- lemmatise
// Candidate lemma keys for one token: the word itself, the word with up to
// three suffixes peeled off, and 'V:<id>' for every verb whose form it could be.
const FUNCTION_KEYS = new Set(FUNCTION_WORDS.map(key));
function nounCandidates(w) {
  const out = new Set([w]);
  let frontier = [w];
  for (let depth = 0; depth < 3; depth++) {
    const next = [];
    for (const f of frontier) {
      for (const suf of NOUN_SUFFIXES) {
        if (f.length - suf.length >= 2 && f.endsWith(suf)) {
          const b = f.slice(0, -suf.length);
          // a function word only takes pronoun suffixes, and only directly (بهش, not بهتر -> به)
          if (FUNCTION_KEYS.has(b) && !(depth === 0 && (PRONOUN_SUFFIXES.has(suf) || (b.length >= 3 && COPULA_SUFFIXES.has(suf))))) continue;
          if (!out.has(b)) { out.add(b); next.push(b); }
        }
      }
    }
    frontier = next;
  }
  return out;
}

function verbCandidates(w, lex) {
  const hits = [];
  // a word that is literally one of the deck's verb forms is that verb (بشین is نشستن, not شدن)
  if (lex.formMap.has(w)) return lex.formMap.get(w).slice();
  for (const pre of VERB_PREFIXES) {
    if (!w.startsWith(pre)) continue;
    // نمیرم is نمی + ر + م (رفتن), not ن + میر + م (مردن): don't split a می/نمی prefix
    if ((pre === '' || pre === 'ن') && /^(ن?می)/.test(w) && hits.length) continue;
    const rest = w.slice(pre.length);
    for (const end of PRES_ENDINGS) {
      if (!rest.endsWith(end)) continue;
      let stem = rest.slice(0, rest.length - end.length);
      if (!stem) continue;
      if ((pre === 'ب' || pre === 'ن') && stem.startsWith('ا')) continue;       // vowel stems take بی/نی: بیا، نیا
      const cands = [stem];
      if (pre === 'ب' && stem.startsWith('ی')) cands.push(stem.slice(1));        // بیارم -> یار? / بیا
      if (/^(نمی|می)$/.test(pre) && stem.startsWith('ا')) cands.push(stem);      // میام
      // no prefix at all is only a present form for می-less verbs (دارم) and باش-
      for (const s of cands) for (const v of lex.presStem.get(s) || []) if (pre || v.noMi || s === 'باش') hits.push(v);
    }
    if (pre === 'ب') continue;                                                   // no بـ on past stems
    for (const end of PAST_ENDINGS) {
      if (!rest.endsWith(end)) continue;
      const stem = rest.slice(0, rest.length - end.length);
      for (const v of lex.pastStem.get(stem) || []) hits.push(v);
    }
  }
  return hits;
}

function lemmas(token, lex) {
  const w = key(token);
  const out = new Set();
  for (const c of nounCandidates(w)) out.add(c);
  for (const v of verbCandidates(w, lex)) out.add('V:' + v.id);
  return out;
}

// Is this token known at the lexicon's cutoff? Returns { known, why, laterSession }
function classify(token, lex) {
  const w = key(token);
  if (!PERSIAN_LETTER.test(w)) return { known: true, why: 'non-Persian' };
  if (lex.names.has(w)) return { known: true, why: 'name' };
  let later = Infinity;
  for (const c of nounCandidates(w)) {
    if (lex.known.has(c)) return { known: true, why: c === w ? 'word' : 'lemma ' + c };
    if (lex.names.has(c)) return { known: true, why: 'name' };
    if (lex.later.has(c)) later = Math.min(later, lex.later.get(c));
  }
  for (const v of verbCandidates(w, lex)) {
    if (v.known) return { known: true, why: 'verb ' + v.id };
    later = Math.min(later, v.si);
  }
  return { known: false, laterSession: Number.isFinite(later) ? lex.deck.sessions[later].id : null };
}

function analyse(text, lex) {
  const toks = tokenise(text).filter(t => PERSIAN_LETTER.test(t) || /\d/.test(t));
  const unknown = new Map();
  let known = 0;
  for (const t of toks) {
    const r = classify(t, lex);
    if (r.known) known++;
    else {
      const k = key(t);
      if (!unknown.has(k)) unknown.set(k, { token: t, count: 0, laterSession: r.laterSession });
      unknown.get(k).count++;
    }
  }
  return { total: toks.length, known, coverage: toks.length ? known / toks.length : 1, unknown: [...unknown.values()] };
}

// A taught inflected form also teaches its base (خسته‌ام -> خسته), as in buildLexicon.
function deriveBases(w) {
  const out = [];
  for (const suf of DERIVE_SUFFIXES) if (w.endsWith(suf) && w.length - suf.length >= 3) out.push(w.slice(0, -suf.length));
  return out;
}

return {
  ZWNJ, NAMES, FUNCTION_WORDS, DERIVE_SUFFIXES, normChars, key, tokenise, segments, wordsOf, cardTexts, pinLemmas,
  verbForms, verbStems, finishVerbs, deckFromF, sessionIndex, deriveBases,
  buildLexicon, nounCandidates, verbCandidates, lemmas, classify, analyse,
};
});
