// ui/learn.js: learn mode. A new lesson item's first exposure is a
// presentation, not a test: Farsi, pinglish, meaning, breakdown and an
// example, then one immediate recall check. Only then does it enter FSRS.
//
// How the first review is recorded (one item = both directions):
//   - The check is English -> Farsi when the item has that direction (the
//     harder, productive one) and the direction filter is not Farsi -> English
//     only; otherwise Farsi -> English. "Got it" records an FSRS
//     Good on that card, "Not yet" an Again, exactly like a first review in the
//     study view (so it gets the usual 1m / 10m learning steps today).
//   - The other direction gets no review. It is "introduced" and waits for its
//     first real test tomorrow (the sibling rule: one direction per item per
//     day), where it is a normal new card on its own direction's budget.
//   - store.data.learned[itemId] = timestamp of the presentation, and
//     newLog[day].learn counts items introduced today. The New/day setting is
//     the budget: items per day, shared by this view and the study view. The
//     checked card's first review also counts in its direction's bucket
//     (newLog[day].en or .fa), like any first review.
//   - Items reviewed before learn mode existed count as introduced already.
// Only lesson items (vocabulary, grammar, phrases, story) are presented;
// letters, generated verb forms and cloze cards are tested directly.
//
// Today's "New lesson" section (js/ui/today.js) is how a sitting starts.
// API: F.learn.pending(sessionId) -> number not yet introduced
//      F.learn.start(sessionId)    opens the learn view on that session
//      F.learn.needsIntro(card), isIntroduced(itemId), complete(itemId, rating, now), undo(rec)
// The state helpers are DOM-free so tools/test.js can load this file.
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const U = F.util;
  const hasDom = typeof document !== 'undefined';
  const $ = id => (hasDom ? document.getElementById(id) : null);

  const BATCH = 10;
  const SECONDS_PER_ITEM = 25;
  const LEARNABLE = new Set(['vocabulary', 'grammar', 'phrases', 'story']);

  const data = () => {
    const d = F.store.data;
    if (!d.learned || typeof d.learned !== 'object') d.learned = {};
    return d.learned;
  };
  function startOfToday(now) {
    const d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function sessionOf(id) { return F.cards.sessions.find(s => s.id === id) || null; }

  // ---------- State ----------
  function isLearnableItem(itemId) {
    const it = F.cards.item(itemId);
    if (!it || !LEARNABLE.has(it.type)) return false;
    const cards = F.cards.cardsOf(itemId);
    if (!cards.length) return false;
    const s = sessionOf(cards[0].session);
    return !!s && s.kind === 'lesson';
  }
  function isIntroduced(itemId) {
    if (data()[itemId]) return true;
    return F.cards.cardsOf(itemId).some(c => !!F.store.srs(c.id));
  }
  // A new card whose item still needs its presentation.
  function needsIntro(c) {
    if (!c || F.store.srs(c.id)) return false;
    return isLearnableItem(c.itemId) && !isIntroduced(c.itemId);
  }
  function introducedToday(itemId, now) {
    const t = data()[itemId];
    return !!t && t >= startOfToday(now);
  }
  // Introduced on an earlier day (cloze cards wait for this).
  function introducedBefore(itemId, ts) {
    const t = data()[itemId];
    if (t) return t < ts;
    return F.cards.cardsOf(itemId).some(c => { const s = F.store.srs(c.id); return !!s && s.last < ts; });
  }
  function allBuried(itemId) {
    const cards = F.cards.cardsOf(itemId);
    return cards.length > 0 && cards.every(c => F.store.isBuried(c.id));
  }
  function pendingItems(sessionId) {
    const s = sessionOf(sessionId);
    if (!s || s.kind !== 'lesson' || !s.lesson) return [];
    return s.lesson.items.filter(it => isLearnableItem(it.id) && !isIntroduced(it.id) && !allBuried(it.id));
  }
  function pending(sessionId) { return pendingItems(sessionId).length; }
  // The newest lesson that still has items to learn.
  function nextSession() {
    const lessons = F.cards.sessions.filter(s => s.kind === 'lesson')
      .sort((a, b) => F.cards.sessionRank(a.id) - F.cards.sessionRank(b.id));
    const s = lessons.find(x => pending(x.id) > 0);
    return s ? s.id : null;
  }
  function limit() { return (F.study && F.study.state && F.study.state.newPerDay) || 20; }
  function budget() {
    const used = F.store.newToday('learn');
    return { limit: limit(), used, left: Math.max(0, limit() - used) };
  }
  // English -> Farsi, unless the study filter is Farsi -> English only (then
  // the user never sees English -> Farsi cards, so the check is the other way).
  function checkDirection() {
    return F.study && F.study.state && F.study.state.direction === 'farsi-to-english' ? 'farsi-to-english' : 'english-to-farsi';
  }
  function checkCard(itemId) {
    const cards = F.cards.cardsOf(itemId);
    return cards.find(c => c.direction === checkDirection()) || cards[0] || null;
  }

  // Records the presentation + check. rating: 1 (not yet) or 3 (got it).
  // Returns an undo record.
  function complete(itemId, rating, now) {
    now = now || Date.now();
    const c = checkCard(itemId);
    const prev = F.store.srs(c.id) || null;
    const next = F.fsrs.review(prev, rating, now);
    F.store.setSrs(c.id, next);
    const hadLearned = data()[itemId] || null;
    data()[itemId] = now;
    F.store.bumpNewToday('learn');
    if (!prev) F.store.bumpNewToday(F.cards.newBucket(c));
    F.store.bumpRevToday();
    const review = {
      cardId: c.id, ts: now, rating,
      elapsedDays: prev ? Math.max(0, (now - prev.last) / F.fsrs.DAY_MS) : null,
      durationMs: null, source: 'learn',
      stateBefore: prev ? prev.state : 'new', sBefore: prev ? prev.s : null, dBefore: prev ? prev.d : null,
      stateAfter: next.state, sAfter: next.s, dAfter: next.d, dueAfter: next.due,
    };
    const appended = F.store.reviews.append(review);
    F.store.saveSoon();
    const rec = { itemId, card: c, prev, next, review, appended, hadLearned, day: U.todayKey() };
    F.hooks.emit('learn:completed', { itemId, card: c, rating, after: next, review });
    F.hooks.emit('card:graded', { card: c, rating, before: prev, after: next, review });
    return rec;
  }
  function unbump(log, bucket, day) {
    const d = F.store.data[log];
    if (!d || d[day] == null) return;
    if (bucket) {
      if (typeof d[day] === 'object' && d[day][bucket] > 0) d[day][bucket]--;
    } else if (d[day] > 0) d[day]--;
  }
  function undo(rec) {
    if (rec.prev) F.store.setSrs(rec.card.id, rec.prev); else F.store.deleteSrs(rec.card.id);
    if (rec.hadLearned) data()[rec.itemId] = rec.hadLearned; else delete data()[rec.itemId];
    unbump('newLog', 'learn', rec.day);
    if (!rec.prev) unbump('newLog', F.cards.newBucket(rec.card), rec.day);
    unbump('revLog', null, rec.day);
    Promise.resolve(rec.appended).then(() => F.store.reviews.remove(rec.review));
    F.store.saveSoon();
  }

  // ---------- Markup shared with the study view ----------
  const TYPE_WORD = { vocabulary: 'vocabulary', grammar: 'grammar', phrases: 'phrase', story: 'story' };
  function tagText(item, sessionId) {
    const s = sessionOf(sessionId);
    return `${s ? s.label : sessionId} · ${TYPE_WORD[item.type] || item.type}`;
  }
  // "phrase:35" -> "From a session 35 phrase"; "story:st-35-1" -> "From a practice story".
  function sourceLabel(src) {
    const m = /^(phrase|story):(.+)$/.exec(String(src));
    if (!m) return String(src);
    if (/^st-/.test(m[2])) return 'From a practice story';
    const s = sessionOf(m[2]);
    const name = s ? s.label.replace(/^Sessions?/, w => w.toLowerCase()) : 'session ' + m[2];
    return `From a ${name} ${m[1] === 'phrase' ? 'phrase' : 'story'}`;
  }
  function exampleHTML(ex, item) {
    if (!ex) return '';
    let fa = ex.fa;
    if (item && item.fa && !/[\/=…]/.test(item.fa) && fa.includes(item.fa)) {
      fa = fa.replace(item.fa, `<mark>${item.fa}</mark>`);
    }
    return '<div class="card-example">'
      + '<div class="ex-label">Example</div>'
      + `<div class="ex-fa" lang="fa" dir="rtl">${fa}</div>`
      + (ex.pin ? `<div class="ex-pin">${ex.pin}</div>` : '')
      + (ex.en ? `<div class="ex-en">${ex.en}</div>` : '')
      + (ex.source ? `<div class="ex-src">${U.esc(sourceLabel(ex.source))}</div>` : '')
      + '</div>';
  }
  // Sentences get a reading size, like long cards in the study view.
  const isLong = item => String(item.fa || '').length > 28;
  // The presentation face. opts: {sessionId, count: 'n of m'}
  function presentHTML(item, opts) {
    const o = opts || {};
    const ex = F.cards.exampleFor(item.id, 0);
    return `<div class="learn-card" data-action="learn-next">`
      + `<div class="card-head"><span class="card-tag">${tagText(item, o.sessionId)}</span>`
      + `<span class="learn-badge">New${o.count ? ' · ' + o.count : ''}</span></div>`
      + '<div class="learn-body">'
      + `<div class="learn-fa${isLong(item) ? ' is-long' : ''}" lang="fa" dir="rtl">${item.fa}</div>`
      + `<div class="learn-pin">${item.pin}</div>`
      + `<div class="learn-en">${item.en}</div>`
      + (item.notes ? `<div class="learn-notes">${item.notes}</div>` : '')
      + exampleHTML(ex, item)
      + '</div></div>';
  }
  // The check: a normal flip card. Front = prompt, back = answer.
  function checkFaces(item, sessionId) {
    const c = checkCard(item.id);
    const tag = `<div class="card-head"><span class="card-tag">${tagText(item, sessionId)}</span><span class="learn-badge">Quick check</span></div>`;
    const en = c && c.direction === 'english-to-farsi';
    const prompt = en
      ? `<div class="english-big">${item.en}</div><div class="learn-ask">Say it in Farsi</div>`
      : `<div class="farsi-big" lang="fa" dir="rtl">${item.fa}</div><div class="learn-ask">What does it mean?</div>`;
    const front = `${tag}<div class="front-content">${prompt}</div><span class="tap-hint">Tap to reveal</span>`;
    const back = `${tag}<div class="back-content"><div class="farsi-answer" lang="fa" dir="rtl">${item.fa}</div>`
      + `<div class="pinglish">${item.pin}</div><div class="meaning">${item.en}</div></div>`;
    return { front, back };
  }
  function checkCardHTML(item, sessionId) {
    const f = checkFaces(item, sessionId);
    return `<div class="card-wrapper" data-action="flip"><div class="card${isLong(item) ? ' is-long' : ''}${S.flipped ? ' flipped' : ''}" id="card">`
      + `<div class="card-face card-front">${f.front}</div><div class="card-face card-back">${f.back}</div></div></div>`;
  }
  // Score-row buttons for a learn step.
  function stepButtonsHTML(phase) {
    if (phase === 'present') {
      return '<button class="score-btn show" data-action="learn-next">Check yourself</button>';
    }
    if (!S.flipped) return '<button class="score-btn show" data-action="flip">Show answer</button>';
    return '<button class="score-btn again" data-action="learn-grade" data-arg="1"><span>Not yet</span><span class="score-sub">see it again soon</span></button>'
      + '<button class="score-btn know" data-action="learn-grade" data-arg="3"><span>Got it</span><span class="score-sub">into reviews</span></button>';
  }

  // ---------- The learn view ----------
  const st = {
    session: null,
    batch: [],        // item objects for this sitting
    i: 0,
    phase: 'present', // 'present' | 'check' | 'done'
    over: false,      // the user chose to go past today's budget
    done: 0,          // items completed in this sitting
    lastRec: null,
  };

  function fillBatch() {
    const items = st.session ? pendingItems(st.session) : [];
    const n = st.over ? BATCH : Math.min(BATCH, budget().left);
    st.batch = items.slice(0, n);
    st.i = 0;
    st.done = 0;
    st.phase = st.batch.length ? 'present' : 'done';
    S.flipped = false;
  }

  function start(sessionId, opts) {
    st.session = sessionId || nextSession();
    st.over = !!(opts && opts.over);
    fillBatch();
    if (F.app && F.app.setView && F.state.tab !== 'learn') F.app.setView('learn');
    else if (F.app && F.app.render) F.app.render();
  }

  const minutes = n => Math.max(1, Math.round(n * SECONDS_PER_ITEM / 60));

  function renderDone(area) {
    const left = st.session ? pending(st.session) : 0;
    const b = budget();
    const s = sessionOf(st.session);
    const label = s ? s.label : 'this lesson';
    let html = '<div class="learn-done">';
    if (st.done) {
      html += `<h2>${st.done} new ${U.plural(st.done, 'item')} met</h2>`
        + '<p>They are in your reviews now. The other direction of each comes up from tomorrow.</p>';
    } else if (!left) {
      html += `<h2>Nothing new in ${label}</h2><p>Every item has been introduced.</p>`;
    } else {
      html += `<h2>Today’s new items are done</h2><p>You have met ${b.used} new ${U.plural(b.used, 'item')} today, your New/day limit. More can wait for tomorrow.</p>`;
    }
    html += '<div class="learn-acts">';
    if (left && (st.over || b.left > 0)) {
      html += `<button class="learn-btn primary" data-action="learn-more">Learn ${Math.min(BATCH, st.over ? left : Math.min(left, b.left))} more</button>`;
    } else if (left) {
      html += `<button class="learn-btn" data-action="learn-more-over">Learn ${Math.min(BATCH, left)} more anyway</button>`;
    }
    html += '<button class="learn-btn" data-action="learn-exit">Done</button></div>';
    if (left) html += `<p class="learn-left">${left} ${U.plural(left, 'item')} in ${label} still to learn.</p>`;
    area.innerHTML = html + '</div>';
  }

  function render() {
    const area = $('card-area');
    if (!area) return;
    if (!st.session) { st.session = nextSession(); fillBatch(); }
    const item = st.batch[st.i];
    if (st.phase === 'done' || !item) {
      st.phase = 'done';
      renderDone(area);
    } else if (st.phase === 'present') {
      area.innerHTML = presentHTML(item, { sessionId: st.session, count: `${st.i + 1} of ${st.batch.length}` });
    } else {
      area.innerHTML = checkCardHTML(item, st.session);
    }
    const s = sessionOf(st.session);
    const cc = $('card-count');
    if (cc) cc.innerHTML = `<strong>Learn</strong> &middot; ${s ? s.label : ''}${st.batch.length ? ` &middot; ${Math.min(st.i + (st.phase === 'done' ? 0 : 1), st.batch.length)} of ${st.batch.length}` : ''}`;
    const np = $('nav-pos');
    if (np) np.textContent = '';
    for (const id of ['prev-btn', 'next-btn']) { const b = $(id); if (b) b.disabled = true; }
    const sb = $('scope-bar');
    if (sb) sb.innerHTML = '';
    if (F.audio && S.flipped) F.audio.maybeSpeak();
  }

  function renderScoreRow() {
    const row = $('score-row');
    if (!row) return;
    row.innerHTML = st.phase === 'done' ? '' : stepButtonsHTML(st.phase);
  }

  function advance() {
    if (st.phase === 'present') { st.phase = 'check'; S.flipped = false; F.app.render(); }
  }
  function grade(rating) {
    const item = st.batch[st.i];
    if (!item || st.phase !== 'check') return;
    if (!S.flipped) { F.app.flip(); return; }
    st.lastRec = complete(item.id, rating >= 3 ? 3 : 1);
    st.done++;
    st.i++;
    st.phase = st.i < st.batch.length ? 'present' : 'done';
    S.flipped = false;
    F.app.render();
  }

  F.views.register('learn', {
    label: 'Learn',
    order: 15,
    tab: false,
    navAs: 'cards',
    hideActions: true,
    enter() { if (!st.batch.length && st.phase !== 'done') { st.session = st.session || nextSession(); fillBatch(); } },
    render,
    renderScoreRow,
    syncChrome() {
      for (const id of ['mastered-btn', 'newlimit-btn']) { const b = $(id); if (b) b.hidden = true; }
      const row = $('score-row');
      if (row) row.style.display = '';
    },
    shortcutsHTML() {
      return '<span><kbd>Space</kbd> next / show answer &nbsp; <kbd>1</kbd> not yet &nbsp; <kbd>3</kbd> got it</span>';
    },
    speech() {
      const item = st.batch[st.i];
      return item ? { text: item.fa, token: 'learn|' + item.id + '|' + st.phase } : null;
    },
    keydown(e) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        // app.js has already toggled the flip; in the presentation that means "next".
        if (st.phase === 'present') { S.flipped = false; advance(); }
        return;
      }
      if (e.key === 'Enter' && st.phase === 'present') advance();
      if (e.key === '1' || e.key === '2') grade(1);
      if (e.key === '3' || e.key === '4') grade(3);
    },
  });

  if (F.actions) {
    F.actions.register('learn-start', el => start(el.dataset.arg || null));
    F.actions.register('learn-next', () => {
      if (F.state.tab === 'learn') advance();
      else if (F.study && F.study.learnNext) F.study.learnNext();
    });
    F.actions.register('learn-grade', el => {
      const g = Number(el.dataset.arg);
      if (F.state.tab === 'learn') grade(g);
      else if (F.study && F.study.learnGrade) F.study.learnGrade(g);
    });
    F.actions.register('learn-start-over', el => start(el.dataset.arg || null, { over: true }));
    F.actions.register('learn-more', () => { fillBatch(); F.app.render(); });
    F.actions.register('learn-more-over', () => { st.over = true; fillBatch(); F.app.render(); });
    F.actions.register('learn-exit', () => {
      const home = F.views.get('today') ? 'today' : 'cards';
      if (F.study && F.study.rebuildQueue) F.study.rebuildQueue();
      F.app.setView(home);
    });
  }

  F.learn = {
    BATCH, LEARNABLE, state: st,
    pending, pendingItems, nextSession, start, budget,
    isLearnableItem, isIntroduced, needsIntro, introducedToday, introducedBefore,
    checkCard, complete, undo, startOfToday,
    presentHTML, checkFaces, checkCardHTML, stepButtonsHTML, exampleHTML, tagText, minutes,
  };
})(typeof window !== 'undefined' ? window : globalThis);
