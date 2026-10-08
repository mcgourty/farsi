// ui/study.js: the flashcard study view ("cards"). Builds the queue from the
// filters, renders the current card, grades it with FSRS, buries/unburies,
// and draws the stats line, scope bar and grading row.
//
// Extension points:
//   F.study.registerRenderer({name, match(card, ctx), render(card, ctx) -> {front, back}})
//     The most recently registered matching renderer draws a card's faces.
//   F.hooks 'card:rendered'  {card, front, back, flipped}  after a card is drawn
//   F.hooks 'card:graded'    {card, rating, before, after, review}
//   F.hooks 'card:buried' / 'card:unburied'  {card}
//   F.study.tagHTML(card)  the sentence-case tag chip, for custom renderers
//
// Queue rules (see F.cards.buildQueue): new cards come newest lesson first; in
// 'due' mode at most one card per item per day (the other direction, or a
// cloze of the same phrase, waits until tomorrow unless the user chooses
// "Study them anyway"); a new lesson item is presented (js/ui/learn.js)
// before its first test. Grades and buries can be undone from a toast.
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const U = F.util;
  const $ = id => document.getElementById(id);

  const STUDY_MODES = [
    { id: 'due', label: 'Due & new' },
    { id: 'weak', label: 'Weak spots' },
    { id: 'all', label: 'All cards' },
    { id: 'buried', label: 'Buried' },
  ];
  const FRONT_MODES = [{ id: 'farsi', label: 'Farsi script' }, { id: 'pinglish', label: 'Pinglish' }];
  const DIRECTIONS = [
    { id: 'farsi-to-english', label: 'Farsi → English' },
    { id: 'english-to-farsi', label: 'English → Farsi' },
    { id: 'both', label: 'Both, mixed' },
  ];
  const NEW_LIMITS = [5, 10, 20, 40, 80];
  const GRADES = [
    { g: 1, label: 'Again', cls: 'again' },
    { g: 2, label: 'Hard', cls: 'hard' },
    { g: 3, label: 'Good', cls: 'know' },
    { g: 4, label: 'Easy', cls: 'easy' },
  ];
  // The four states every SRS reports on, most learned first.
  const STATES = [
    { id: 'mature', label: 'Mature', hint: 'stable for 21+ days' },
    { id: 'young', label: 'Young', hint: 'in review, still consolidating' },
    { id: 'learning', label: 'Learning', hint: 'in a learning or relearning step' },
    { id: 'new', label: 'New', hint: 'not seen yet' },
  ];
  // Anki flags a card at 8 lapses; 6 catches them a little earlier, which is
  // what you want when the fix is to re-encode rather than to keep drilling.
  const LEECH_LAPSES = 6;
  const HARD_DIFFICULTY = 7;   // FSRS difficulty runs 1-10

  const st = {
    sessions: new Set(),     // filled at boot from the registry
    types: new Set(F.cards.TYPES.map(t => t.id)),
    direction: 'farsi-to-english',
    frontMode: 'farsi',
    mode: 'due',
    hideMastered: false,
    newPerDay: 20,
    queue: [],
    idx: 0,
    reviewedCount: 0,
    shownId: null,           // card on screen, for review durations
    shownAt: 0,
    deferred: 0,             // cards held back by the sibling rule today
    allowSiblings: false,    // "Study them anyway" for this sitting
    learn: null,             // {cardId, phase: 'present'|'check'} while a new item is presented
  };

  const srsOf = c => F.store.srs(c.id);
  const isBuried = c => F.store.isBuried(c.id);
  function isMastered(c) {
    const s = srsOf(c);
    return !!s && s.state === 'review' && s.s >= F.fsrs.MATURE_DAYS;
  }
  function isLeech(c) {
    const s = srsOf(c);
    return !!s && s.lapses >= LEECH_LAPSES;
  }
  function isWeak(c) {
    const s = srsOf(c);
    return !!s && (s.lapses > 0 || s.d >= HARD_DIFFICULTY);
  }
  function cardState(c) {
    const s = srsOf(c);
    if (!s) return 'new';
    if (s.state === 'learning' || s.state === 'relearning') return 'learning';
    return s.s >= F.fsrs.MATURE_DAYS ? 'mature' : 'young';
  }

  const filters = () => ({ sessions: st.sessions, types: st.types, direction: st.direction });
  const matchesFilters = c => F.cards.matchesFilters(c, filters());
  // Everything the filters allow, ignoring hide-mastered, so the state
  // breakdown stays honest about cards already banked.
  function inScopeBase(c) {
    if (!matchesFilters(c)) return false;
    const buried = isBuried(c);
    return st.mode === 'buried' ? buried : !buried;
  }
  function inScope(c) {
    if (!inScopeBase(c)) return false;
    if (st.hideMastered && isMastered(c)) return false;
    return true;
  }

  function scopeStats() {
    const now = Date.now();
    let due = 0, fresh = 0, later = 0;
    for (const c of F.cards.all) {
      if (!inScope(c)) continue;
      const s = srsOf(c);
      if (!s) fresh++;
      else if (s.due <= now) due++;
      else later++;
    }
    return { due, fresh, later };
  }

  function nextDueLabel() {
    const now = Date.now();
    let min = Infinity;
    for (const c of F.cards.all) {
      if (!inScope(c)) continue;
      const s = srsOf(c);
      if (s && s.due > now && s.due < min) min = s.due;
    }
    return min === Infinity ? null : F.fsrs.fmtIvl(min - now);
  }

  function emptyCounts() { return { new: 0, learning: 0, young: 0, mature: 0, total: 0 }; }

  // Per session, honouring the type and direction filters but not the session
  // filter itself; otherwise every pill you switch off would read as empty.
  function sessionStateCounts() {
    const m = new Map();
    for (const c of F.cards.all) {
      if (!st.types.has(c.type)) continue;
      if (F.cards.directionExcluded(c, st.direction)) continue;
      if (isBuried(c)) continue;
      let e = m.get(c.session);
      if (!e) m.set(c.session, e = emptyCounts());
      e[cardState(c)]++;
      e.total++;
    }
    return m;
  }
  function scopeStateCounts() {
    const e = emptyCounts();
    for (const c of F.cards.all) {
      if (!inScopeBase(c)) continue;
      e[cardState(c)]++;
      e.total++;
    }
    return e;
  }
  function meterHTML(counts) {
    if (!counts.total) return '<span class="meter"></span>';
    const segs = STATES.filter(s => s.id !== 'new' && counts[s.id])
      .map(s => `<i class="seg seg-${s.id}" style="width:${(counts[s.id] / counts.total) * 100}%"></i>`)
      .join('');
    return `<span class="meter">${segs}</span>`;
  }
  function meterTitle(label, counts) {
    if (!counts.total) return `${label} — no cards under the current filters`;
    const parts = STATES.map(s => `${counts[s.id]} ${s.label.toLowerCase()}`);
    return `${label} — ${counts.total} cards: ${parts.join(', ')}`;
  }
  function countLeeches() {
    let n = 0;
    for (const c of F.cards.all) if (inScopeBase(c) && isLeech(c)) n++;
    return n;
  }
  function countBuried() {
    let n = 0;
    for (const c of F.cards.all) if (matchesFilters(c) && isBuried(c)) n++;
    return n;
  }

  // ---------- Siblings ----------
  // Cards that share a sibling key (both directions of an item, and the
  // cloze cards cut from a phrase). Built lazily from the deck.
  let sibMap = null, sibFor = null;
  function siblingsOf(c) {
    if (sibFor !== F.cards.all) {
      sibMap = new Map();
      for (const x of F.cards.all) {
        const k = F.cards.siblingKey(x);
        if (!sibMap.has(k)) sibMap.set(k, []);
        sibMap.get(k).push(x);
      }
      sibFor = F.cards.all;
    }
    return sibMap.get(F.cards.siblingKey(c)) || [];
  }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  // True when another card of c's item was reviewed today, or the item was
  // presented in learn mode today.
  function siblingSeenToday(c, since) {
    since = since || startOfToday();
    const key = F.cards.siblingKey(c);
    if (F.learn && F.learn.introducedToday(key)) return true;
    return siblingsOf(c).some(x => x !== c && (srsOf(x) || {}).last >= since);
  }
  const needsIntro = c => !!F.learn && F.learn.needsIntro(c);

  // Rebuilds the queue from the filters without drawing anything.
  function rebuildQueue() {
    const deferred = [];
    const today = startOfToday();
    const learnLeft = F.learn ? F.learn.budget().left : Infinity;
    st.queue = F.cards.buildQueue({
      base: F.cards.all.filter(inScope),
      mode: st.mode,
      shuffled: S.shuffled,
      direction: st.direction,
      now: Date.now(),
      srsOf, isWeak,
      allowance: {
        fa: st.newPerDay - F.store.newToday('fa'),
        en: st.newPerDay - F.store.newToday('en'),
        cloze: st.newPerDay - F.store.newToday('cloze'),
        learn: learnLeft,
      },
      newOrder: 'newest',
      siblingRule: !st.allowSiblings,
      siblingSeenToday: c => siblingSeenToday(c, today),
      needsIntro,
      // A cloze waits until its phrase was learnt on an earlier day.
      eligibleNew: c => c.type !== 'cloze' || !F.learn || F.learn.introducedBefore(c.clozeOf, today),
      deferred,
    });
    st.deferred = deferred.length;
    st.reviewedCount = 0;
    st.idx = 0;
    st.learn = null;
    S.flipped = false;
    F.typed.reset();
  }
  // After a card is reviewed, its siblings leave today's queue.
  function dropSiblings(c) {
    if (st.allowSiblings || st.mode !== 'due') return;
    const key = F.cards.siblingKey(c);
    const before = st.queue.length;
    const cur = st.queue[st.idx];
    st.queue = st.queue.filter(x => x === c || F.cards.siblingKey(x) !== key);
    st.deferred += before - st.queue.length;
    const i = st.queue.indexOf(cur);
    if (i >= 0) st.idx = i;
  }

  function applyFilters() {
    rebuildQueue();
    F.app.render();
  }

  function statsLine() {
    if (st.mode === 'buried') {
      return `<strong>${st.queue.length}</strong> buried &middot; hidden from study`;
    }
    const s = scopeStats();
    const streak = F.store.studyStreak();
    return `<strong>${st.queue.length}</strong> left &middot; ${s.due} due &middot; ${s.fresh} new`
      + ` &middot; <span class="stat-today">${F.store.revToday()} today</span>`
      + (streak > 1 ? ` &middot; <span class="stat-streak">${streak}-day streak</span>` : '');
  }

  // ---------- Card renderers ----------
  const renderers = [];
  function registerRenderer(r) { renderers.push(r); }
  function pickRenderer(c, ctx) {
    for (let i = renderers.length - 1; i >= 0; i--) if (renderers[i].match(c, ctx)) return renderers[i];
    return null;
  }

  const TAP = '<span class="tap-hint">Tap to reveal</span>';
  const TYPE_WORD = { vocabulary: 'vocabulary', grammar: 'grammar', phrases: 'phrase', story: 'story', cloze: 'fill in the blank' };
  // Sentence case: "Session 35 · vocabulary · English → Farsi", "Alphabet", "Verbs · English → Farsi".
  function tagText(c) {
    const toFa = c.direction === 'english-to-farsi' ? ' · English → Farsi' : '';
    if (c.type === 'alphabet') return 'Alphabet';
    if (c.type === 'verbs') return 'Verbs' + toFa;
    const s = F.cards.sessions.find(x => x.id === c.session);
    return `${s ? s.label : c.session} · ${TYPE_WORD[c.type] || c.type}${toFa}`;
  }
  const tagHTML = c => `<span class="card-tag">${typeof c === 'string' ? c : tagText(c)}</span>`;
  const pinFront = c => `<div class="english-big pin-front">${c.pinglish}</div>`;

  // Default renderers, most general first (later ones win when they match).
  registerRenderer({
    name: 'fa-en',
    match: () => true,
    render(c, ctx) {
      const tag = tagHTML(c);
      if (ctx.frontMode === 'pinglish') {
        return {
          front: `${tag}<div class="front-content">${pinFront(c)}</div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      return {
        front: `${tag}<div class="front-content"><div class="farsi-big" lang="fa" dir="rtl">${c.farsi}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });
  registerRenderer({
    name: 'en-fa',
    match: c => c.direction === 'english-to-farsi',
    render(c) {
      const tag = tagHTML(c);
      return {
        front: `${tag}<div class="front-content"><div class="english-big">${c.english}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });
  registerRenderer({
    name: 'alphabet',
    match: c => c.type === 'alphabet',
    render(c, ctx) {
      const tag = tagHTML(c);
      const front = ctx.frontMode === 'pinglish'
        ? `${tag}<div class="front-content"><div class="english-big">${c.name}</div><div class="pinglish" style="margin-top:8px">Sound: ${c.sound}</div></div>${TAP}`
        : `${tag}<div class="front-content"><div class="farsi-big letter-big" lang="fa" dir="rtl">${c.isolated}</div></div>${TAP}`;
      const cell = (label, ch) => `<div class="letter-form-cell"><div class="form-label">${label}</div><div class="form-char">${ch}</div></div>`;
      const back = `${tag}<div class="back-content"><div class="meaning">${c.name}</div><div class="pinglish">Sound: ${c.sound}</div><div class="letter-forms">`
        + cell('Isolated', c.isolated) + cell('Initial', c.initial) + cell('Medial', c.medial) + cell('Final', c.final)
        + `</div><div class="breakdown">${c.notes}</div></div>`;
      return { front, back };
    },
  });
  registerRenderer({
    name: 'verbs',
    match: c => c.type === 'verbs',
    render(c, ctx) {
      const tag = tagHTML(c);
      if (c.direction === 'english-to-farsi') {
        return {
          front: `${tag}<div class="front-content"><div class="english-big">${c.english}</div></div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      if (ctx.frontMode === 'pinglish') {
        return {
          front: `${tag}<div class="front-content">${pinFront(c)}</div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      return {
        front: `${tag}<div class="front-content"><div class="farsi-big" lang="fa" dir="rtl">${c.farsi}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });

  // ---------- Typed recall ----------
  // English → Farsi: type the Farsi (or pinglish, graded Hard at best).
  // Farsi → English: type the pinglish, as before.
  const typeFarsi = c => c.direction === 'english-to-farsi';
  function typedRecallActive(c) {
    if (!S.typedMode || !c || c.type === 'alphabet' || c.type === 'cloze') return false;
    if (st.learn && st.learn.cardId === c.id) return false;
    if (typeFarsi(c)) {
      // Rule-of-thumb cards (affixes, "x = y", "…") are not words to type.
      return !/[=…()A-Za-z]/.test(c.farsi) && !/^\s*ـ|ـ\s*$/.test(c.farsi);
    }
    // Pinglish on the front means the answer is already showing.
    if (st.frontMode === 'pinglish') return false;
    // Skip rule-of-thumb cards whose "pinglish" is an explanation rather than a word to type
    return !/[=\u0600-\u06FF]/.test(c.pinglish);
  }
  function typedCheck(value) {
    const c = st.queue[st.idx];
    if (!c) return null;
    return typeFarsi(c) ? F.typed.checkFarsi(value, c.farsi, c.pinglish) : F.typed.checkPinglish(value, c.pinglish);
  }

  // ---------- Rendering ----------
  function learnOffer() {
    if (!F.learn || st.mode !== 'due') return '';
    const id = F.learn.nextSession();
    if (!id) return '';
    const n = F.learn.pending(id);
    const s = F.cards.sessions.find(x => x.id === id);
    return `<button type="button" class="action-btn learn-offer" data-action="learn-start" data-arg="${U.escAttr(id)}">`
      + `Learn ${s ? s.label.replace(/^Sessions?/, m => m.toLowerCase()) : id} (${n} new)</button>`;
  }
  function siblingsNote() {
    if (st.mode !== 'due' || !st.deferred || st.allowSiblings) return '';
    return `<p class="sib-note">${st.deferred} ${st.deferred === 1 ? 'card waits' : 'cards wait'} until tomorrow because you already saw `
      + `${st.deferred === 1 ? 'its' : 'their'} other direction today.</p>`
      + '<button type="button" class="action-btn" data-action="study-siblings">Study them anyway</button>';
  }

  function renderEmpty() {
    const s = scopeStats();
    const n = st.reviewedCount;
    let msg;
    if (st.mode === 'buried') {
      msg = n > 0
        ? `<div class="empty-state"><h2>Done for now</h2><p>Restored ${n} card${n === 1 ? '' : 's'}.</p></div>`
        : '<div class="empty-state"><h2>Nothing buried</h2><p>Bury a card to hide it from study. It stays gone until you unbury it here.</p></div>';
    } else if (n > 0) {
      const nd = nextDueLabel();
      msg = `<div class="empty-state"><h2>Done for now</h2><p>${n} card${n === 1 ? '' : 's'} reviewed.`
        + (s.fresh ? ` ${s.fresh} new card${s.fresh === 1 ? '' : 's'} waiting behind today's limit of ${st.newPerDay}${st.direction === 'both' ? ' per direction' : ''}.` : '')
        + (nd ? ` Next review in ${nd}.` : '') + `</p>${siblingsNote()}${learnOffer()}</div>`;
    } else if (s.fresh || s.later || st.deferred) {
      const nd = nextDueLabel();
      msg = '<div class="empty-state"><h2>All caught up</h2><p>Nothing is due right now.'
        + (nd ? ` Next review in ${nd}.` : '')
        + (s.fresh ? ` ${s.fresh} unseen card${s.fresh === 1 ? '' : 's'} left — raise New/day or switch to All cards to get ahead.` : '')
        + `</p>${siblingsNote()}${learnOffer()}</div>`;
    } else {
      const buriedN = countBuried();
      msg = buriedN
        ? `<div class="empty-state"><h2>No cards match</h2><p>${buriedN} buried card${buriedN === 1 ? '' : 's'} hidden from study. Open Buried to restore one.</p></div>`
        : '<div class="empty-state"><h2>No cards match</h2><p>Adjust the filters above</p></div>';
    }
    $('card-area').innerHTML = msg;
    $('nav-pos').textContent = '0 / 0';
    $('card-count').innerHTML = statsLine();
    $('progress-fill').style.width = n > 0 ? '100%' : '0%';
    $('progress-text').textContent = `${n}`;
  }

  // Moves the tag chip and badges into one header row at the top of a face,
  // so they never sit on top of a long sentence.
  function headerize(face) {
    const tag = face.querySelector(':scope > .card-tag');
    const badges = face.querySelectorAll(':scope > .mastered-badge, :scope > .leech-badge, :scope > .buried-badge');
    if (!tag && !badges.length) return;
    const head = document.createElement('div');
    head.className = 'card-head';
    if (tag) head.appendChild(tag);
    badges.forEach(b => head.appendChild(b));
    face.insertBefore(head, face.firstChild);
  }

  function menuHTML(c) {
    const buried = isBuried(c);
    return '<button type="button" class="card-menu-btn" data-action="card-menu" aria-label="More actions" aria-haspopup="true" aria-expanded="false">'
      + '<span aria-hidden="true">&#8943;</span></button>'
      + '<div class="card-menu" id="card-menu" role="menu" hidden>'
      + (buried
        ? '<button type="button" role="menuitem" data-action="unbury">Unbury this card</button>'
        : '<button type="button" role="menuitem" data-action="bury">Bury this card<span>Hide it from study until you unbury it</span></button>')
      + (st.idx < st.queue.length - 1 ? '<button type="button" role="menuitem" data-action="next">Skip for now</button>' : '')
      + '</div>';
  }

  function exampleBlock(c) {
    if (c.type === 'cloze' || c.type === 'alphabet' || !F.learn) return '';
    const s = srsOf(c);
    const ex = F.cards.exampleFor(c.itemId, s ? s.reps : 0);
    return ex ? F.learn.exampleHTML(ex, F.cards.item(c.itemId)) : '';
  }

  // A brand-new lesson item: present it first (learn.js), then one check.
  function renderPresentation(c) {
    const item = F.cards.item(c.itemId);
    if (!st.learn || st.learn.cardId !== c.id) st.learn = { cardId: c.id, phase: 'present' };
    const area = $('card-area');
    if (st.learn.phase === 'present') {
      area.innerHTML = `<div class="card-shell">${F.learn.presentHTML(item, { sessionId: c.session })}</div>`;
    } else {
      area.innerHTML = `<div class="card-shell">${F.learn.checkCardHTML(item, c.session)}</div>`;
    }
    $('nav-pos').textContent = 'new item';
    $('prev-btn').disabled = st.idx === 0;
    $('next-btn').disabled = st.idx >= st.queue.length - 1;
    $('card-count').innerHTML = statsLine();
    const total = st.reviewedCount + st.queue.length;
    $('progress-fill').style.width = (total ? Math.round((st.reviewedCount / total) * 100) : 0) + '%';
    $('progress-text').textContent = `${st.reviewedCount}/${total}`;
    if (S.flipped) F.audio.maybeSpeak();
  }
  const presenting = c => !!c && st.mode !== 'buried' && ((st.learn && st.learn.cardId === c.id) || needsIntro(c));

  function renderCard() {
    if (st.queue.length === 0) { st.shownId = null; renderEmpty(); return; }
    if (st.idx >= st.queue.length) st.idx = st.queue.length - 1;
    if (st.idx < 0) st.idx = 0;
    const c = st.queue[st.idx];
    if (st.shownId !== c.id) { st.shownId = c.id; st.shownAt = Date.now(); }
    if (st.learn && st.learn.cardId !== c.id) st.learn = null;
    if (presenting(c)) { renderPresentation(c); return; }

    $('card-area').innerHTML = `<div class="card-shell">${menuHTML(c)}<div class="card-wrapper" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card">`
      + '<div class="card-face card-front" id="card-front"></div><div class="card-face card-back" id="card-back"></div></div></div></div>';
    const front = $('card-front');
    const back = $('card-back');
    const ctx = { frontMode: st.frontMode, direction: st.direction, mode: st.mode };
    const faces = pickRenderer(c, ctx).render(c, ctx);
    // Sentences get a smaller Farsi size than single words.
    if (String(c.farsi || '').length > 28) $('card').classList.add('is-long');
    front.innerHTML = faces.front;
    back.innerHTML = faces.back;
    const ex = exampleBlock(c);
    if (ex) {
      const body = back.querySelector('.back-content');
      if (body) body.insertAdjacentHTML('beforeend', ex);
    }

    if (typedRecallActive(c)) {
      const fa = typeFarsi(c);
      const hint = fa ? 'Type it in Farsi' : 'Type the pinglish';
      const body = front.querySelector('.front-content') || front;
      body.insertAdjacentHTML('beforeend', F.typed.inputHTML(hint, { fa }));
      const banner = F.typed.bannerHTML();
      const bbody = back.querySelector('.back-content');
      if (banner && bbody) bbody.insertAdjacentHTML('afterbegin', banner);
      // The typed card is about the input: the tap hint would only compete with it.
      const hintEl = front.querySelector('.tap-hint');
      if (hintEl) hintEl.remove();
    }

    if (isBuried(c)) {
      front.insertAdjacentHTML('beforeend', '<span class="buried-badge">Buried</span>');
      back.insertAdjacentHTML('beforeend', '<span class="buried-badge">Buried</span>');
      const body = back.querySelector('.back-content');
      if (body) body.insertAdjacentHTML('beforeend',
        '<div class="buried-tip">Hidden from study. Unbury it if you want this card to come back.</div>');
    } else if (isMastered(c)) {
      front.insertAdjacentHTML('beforeend', '<span class="mastered-badge">Mastered</span>');
      back.insertAdjacentHTML('beforeend', '<span class="mastered-badge">Mastered</span>');
    } else if (isLeech(c)) {
      const badge = `<span class="leech-badge">Leech &middot; ${srsOf(c).lapses} lapses</span>`;
      front.insertAdjacentHTML('beforeend', badge);
      back.insertAdjacentHTML('beforeend', badge);
      const body = back.querySelector('.back-content');
      if (body) body.insertAdjacentHTML('beforeend',
        '<div class="leech-tip">You keep losing this one. Another repetition will not fix it — '
        + 'build a mnemonic, say it out loud, or break it into a smaller piece.</div>');
    }
    headerize(front);
    headerize(back);

    if (F.audio.ready() && speakableText(c)) back.insertAdjacentHTML('beforeend', F.audio.buttonHTML());

    F.hooks.emit('card:rendered', { card: c, front, back, flipped: S.flipped, view: 'cards' });

    const s = srsOf(c);
    $('nav-pos').textContent = s ? `seen ${s.reps}×` : 'new card';
    $('prev-btn').disabled = st.idx === 0;
    $('next-btn').disabled = st.idx >= st.queue.length - 1;
    $('card-count').innerHTML = statsLine();

    const total = st.reviewedCount + st.queue.length;
    const pct = total > 0 ? Math.round((st.reviewedCount / total) * 100) : 0;
    $('progress-fill').style.width = pct + '%';
    $('progress-text').textContent = `${st.reviewedCount}/${total}`;

    if (typedRecallActive(c)) F.typed.focusInput(c.id + '|' + st.reviewedCount);
    if (S.flipped) F.audio.maybeSpeak();
  }

  function renderScoreRow() {
    const row = $('score-row');
    if (!row) return;
    if (!st.queue.length) { row.innerHTML = ''; return; }
    const c = st.queue[st.idx];
    if (presenting(c)) { row.innerHTML = F.learn.stepButtonsHTML(st.learn ? st.learn.phase : 'present'); return; }
    if (!S.flipped) {
      row.innerHTML = '<button class="score-btn show" data-action="flip">Show answer</button>'
        + (st.mode === 'buried' && isBuried(c) ? '<button class="score-btn unbury" data-action="unbury"><span>Unbury</span><span class="score-sub">restore</span></button>' : '');
      return;
    }
    const prev = srsOf(c);
    const now = Date.now();
    const sug = S.suggestGrade || (S.typedResult === 'wrong' ? 1 : null);
    row.innerHTML = GRADES.map(({ g, label, cls }) => {
      const next = F.fsrs.review(prev, g, now, true);
      const suggest = sug === g ? ' suggest' : '';
      return `<button class="score-btn ${cls}${suggest}" data-action="grade" data-arg="${g}"${sug === g ? ' aria-describedby="suggest-note"' : ''}>`
        + `<span>${label}</span><span class="score-sub">${F.fsrs.fmtIvl(next.due - now)}</span></button>`;
    }).join('') + (sug ? '<span class="suggest-note" id="suggest-note">Suggested from your answer</span>' : '');
  }

  function renderScopeBar() {
    const el = $('scope-bar');
    if (!el) return;
    const counts = scopeStateCounts();
    if (!counts.total) {
      el.innerHTML = '<div class="scope-empty">No cards selected — turn a session back on above.</div>';
      return;
    }
    const pct = id => (counts[id] / counts.total) * 100;
    const track = STATES.map(s =>
      counts[s.id] ? `<i class="scope-seg seg-${s.id}" style="width:${pct(s.id)}%"></i>` : '').join('');
    const legend = STATES.map(s =>
      `<span class="legend-item" title="${s.hint}">`
      + `<i class="dot seg-${s.id}"></i>${s.label}`
      + `<b>${counts[s.id]}</b>`
      + `<span class="legend-pct">${Math.round(pct(s.id))}%</span></span>`).join('');
    const leeches = countLeeches();
    const buriedN = countBuried();
    const notes = [];
    if (leeches) {
      notes.push('<button type="button" class="scope-note" data-action="study-weak">'
        + `${leeches} leech${leeches === 1 ? '' : 'es'} — study weak spots</button>`);
    }
    if (buriedN) {
      notes.push(`<button type="button" class="scope-note" data-action="study-buried">${buriedN} buried</button>`);
    }
    el.innerHTML = `<div class="scope-track">${track}</div><div class="scope-legend">${legend}${notes.join('')}</div>`;
  }

  // ---------- Actions ----------
  function clearCardState() { S.flipped = false; F.typed.reset(); st.learn = null; closeMenu(); }

  // ---------- Undo ----------
  // One level: the last grade, bury or learn check. Restores the srs state,
  // the day counters and the queue position, and removes the review-log entry.
  let undoRec = null;
  let toastTimer = null;
  const snapshot = () => ({ queue: st.queue.slice(), idx: st.idx, reviewedCount: st.reviewedCount, deferred: st.deferred });
  function unbumpDay(log, bucket) {
    const d = F.store.data[log];
    const k = U.todayKey();
    if (!d || d[k] == null) return;
    if (!bucket) { if (d[k] > 0) d[k]--; return; }
    if (typeof d[k] === 'number') { if (bucket === 'fa' && d[k] > 0) d[k]--; return; }
    if (d[k][bucket] > 0) d[k][bucket]--;
  }
  function showToast(text) {
    if (typeof document === 'undefined') return;
    let t = $('study-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'study-toast';
      t.className = 'study-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.innerHTML = `<span class="toast-msg">${text}</span><button type="button" class="toast-undo" data-action="study-undo">Undo</button>`;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    const t = typeof document !== 'undefined' && $('study-toast');
    if (t) { t.classList.remove('show'); t.hidden = true; }
  }
  function undo() {
    const r = undoRec;
    if (!r) return;
    undoRec = null;
    const id = r.card.id;
    if (r.kind === 'grade') {
      if (r.prev) F.store.setSrs(id, r.prev); else F.store.deleteSrs(id);
      if (r.wasBuried) F.store.bury(id, r.wasBuried);
      unbumpDay('revLog');
      if (!r.prev) unbumpDay('newLog', F.cards.newBucket(r.card));
      Promise.resolve(r.appended).then(() => F.store.reviews.remove(r.review));
    } else if (r.kind === 'bury') {
      F.store.unbury(id);
    } else if (r.kind === 'learn') {
      F.learn.undo(r.learnRec);
    }
    F.store.saveSoon();
    Object.assign(st, r.snap);
    clearCardState();
    st.shownId = null;
    hideToast();
    F.hooks.emit('card:undone', { card: r.card, kind: r.kind });
    if (F.state.tab !== 'cards') F.app.setView('cards'); else F.app.render();
  }

  // ---------- Overflow menu ----------
  function closeMenu() {
    if (typeof document === 'undefined') return;
    const m = $('card-menu');
    if (m && !m.hidden) {
      m.hidden = true;
      const b = document.querySelector('.card-menu-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    }
  }
  function toggleMenu() {
    const m = $('card-menu');
    if (!m) return;
    m.hidden = !m.hidden;
    const b = document.querySelector('.card-menu-btn');
    if (b) b.setAttribute('aria-expanded', String(!m.hidden));
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      if (!e.target.closest || e.target.closest('.card-menu, .card-menu-btn')) return;
      closeMenu();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }

  const GRADE_WORD = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

  function requeueIfSoon(c, next, now) {
    if (next.due - now <= F.fsrs.SITTING_MS && st.mode !== 'buried') {
      const pos = Math.min(st.queue.length, st.idx + 3 + Math.floor(Math.random() * 4));
      st.queue.splice(pos, 0, c);
    }
  }

  function gradeCard(g) {
    if (!st.queue.length) return;
    const c = st.queue[st.idx];
    if (presenting(c)) { learnGrade(g); return; }
    if (!S.flipped) { F.app.flip(); return; }
    const snap = snapshot();
    const prev = srsOf(c);
    const now = Date.now();
    if (!prev) F.store.bumpNewToday(F.cards.newBucket(c));
    F.store.bumpRevToday();
    const next = F.fsrs.review(prev, g, now);
    F.store.setSrs(c.id, next);
    const wasBuried = F.store.data.buried[c.id] || null;
    if (wasBuried) F.store.unbury(c.id);
    const review = {
      cardId: c.id, ts: now, rating: g,
      elapsedDays: prev ? Math.max(0, (now - prev.last) / F.fsrs.DAY_MS) : null,
      durationMs: st.shownId === c.id ? now - st.shownAt : null,
      stateBefore: prev ? prev.state : 'new', sBefore: prev ? prev.s : null, dBefore: prev ? prev.d : null,
      stateAfter: next.state, sAfter: next.s, dAfter: next.d, dueAfter: next.due,
    };
    const appended = F.store.reviews.append(review);
    st.reviewedCount++;
    st.queue.splice(st.idx, 1);
    requeueIfSoon(c, next, now);
    dropSiblings(c);
    if (st.idx >= st.queue.length) st.idx = 0;
    st.shownId = null;
    clearCardState();
    undoRec = { kind: 'grade', card: c, prev: prev || null, wasBuried, review, appended, snap };
    F.hooks.emit('card:graded', { card: c, rating: g, before: prev || null, after: next, review });
    showToast(`${GRADE_WORD[g]} &middot; next in ${F.fsrs.fmtIvl(next.due - now)}`);
    F.app.render();
  }

  // ---------- Learn presentation inside study ----------
  function learnNext() {
    const c = st.queue[st.idx];
    if (!c || !presenting(c)) return;
    st.learn = { cardId: c.id, phase: 'check' };
    S.flipped = false;
    F.app.render();
  }
  function learnGrade(g) {
    const c = st.queue[st.idx];
    if (!c || !presenting(c) || !st.learn || st.learn.phase !== 'check') return;
    if (!S.flipped) { F.app.flip(); return; }
    const snap = snapshot();
    const now = Date.now();
    const rec = F.learn.complete(c.itemId, g >= 3 ? 3 : 1, now);
    st.reviewedCount++;
    st.queue.splice(st.idx, 1);
    // The checked card (usually English → Farsi) comes back for its learning
    // step; the other direction waits for tomorrow.
    const qi = st.queue.indexOf(rec.card);
    if (qi >= 0) { st.queue.splice(qi, 1); if (qi < st.idx) st.idx--; }
    requeueIfSoon(rec.card, rec.next, now);
    dropSiblings(rec.card);
    if (st.idx >= st.queue.length) st.idx = 0;
    st.shownId = null;
    clearCardState();
    undoRec = { kind: 'learn', card: c, learnRec: rec, snap };
    showToast(`${g >= 3 ? 'Got it' : 'Not yet'} &middot; back in ${F.fsrs.fmtIvl(rec.next.due - now)}`);
    F.app.render();
  }

  function buryCard() {
    if (!st.queue.length) return;
    const c = st.queue[st.idx];
    if (isBuried(c)) return;
    const snap = snapshot();
    F.store.bury(c.id);
    st.reviewedCount++;
    st.queue.splice(st.idx, 1);
    if (st.idx >= st.queue.length) st.idx = 0;
    clearCardState();
    undoRec = { kind: 'bury', card: c, snap };
    F.hooks.emit('card:buried', { card: c });
    showToast('Card buried');
    F.app.render();
  }

  function unburyCard() {
    if (!st.queue.length) return;
    const c = st.queue[st.idx];
    if (!isBuried(c)) return;
    F.store.unbury(c.id);
    st.queue.splice(st.idx, 1);
    if (st.idx >= st.queue.length) st.idx = 0;
    clearCardState();
    F.hooks.emit('card:unburied', { card: c });
    F.app.render();
  }

  function resetProgress() {
    const base = F.cards.all.filter(matchesFilters);
    const hasSaved = base.some(c => srsOf(c) || isBuried(c));
    if (hasSaved && !root.confirm('Reset the review schedule for the cards in this view? They go back to being brand new, and any buried cards come back.')) return;
    for (const c of base) {
      delete F.store.data.srs[c.id];
      delete F.store.data.buried[c.id];
    }
    F.store.save();
    applyFilters();
  }

  function speakableText(c) {
    if (!c || c.type === 'alphabet') return '';
    return c.farsi || '';
  }

  F.actions.register('grade', el => gradeCard(Number(el.dataset.arg)));
  F.actions.register('bury', () => buryCard());
  F.actions.register('unbury', () => unburyCard());
  F.actions.register('card-menu', () => toggleMenu());
  F.actions.register('study-undo', () => undo());
  F.actions.register('study-siblings', () => { st.allowSiblings = true; applyFilters(); });
  F.actions.register('study-weak', () => { st.mode = 'weak'; F.settings.build(); applyFilters(); });
  F.actions.register('study-buried', () => { st.mode = 'buried'; F.settings.build(); applyFilters(); });
  F.actions.register('toggle-hide-mastered', () => {
    st.hideMastered = !st.hideMastered;
    $('mastered-btn').classList.toggle('active', st.hideMastered);
    applyFilters();
  });
  F.actions.register('cycle-new-limit', () => {
    const i = NEW_LIMITS.indexOf(st.newPerDay);
    st.newPerDay = NEW_LIMITS[(i + 1) % NEW_LIMITS.length];
    syncNewLimitBtn();
    applyFilters();
  });
  function syncNewLimitBtn() { $('newlimit-btn').textContent = `New/day: ${st.newPerDay}`; }

  // ---------- Prefs ----------
  F.store.registerPrefs({
    save(p) {
      p.sessions = [...st.sessions];
      p.knownSessions = F.cards.sessions.map(s => s.id);
      p.types = [...st.types];
      p.knownTypes = F.cards.TYPES.map(t => t.id);
      p.direction = st.direction;
      p.frontMode = st.frontMode;
      p.hideMastered = st.hideMastered;
      p.studyMode = st.mode;
      p.newPerDay = st.newPerDay;
    },
    load(p) {
      const sessions = F.cards.sessions;
      st.sessions = new Set(sessions.map(s => s.id));
      if (Array.isArray(p.sessions)) {
        st.sessions = new Set(p.sessions.filter(s => sessions.some(x => x.id === s)));
        // Sessions added since the prefs were saved switch on by themselves.
        const known = new Set(p.knownSessions || []);
        for (const s of sessions) if (!known.has(s.id)) st.sessions.add(s.id);
      }
      if (Array.isArray(p.types) && p.types.length) {
        st.types = new Set(p.types);
        const knownT = new Set(p.knownTypes || []);
        for (const t of F.cards.TYPES) if (!knownT.has(t.id)) st.types.add(t.id);
      }
      if (p.direction) st.direction = p.direction;
      if (p.frontMode) st.frontMode = p.frontMode;
      if (typeof p.hideMastered === 'boolean') st.hideMastered = p.hideMastered;
      if (STUDY_MODES.some(m => m.id === p.studyMode)) st.mode = p.studyMode;
      if (NEW_LIMITS.includes(p.newPerDay)) st.newPerDay = p.newPerDay;
    },
  });

  // ---------- Public API + view ----------
  F.study = {
    state: st,
    STUDY_MODES, FRONT_MODES, DIRECTIONS, NEW_LIMITS, STATES, GRADES,
    registerRenderer, applyFilters, rebuildQueue,
    srsOf, isBuried, isMastered, isLeech, isWeak, cardState, matchesFilters, inScope, inScopeBase,
    scopeStats, sessionStateCounts, scopeStateCounts, meterHTML, meterTitle,
    gradeCard, buryCard, unburyCard, current: () => st.queue[st.idx] || null,
    tagHTML, tagText, siblingSeenToday, learnNext, learnGrade, undo,
    canUndo: () => !!undoRec,
  };

  F.views.register('cards', {
    label: 'Flashcards',
    order: 10,
    panel: 'fc-filters',
    // Boot, after prefs are loaded. Builds the queue; the app renders after.
    init() {
      $('mastered-btn').classList.toggle('active', st.hideMastered);
      syncNewLimitBtn();
      rebuildQueue();
    },
    render() { renderCard(); renderScopeBar(); },
    renderScoreRow,
    syncChrome() {
      $('mastered-btn').hidden = false;
      $('newlimit-btn').hidden = false;
      $('score-row').style.display = '';
    },
    shortcutsHTML() {
      return '<span><kbd>Space</kbd> show answer &nbsp; <kbd>1</kbd> again &nbsp; <kbd>2</kbd> hard &nbsp; <kbd>3</kbd> good &nbsp; <kbd>4</kbd> easy &nbsp; <kbd>b</kbd> bury &nbsp; <kbd>u</kbd> undo &nbsp; <kbd>&#8594;</kbd> skip'
        + (F.audio.ready() ? ' &nbsp; <kbd>s</kbd> hear it' : '') + '</span>';
    },
    next() { if (st.idx < st.queue.length - 1) { st.idx++; clearCardState(); F.app.render(); } },
    prev() { if (st.idx > 0) { st.idx--; clearCardState(); F.app.render(); } },
    onShuffle() { applyFilters(); },
    reset: resetProgress,
    typedActive() { return typedRecallActive(st.queue[st.idx]); },
    typedAnswer() { return st.queue[st.idx] ? st.queue[st.idx].pinglish : ''; },
    typedCheck,
    leave() { closeMenu(); hideToast(); },
    speech() {
      const c = st.queue[st.idx];
      if (!c) return null;
      return { text: speakableText(c), token: c.id + '|' + st.reviewedCount };
    },
    keydown(e) {
      const c = st.queue[st.idx];
      if (presenting(c) && st.learn && st.learn.phase === 'present') {
        // app.js has already toggled the flip; in the presentation Space means "next".
        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') { S.flipped = false; learnNext(); }
        return;
      }
      if ((e.key === 'z' || e.key === 'Z' || e.key === 'u') && undoRec) { undo(); return; }
      if (e.key >= '1' && e.key <= '4') gradeCard(Number(e.key));
      else if (e.key === 'b' || e.key === 'B') {
        if (st.queue.length && isBuried(st.queue[st.idx])) unburyCard();
        else buryCard();
      }
    },
  });
})(window);
