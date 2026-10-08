// ui/cloze.js: fill-in-the-blank cards cut from phrase and story lines.
//
// Each phrase/story item of 3+ words yields at most two cloze items:
//   id      cloze.<phraseItemId>.<k>   k = index of the blanked word (0-based,
//           words split on spaces). Deterministic: the same text always gives
//           the same ids, so progress sticks. Editing a sentence so a
//           different word is chosen gives a new card (the old one is orphaned
//           like any deleted item).
//   session the phrase's session; card type 'cloze', direction 'cloze'.
// Which word is blanked, in order of preference:
//   1. a place preposition (توی، روی، زیرِ، کنارِ، جلوی، پشتِ…), shown with its ezāfe
//   2. the object marker را / رو
//   3. the verb ending, when the sentence starts with its subject pronoun
//   4. a plain preposition (با، به، از، برای، در، تا)
//   5. a vocabulary word from this or an earlier lesson
// The four options are the answer plus three from the same group, picked and
// ordered by a hash of the card id (no randomness). Options are shown without
// harakat (story lines are vowelled, distractors are not), except the ezāfe
// kasra of place prepositions, which every place option carries.
//
// The generator part is DOM-free so tools/test.js can load it in node.
(function (root) {
  'use strict';
  const F = root.F;
  const canon = s => (F.typed ? F.typed.canonFa(s) : String(s || '').trim());

  // [canonical match, shown form]
  const PLACE = [
    ['توی', 'توی'], ['روی', 'روی'], ['زیر', 'زیرِ'], ['کنار', 'کنارِ'], ['جلوی', 'جلوی'],
    ['پشت', 'پشتِ'], ['بین', 'بینِ'], ['بالای', 'بالای'], ['پایینِ', 'پایینِ'], ['وسط', 'وسطِ'],
    ['داخل', 'داخلِ'], ['نزدیک', 'نزدیکِ'], ['میان', 'میانِ'],
  ];
  // Distractors come from the everyday core so options are always familiar.
  const PLACE_CORE = ['توی', 'روی', 'زیرِ', 'کنارِ', 'جلوی', 'پشتِ'];
  const OBJECT = ['را', 'رو'];
  const OBJECT_DISTRACT = ['به', 'از', 'با', 'تا'];
  const PREP = ['با', 'به', 'از', 'برای', 'در', 'تا'];
  // Subject pronoun -> person index (0 1sg, 1 2sg, 3 1pl, 4 2pl). 3rd persons are
  // skipped: their endings vary (ـه / ـد / none, ـن / ـند).
  const PRONOUN = { 'من': 0, 'تو': 1, 'ما': 3, 'شما': 4 };
  // Never blanked as vocabulary: pronouns and question words carry no lesson content.
  const NOT_VOCAB = new Set(['من', 'تو', 'او', 'اون', 'ما', 'شما', 'اونها', 'آنها', 'این', 'آن', 'اینجا', 'آنجا', 'کجا', 'کجاست', 'چی', 'چه']);
  const ENDING = { 0: 'م', 1: 'ی', 3: 'یم', 4: 'ید', 5: 'ند' };

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  // Deterministic pick of n items from list (seeded by key).
  function pick(list, n, key) {
    const scored = list.map((x, i) => ({ x, h: hash(key + '|' + i + '|' + x) }));
    scored.sort((a, b) => a.h - b.h);
    return scored.slice(0, n).map(o => o.x);
  }
  function arrange(answer, distractors, key) {
    const all = [answer].concat(distractors);
    const order = all.map((x, i) => ({ x, h: hash(key + '#' + x) })).sort((a, b) => a.h - b.h).map(o => o.x);
    return { options: order, answerIndex: order.indexOf(answer) };
  }

  // Splits a sentence into words, keeping leading/trailing punctuation apart.
  function tokenize(fa) {
    return String(fa).trim().split(/\s+/).map(raw => {
      const m = raw.match(/^([«"(]*)(.*?)([.!?؟،,»")…:;!]*)$/);
      return { raw, lead: m[1], word: m[2], trail: m[3], key: canon(m[2]) };
    });
  }

  function placeEntry(key) { return PLACE.find(p => p[0] === key) || null; }

  // Vocabulary words (one word, no slash) by lesson position, for group 5.
  let vocabCache = null;
  function vocabIndex() {
    if (vocabCache) return vocabCache;
    const byKey = new Map();
    const bySession = new Map();
    F.lessons.forEach((l, li) => {
      if (l.kind !== 'lesson') return;
      for (const it of l.items) {
        if (it.type !== 'vocabulary' || /[\s\/=…ـ()]/.test(it.fa)) continue;
        const k = canon(it.fa);
        if (k.length < 3 || NOT_VOCAB.has(k)) continue;
        if (!byKey.has(k)) byKey.set(k, { li, fa: it.fa, session: l.id });
        if (!bySession.has(l.id)) bySession.set(l.id, []);
        if (!bySession.get(l.id).includes(k)) bySession.get(l.id).push(k);
      }
    });
    vocabCache = { byKey, bySession };
    return vocabCache;
  }

  // Candidate blanks for one sentence, best first: [{k, group, answer, distract}]
  function candidates(item, lessonIndex) {
    const toks = tokenize(item.fa);
    const out = [];
    toks.forEach((t, k) => {
      if (!t.key) return;
      const last = k === toks.length - 1;
      const place = placeEntry(t.key);
      // ("bālā-o pāyin" = ups and downs: a word after و is not a preposition.)
      if (place && !last && !(k > 0 && toks[k - 1].key === 'و')) {
        out.push({ k, group: 1, kind: 'place', answer: place[1], distract: PLACE_CORE.filter(x => x !== place[1]) });
        return;
      }
      if (OBJECT.includes(t.key) && k > 0) {
        out.push({ k, group: 2, kind: 'object', answer: t.key, distract: OBJECT_DISTRACT });
        return;
      }
      if (last && k >= 2 && Object.prototype.hasOwnProperty.call(PRONOUN, toks[0].key)) {
        const person = PRONOUN[toks[0].key];
        const end = ENDING[person];
        const w = t.key;
        // 1sg 'م' must not be the tail of 1pl 'یم'; 2sg 'ی' must not be 'ی' of a stem only.
        const okEnd = w.endsWith(end) && !(person === 0 && w.endsWith('یم'));
        const stem = okEnd ? w.slice(0, w.length - end.length) : '';
        if (okEnd && stem.length >= 2 && /^(ن?می|ن?ب|دار|هست|نیست|بود|نبود)/.test(stem)) {
          const forms = [0, 1, 3, 4, 5].filter(p => p !== person).map(p => stem + ENDING[p]);
          out.push({ k, group: 3, kind: 'verb', answer: t.key, distract: forms });
          return;
        }
      }
      if (PREP.includes(t.key) && !last && k > 0) {
        out.push({ k, group: 4, kind: 'prep', answer: t.key, distract: PREP.filter(x => x !== t.key) });
        return;
      }
      const v = vocabIndex().byKey.get(t.key);
      if (v && v.li <= lessonIndex && t.key.length >= 3 && !NOT_VOCAB.has(t.key)) {
        const pool = (vocabIndex().bySession.get(v.session) || []).filter(x => canon(x) !== t.key);
        if (pool.length >= 3) out.push({ k, group: 5, kind: 'vocab', answer: t.key, distract: pool });
      }
    });
    out.sort((a, b) => a.group - b.group || a.k - b.k);
    return { toks, cands: out };
  }

  // All cloze items for the lessons, in lesson order.
  function items() {
    const res = [];
    F.lessons.forEach((l, li) => {
      if (l.kind !== 'lesson') return;
      for (const it of l.items) {
        if (it.type !== 'phrases' && it.type !== 'story') continue;
        if (/[=\/…]/.test(it.fa)) continue;
        const { toks, cands } = candidates(it, li);
        if (toks.filter(t => t.key).length < 3 || !cands.length) continue;
        const chosen = [cands[0]];
        // A second blank only in longer sentences, from another group, and
        // only a grammar word (preposition, را, verb ending), never vocabulary.
        if (toks.length >= 5) {
          const second = cands.find(c => c.group !== cands[0].group && c.group < 5 && c.k !== cands[0].k);
          if (second) chosen.push(second);
        }
        for (const c of chosen) {
          const id = `cloze.${it.id}.${c.k}`;
          const { options, answerIndex } = arrange(c.answer, pick(c.distract, 3, id), id);
          res.push({
            id, session: l.id, clozeOf: it.id,
            fa: it.fa, pin: it.pin, en: it.en, notes: it.notes || '',
            cloze: {
              k: c.k, kind: c.kind, answer: c.answer, options, answerIndex,
              before: toks.slice(0, c.k).map(t => t.raw).join(' '),
              lead: toks[c.k].lead, trail: toks[c.k].trail,
              after: toks.slice(c.k + 1).map(t => t.raw).join(' '),
            },
          });
        }
      }
    });
    return res;
  }

  F.cards.registerGenerator({
    type: 'cloze',
    dirs: ['cloze'],
    items,
    extra: it => ({ clozeOf: it.clozeOf, cloze: it.cloze }),
  });

  // ---------- Card UI ----------
  const cloze = F.cloze = { items, tokenize, candidates, hash, picked: null };

  function sentenceHTML(z, fill, cls) {
    const gap = fill == null ? '<span class="cloze-gap" aria-label="blank"></span>'
      : `<span class="cloze-fill ${cls || ''}">${fill}</span>`;
    return `<div class="cloze-sentence" lang="fa" dir="rtl">${z.before ? z.before + ' ' : ''}${z.lead}${gap}${z.trail}${z.after ? ' ' + z.after : ''}</div>`;
  }

  if (F.study && F.study.registerRenderer) {
    F.study.registerRenderer({
      name: 'cloze',
      match: c => c.type === 'cloze',
      render(c) {
        const z = c.cloze;
        const p = cloze.picked && cloze.picked.cardId === c.id ? cloze.picked.i : null;
        const tag = F.study.tagHTML(c);
        const opts = z.options.map((o, i) => {
          let cls = '';
          if (p !== null) cls = i === z.answerIndex ? ' right' : i === p ? ' wrong' : '';
          return `<button type="button" class="cloze-opt${cls}" lang="fa" dir="rtl" data-action="cloze-pick" data-arg="${i}">${o}</button>`;
        }).join('');
        const front = `${tag}<div class="front-content">${sentenceHTML(z)}<div class="cloze-hint">${c.english}</div>`
          + `<div class="cloze-opts">${opts}</div></div>`;
        let verdict = '';
        if (p !== null) {
          verdict = p === z.answerIndex
            ? '<div class="cloze-verdict right">Right</div>'
            : `<div class="cloze-verdict wrong">You picked <span lang="fa" dir="rtl">${z.options[p]}</span></div>`;
        }
        const back = `${tag}<div class="back-content">${verdict}${sentenceHTML(z, z.options[z.answerIndex], 'answer')}`
          + `<div class="pinglish">${c.pinglish}</div><div class="meaning">${c.english}</div>`
          + (c.breakdown ? `<div class="breakdown">${c.breakdown}</div>` : '') + '</div>';
        return { front, back };
      },
    });
  }

  F.actions.register('cloze-pick', el => {
    const c = F.study && F.study.current();
    if (!c || c.type !== 'cloze' || F.state.flipped) return;
    const i = Number(el.dataset.arg);
    cloze.picked = { cardId: c.id, i };
    F.state.suggestGrade = i === c.cloze.answerIndex ? 3 : 1;
    F.state.flipped = true;
    F.app.render();
  });
  if (F.hooks) {
    // Forget the pick once the card is graded or left.
    F.hooks.on('card:graded', () => { cloze.picked = null; });
  }
})(typeof window !== 'undefined' ? window : globalThis);
