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

  // Rebuilds the queue from the filters without drawing anything.
  function rebuildQueue() {
    st.queue = F.cards.buildQueue({
      base: F.cards.all.filter(inScope),
      mode: st.mode,
      shuffled: S.shuffled,
      direction: st.direction,
      now: Date.now(),
      srsOf, isWeak,
      allowance: { fa: st.newPerDay - F.store.newToday('fa'), en: st.newPerDay - F.store.newToday('en') },
    });
    st.reviewedCount = 0;
    st.idx = 0;
    S.flipped = false;
    F.typed.reset();
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

  const TAP = '<span class="tap-hint">tap to reveal</span>';
  const tagHTML = t => `<span class="card-tag">${t}</span>`;
  const pinFront = c => `<div class="english-big" style="font-size:1.8rem;font-style:italic;color:var(--blue)">${c.pinglish}</div>`;

  // Default renderers, most general first (later ones win when they match).
  registerRenderer({
    name: 'fa-en',
    match: () => true,
    render(c, ctx) {
      const tag = tagHTML(`${c.session} / ${c.type}`);
      if (ctx.frontMode === 'pinglish') {
        return {
          front: `${tag}<div class="front-content">${pinFront(c)}</div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      return {
        front: `${tag}<div class="front-content"><div class="farsi-big">${c.farsi}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });
  registerRenderer({
    name: 'en-fa',
    match: c => c.direction === 'english-to-farsi',
    render(c) {
      const tag = tagHTML(`${c.session} / ${c.type} / EN→FA`);
      return {
        front: `${tag}<div class="front-content"><div class="english-big">${c.english}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });
  registerRenderer({
    name: 'alphabet',
    match: c => c.type === 'alphabet',
    render(c, ctx) {
      const tag = tagHTML('ALPHABET');
      const front = ctx.frontMode === 'pinglish'
        ? `${tag}<div class="front-content"><div class="english-big">${c.name}</div><div class="pinglish" style="margin-top:8px">Sound: ${c.sound}</div></div>${TAP}`
        : `${tag}<div class="front-content"><div class="farsi-big" style="font-size:5rem">${c.isolated}</div></div>${TAP}`;
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
      const tag = tagHTML(c.direction === 'english-to-farsi' ? 'VERBS / EN→FA' : 'VERBS');
      if (c.direction === 'english-to-farsi') {
        return {
          front: `${tag}<div class="front-content"><div class="english-big">${c.english}</div></div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      if (ctx.frontMode === 'pinglish') {
        return {
          front: `${tag}<div class="front-content">${pinFront(c)}</div>${TAP}`,
          back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
        };
      }
      return {
        front: `${tag}<div class="front-content"><div class="farsi-big">${c.farsi}</div></div>${TAP}`,
        back: `${tag}<div class="back-content"><div class="farsi-answer">${c.farsi}</div><div class="pinglish">${c.pinglish}</div><div class="meaning">${c.english}</div><div class="breakdown">${c.breakdown}</div></div>`,
      };
    },
  });

  // ---------- Typed recall ----------
  function typedRecallActive(c) {
    if (!S.typedMode || !c || c.type === 'alphabet') return false;
    // Pinglish on the front means the answer is already showing. English → Farsi
    // still prompts in English, so typing the pinglish stays a real recall.
    if (st.frontMode === 'pinglish' && c.direction !== 'english-to-farsi') return false;
    // Skip rule-of-thumb cards whose "pinglish" is an explanation rather than a word to type
    return !/[=؀-ۿ]/.test(c.pinglish);
  }

  // ---------- Rendering ----------
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
        + (nd ? ` Next review in ${nd}.` : '') + '</p></div>';
    } else if (s.fresh || s.later) {
      const nd = nextDueLabel();
      msg = '<div class="empty-state"><h2>All caught up</h2><p>Nothing is due right now.'
        + (nd ? ` Next review in ${nd}.` : '')
        + (s.fresh ? ` ${s.fresh} unseen card${s.fresh === 1 ? '' : 's'} left — raise New/day or switch to All cards to get ahead.` : '')
        + '</p></div>';
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

  function renderCard() {
    if (st.queue.length === 0) { st.shownId = null; renderEmpty(); return; }
    if (st.idx >= st.queue.length) st.idx = st.queue.length - 1;
    if (st.idx < 0) st.idx = 0;
    const c = st.queue[st.idx];
    if (st.shownId !== c.id) { st.shownId = c.id; st.shownAt = Date.now(); }

    $('card-area').innerHTML = `<div class="card-wrapper" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card">`
      + '<div class="card-face card-front" id="card-front"></div><div class="card-face card-back" id="card-back"></div></div></div>';
    const front = $('card-front');
    const back = $('card-back');
    const ctx = { frontMode: st.frontMode, direction: st.direction, mode: st.mode };
    const faces = pickRenderer(c, ctx).render(c, ctx);
    front.innerHTML = faces.front;
    back.innerHTML = faces.back;

    if (typedRecallActive(c)) {
      const hint = c.direction === 'english-to-farsi' ? 'type it in pinglish…' : 'read it aloud, then type the pinglish…';
      front.insertAdjacentHTML('beforeend', F.typed.inputHTML(hint));
      back.insertAdjacentHTML('beforeend', F.typed.bannerHTML());
    }

    if (isBuried(c)) {
      front.insertAdjacentHTML('beforeend', '<span class="buried-badge">buried</span>');
      back.insertAdjacentHTML('beforeend', '<span class="buried-badge">buried</span>');
      const body = back.querySelector('.back-content');
      if (body) body.insertAdjacentHTML('beforeend',
        '<div class="buried-tip">Hidden from study. Unbury it if you want this card to come back.</div>');
    } else if (isMastered(c)) {
      front.insertAdjacentHTML('beforeend', '<span class="mastered-badge">mastered</span>');
      back.insertAdjacentHTML('beforeend', '<span class="mastered-badge">mastered</span>');
    } else if (isLeech(c)) {
      const badge = `<span class="leech-badge">leech &middot; ${srsOf(c).lapses} lapses</span>`;
      front.insertAdjacentHTML('beforeend', badge);
      back.insertAdjacentHTML('beforeend', badge);
      const body = back.querySelector('.back-content');
      if (body) body.insertAdjacentHTML('beforeend',
        '<div class="leech-tip">You keep losing this one. Another repetition will not fix it — '
        + 'build a mnemonic, say it out loud, or break it into a smaller piece.</div>');
    }

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

    F.typed.focusInput();
    if (S.flipped) F.audio.maybeSpeak();
  }

  function buryBtnHTML() {
    return isBuried(st.queue[st.idx])
      ? '<button class="score-btn unbury" data-action="unbury"><span>Unbury</span><span class="score-sub">restore</span></button>'
      : '<button class="score-btn bury" data-action="bury"><span>Bury</span><span class="score-sub">hide</span></button>';
  }

  function renderScoreRow() {
    const row = $('score-row');
    if (!row) return;
    if (!st.queue.length) { row.innerHTML = ''; return; }
    if (!S.flipped) {
      row.innerHTML = '<button class="score-btn show" data-action="flip">Show answer</button>' + buryBtnHTML();
      return;
    }
    const prev = srsOf(st.queue[st.idx]);
    const now = Date.now();
    row.innerHTML = GRADES.map(({ g, label, cls }) => {
      const next = F.fsrs.review(prev, g, now, true);
      const suggest = S.typedResult === 'wrong' && g === 1 ? ' suggest' : '';
      return `<button class="score-btn ${cls}${suggest}" data-action="grade" data-arg="${g}">`
        + `<span>${label}</span><span class="score-sub">${F.fsrs.fmtIvl(next.due - now)}</span></button>`;
    }).join('') + buryBtnHTML();
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
  function clearCardState() { S.flipped = false; F.typed.reset(); }

  function gradeCard(g) {
    if (!st.queue.length) return;
    if (!S.flipped) { F.app.flip(); return; }
    const c = st.queue[st.idx];
    const prev = srsOf(c);
    const now = Date.now();
    if (!prev) F.store.bumpNewToday(F.cards.newBucket(c));
    F.store.bumpRevToday();
    const next = F.fsrs.review(prev, g, now);
    F.store.setSrs(c.id, next);
    if (isBuried(c)) F.store.unbury(c.id);
    const review = {
      cardId: c.id, ts: now, rating: g,
      elapsedDays: prev ? Math.max(0, (now - prev.last) / F.fsrs.DAY_MS) : null,
      durationMs: st.shownId === c.id ? now - st.shownAt : null,
      stateBefore: prev ? prev.state : 'new', sBefore: prev ? prev.s : null, dBefore: prev ? prev.d : null,
      stateAfter: next.state, sAfter: next.s, dAfter: next.d, dueAfter: next.due,
    };
    F.store.reviews.append(review);
    st.reviewedCount++;
    st.queue.splice(st.idx, 1);
    if (next.due - now <= F.fsrs.SITTING_MS && st.mode !== 'buried') {
      const pos = Math.min(st.queue.length, st.idx + 3 + Math.floor(Math.random() * 4));
      st.queue.splice(pos, 0, c);
    }
    if (st.idx >= st.queue.length) st.idx = 0;
    st.shownId = null;
    clearCardState();
    F.hooks.emit('card:graded', { card: c, rating: g, before: prev || null, after: next, review });
    F.app.render();
  }

  function buryCard() {
    if (!st.queue.length) return;
    const c = st.queue[st.idx];
    if (isBuried(c)) return;
    F.store.bury(c.id);
    st.reviewedCount++;
    st.queue.splice(st.idx, 1);
    if (st.idx >= st.queue.length) st.idx = 0;
    clearCardState();
    F.hooks.emit('card:buried', { card: c });
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
      return '<span><kbd>Space</kbd> show answer &nbsp; <kbd>1</kbd> again &nbsp; <kbd>2</kbd> hard &nbsp; <kbd>3</kbd> good &nbsp; <kbd>4</kbd> easy &nbsp; <kbd>b</kbd> bury &nbsp; <kbd>&#8594;</kbd> skip'
        + (F.audio.ready() ? ' &nbsp; <kbd>s</kbd> hear it' : '') + '</span>';
    },
    next() { if (st.idx < st.queue.length - 1) { st.idx++; clearCardState(); F.app.render(); } },
    prev() { if (st.idx > 0) { st.idx--; clearCardState(); F.app.render(); } },
    onShuffle() { applyFilters(); },
    reset: resetProgress,
    typedActive() { return typedRecallActive(st.queue[st.idx]); },
    typedAnswer() { return st.queue[st.idx] ? st.queue[st.idx].pinglish : ''; },
    speech() {
      const c = st.queue[st.idx];
      if (!c) return null;
      return { text: speakableText(c), token: c.id + '|' + st.reviewedCount };
    },
    keydown(e) {
      if (e.key >= '1' && e.key <= '4') gradeCard(Number(e.key));
      else if (e.key === 'b' || e.key === 'B') {
        if (st.queue.length && isBuried(st.queue[st.idx])) unburyCard();
        else buryCard();
      }
    },
  });
})(window);
