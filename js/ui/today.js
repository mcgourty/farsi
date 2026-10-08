// ui/today.js: the Today page (view 'today', the view the app opens on).
// One intentional sequence, top to bottom (section order numbers):
//   10 new lesson (learn mode)   20 reviews due   30 verb drill (drill.js)
//   40 read a story (reader.js)  50 lesson notes (notes.js)   90 progress
// Features add their sections:
//
//   F.today.registerSection({
//     id: 'verb-drill',            // unique
//     order: 30,                   // see the list above
//     visible() { return true; },  // optional
//     html() { return '...'; },    // either html() -> string ...
//     render(el) { ... },          // ... or render(el) filling the <section>
//     lead: false,                 // optional: the tinted lead style
//   });
//
// Markup helpers for sections: F.today.rowHTML(label, value), and the classes
// .t-card (the section box, added for you), .t-k (small label), .t-big,
// .t-sub, .t-row, .t-acts, .btn-primary, .btn-secondary, .btn-link.
// Buttons use data-action; F.today.render() redraws if Today is showing.
(function (root) {
  'use strict';
  const F = root.F;
  const U = F.util;
  const $ = id => document.getElementById(id);
  const nf = n => Number(n || 0).toLocaleString();
  const esc = s => U.esc(s);

  const sections = [];
  function registerSection(def) {
    if (!def || !def.id) throw new Error('today section: id required');
    if (sections.some(s => s.id === def.id)) throw new Error(`today section ${def.id} already registered`);
    sections.push(Object.assign({ order: 50 }, def));
    sections.sort((a, b) => a.order - b.order);
    if (F.app && F.state.tab === 'today') F.app.render();
  }

  // Sessions the "Reviews due" button studies. The new-lesson button narrows
  // the study filter to one lesson; remember what it was so reviews go back
  // to the full selection.
  let prevSessions = null;

  // What the study queue ('Due & new') would hold for these sessions under
  // the current type/direction/new-per-day settings.
  function queueEstimate(sessions) {
    const T = F.study;
    const st = T.state;
    const now = Date.now();
    const f = { sessions, types: st.types, direction: st.direction };
    let due = 0, nextDue = Infinity;
    const freshBy = { fa: 0, en: 0 };
    let freshTotal = 0, total = 0;
    for (const c of F.cards.all) {
      if (!F.cards.matchesFilters(c, f) || F.store.isBuried(c.id)) continue;
      const s = F.store.srs(c.id);
      if (st.hideMastered && T.isMastered(c)) continue;
      total++;
      if (!s) { freshBy[F.cards.newBucket(c)]++; freshTotal++; }
      else if (s.due <= now) due++;
      else if (s.due < nextDue) nextDue = s.due;
    }
    const allow = b => Math.max(0, st.newPerDay - F.store.newToday(b));
    const fresh = Math.min(freshBy.fa, allow('fa')) + Math.min(freshBy.en, allow('en'));
    return { due, fresh, freshTotal, total, nextDue: nextDue === Infinity ? null : nextDue };
  }

  function minutes(est) { return F.progress.fmtMinutes(F.progress.estimateSec(est.due, est.fresh)); }
  function countLine(est) {
    const parts = [];
    if (est.due) parts.push(`${nf(est.due)} ${U.plural(est.due, 'review')}`);
    if (est.fresh) parts.push(`${nf(est.fresh)} new`);
    return parts.join(' + ');
  }

  // ---------- Built-in sections ----------
  function lessonTitle(s) {
    const l = s.lesson || {};
    return l.title ? `${esc(s.label)} &middot; ${faRuns(esc(l.title))}` : esc(s.label);
  }

  // Persian runs inside English metadata (lesson summaries) are isolated so
  // "برداشتن / گذاشتن" keeps its order inside a left-to-right line.
  const faRuns = html => html.replace(/[\u0600-\u06FF\u200C]+(?:[ \u200C][\u0600-\u06FF\u200C]+)*/g,
    r => `<bdi class="fa" lang="fa" dir="rtl">${r}</bdi>`);

  // The lead: the newest lesson that still has items to learn (learn mode),
  // or the newest lesson when everything in it has been met.
  registerSection({
    id: 'new-lesson',
    order: 10,
    lead: true,
    visible: () => !!F.cards.newestLesson(),
    html() {
      const L = F.learn;
      const learnId = L && L.nextSession ? L.nextSession() : null;
      const s = (learnId && F.cards.sessions.find(x => x.id === learnId)) || F.cards.newestLesson();
      const l = s.lesson || {};
      const items = (l.items || []).length;
      const head = `<div class="t-k">${learnId ? 'New lesson' : 'Newest lesson'}</div>`
        + `<div class="t-big">${lessonTitle(s)}</div>`
        + (l.summary ? `<div class="t-sub">${faRuns(esc(l.summary))}</div>` : '');
      if (L && learnId) {
        const n = L.pending(s.id);
        const b = L.budget();
        const sitting = Math.min(L.BATCH, n, b.left > 0 ? b.left : L.BATCH);
        if (b.left > 0) {
          return head + `<div class="t-meta">${nf(n)} of ${nf(items)} ${U.plural(items, 'item')} to learn &middot; ${nf(sitting)} at a time, about ${nf(L.minutes(sitting))} min</div>`
            + `<div class="t-acts"><button type="button" class="btn-primary" data-action="learn-start" data-arg="${U.escAttr(s.id)}">Start learning</button></div>`;
        }
        return head + `<div class="t-meta">${nf(n)} of ${nf(items)} ${U.plural(items, 'item')} to learn &middot; today’s ${nf(b.limit)} new items are done</div>`
          + `<div class="t-acts"><button type="button" class="btn-secondary" data-action="learn-start-over" data-arg="${U.escAttr(s.id)}">Learn ${nf(Math.min(L.BATCH, n))} more anyway</button></div>`;
      }
      const est = queueEstimate(new Set([s.id]));
      const meta = `${nf(items)} ${U.plural(items, 'item')}${L ? ', all met' : ` &middot; ${nf(est.freshTotal)} of ${nf(est.total)} cards not started`}`;
      if (est.due + est.fresh) {
        return head + `<div class="t-meta">${meta}</div>`
          + `<div class="t-acts"><button type="button" class="btn-primary" data-action="today-lesson" data-arg="${U.escAttr(s.id)}">Study this lesson</button>`
          + `<span class="t-est">${countLine(est)} &middot; &asymp; ${minutes(est)}</span></div>`;
      }
      return head + `<div class="t-meta">${meta}</div>`
        + '<div class="t-acts"><span class="t-est">Nothing due in this lesson today.</span>'
        + `<button type="button" class="btn-secondary" data-action="today-lesson-all" data-arg="${U.escAttr(s.id)}">Go through all its cards</button></div>`;
    },
  });

  registerSection({
    id: 'reviews',
    order: 20,
    visible: () => !!F.study,
    html() {
      const st = F.study.state;
      const sel = prevSessions || st.sessions;
      const est = queueEstimate(sel);
      const all = F.cards.sessions.length;
      const narrowed = sel.size < all;
      let h = '<div class="t-row"><span class="t-row-label">Reviews due</span>'
        + `<span class="t-row-val">${nf(est.due)}${est.fresh ? ` <span class="t-plus">+ ${nf(est.fresh)} new</span>` : ''}</span></div>`;
      if (est.due + est.fresh) {
        h += `<div class="t-sub">About ${minutes(est)}`
          + (F.progress.rates().calibrated ? ', from your own pace.' : ' (8 s a review, 20 s a new card).') + '</div>'
          + `<div class="t-acts"><button type="button" class="btn-secondary" data-action="today-reviews">${est.due ? 'Start reviews' : 'Study new cards'}</button></div>`;
      } else {
        const next = est.nextDue ? ` Next review in ${F.fsrs.fmtIvl(est.nextDue - Date.now())}.` : '';
        h += `<div class="t-sub">All caught up.${next}</div>`;
      }
      if (narrowed) {
        h += `<div class="t-note">Counting ${nf(sel.size)} of ${nf(all)} sessions. `
          + '<button type="button" class="btn-link" data-action="today-all-sessions">Include all sessions</button></div>';
      }
      return h;
    },
  });

  registerSection({
    id: 'progress',
    order: 90,
    visible: () => !!F.progress,
    html() {
      const t = F.progress.stats().total;
      const sk = F.progress.streakNow();
      return '<div class="t-row"><span class="t-row-label">Words you know</span>'
        + `<span class="t-row-val">${nf(t.known)}</span></div>`
        + F.progress.meterHTML(t, { legend: false })
        + '<div class="t-sub">Known &middot; learning &middot; new'
        + (sk.days > 1 ? ` &middot; ${nf(sk.days)}-day streak` : '') + '</div>'
        + '<div class="t-acts"><button type="button" class="btn-link" data-action="set-view" data-arg="progress">See progress</button></div>';
    },
  });

  // ---------- Page ----------
  function render() {
    const area = $('card-area');
    const now = new Date();
    const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const page = document.createElement('div');
    page.className = 'page today-page';
    page.innerHTML = '<div class="page-head today-head">'
      + `<div><div class="today-date">${esc(date)}</div><h1 class="page-title">Today</h1></div>`
      + '<div class="wordmark-fa" lang="fa" dir="rtl" aria-hidden="true">فارسی</div>'
      + '</div><div class="tile-rule" aria-hidden="true"></div>';
    for (const s of sections) {
      try {
        if (s.visible && !s.visible()) continue;
        const el = document.createElement('section');
        el.className = 't-card' + (s.lead ? ' lead' : '');
        el.dataset.sec = s.id;
        if (s.render) s.render(el); else el.innerHTML = s.html ? s.html() : '';
        if (!el.innerHTML.trim()) continue;
        page.appendChild(el);
      } catch (e) { console.error(`today section ${s.id}`, e); }
    }
    area.innerHTML = '';
    area.appendChild(page);
  }

  // ---------- Actions ----------
  function studySessions(ids, mode) {
    const st = F.study.state;
    if (!prevSessions) prevSessions = new Set(st.sessions);
    st.sessions = new Set(ids);
    st.mode = mode || 'due';
    F.study.rebuildQueue();
    F.app.setView('cards');
  }
  const A = F.actions;
  A.register('today-lesson', el => studySessions([el.dataset.arg], 'due'));
  A.register('today-lesson-all', el => studySessions([el.dataset.arg], 'all'));
  A.register('today-reviews', () => {
    const st = F.study.state;
    if (prevSessions) { st.sessions = prevSessions; prevSessions = null; }
    if (st.mode !== 'due') st.mode = 'due';
    F.study.rebuildQueue();
    F.app.setView('cards');
  });
  A.register('today-all-sessions', () => {
    F.study.state.sessions = new Set(F.cards.sessions.map(s => s.id));
    prevSessions = null;
    F.study.rebuildQueue();
    F.app.render();
  });

  F.today = {
    registerSection, render, queueEstimate,
    rowHTML: (label, value) => `<div class="t-row"><span class="t-row-label">${label}</span><span class="t-row-val">${value}</span></div>`,
    sections: () => sections.slice(),
  };

  F.views.register('today', {
    label: 'Today',
    order: 5,
    page: true,
    render,
    // Coming back to Today after studying shows fresh counts.
    enter() { if (F.progress) F.progress.invalidate(); },
  });
})(window);
