// ui/progress.js: honest progress. Pure computations (F.progress.*, no DOM at
// load, so tools/test.js can load this file in node), the 'progress' page
// view, and the one study meter (known · learning · new) drawn above the card.
//
// Definitions (also stated in the UI):
//   known card    in review and FSRS stability >= 21 days (F.fsrs.MATURE_DAYS)
//   known word    every card of the item is known (both directions for a
//                 word with two, the single card for a letter)
//   learning      some card of the item has been reviewed, not all known
//   new           no card of the item has been reviewed
//   streak        consecutive days ending today (or yesterday) in which no
//                 7-day window has more than 2 days without reviews
(function (root) {
  'use strict';
  const F = root.F = root.F || {};
  const DAY = 86400000;
  const FREEZES_PER_WEEK = 2;
  const DEFAULT_REVIEW_SEC = 8;
  const DEFAULT_NEW_SEC = 20;

  // ---------- Pure computations ----------
  function matureDays() { return (F.fsrs && F.fsrs.MATURE_DAYS) || 21; }
  function cardKnown(s) { return !!s && s.state === 'review' && s.s >= matureDays(); }

  // cards: F.cards.all; srsOf(cardId) -> state. Returns per-session and total
  // item counts {known, learning, new, total, oneWay, cards, cardsKnown}.
  function itemStats(cards, srsOf) {
    const items = new Map();   // itemId -> {session, n, known, seen}
    for (const c of cards) {
      let it = items.get(c.itemId);
      if (!it) items.set(c.itemId, it = { session: c.session, n: 0, known: 0, seen: 0 });
      const s = srsOf(c.id);
      it.n++;
      if (s) it.seen++;
      if (cardKnown(s)) it.known++;
    }
    const empty = () => ({ known: 0, learning: 0, new: 0, total: 0, oneWay: 0, cards: 0, cardsKnown: 0 });
    const bySession = new Map();
    const total = empty();
    for (const it of items.values()) {
      let e = bySession.get(it.session);
      if (!e) bySession.set(it.session, e = empty());
      for (const t of [e, total]) {
        t.total++;
        t.cards += it.n;
        t.cardsKnown += it.known;
        if (it.known === it.n) t.known++;
        else if (it.seen) { t.learning++; if (it.known) t.oneWay++; }
        else t.new++;
      }
    }
    return { bySession, total };
  }

  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

  // Cards due on each of the next `days` local days. Day 0 includes anything
  // overdue. Buried cards are left out (they never come up).
  function forecast(cards, srsOf, isBuried, now, days) {
    days = days || 7;
    const ends = [];
    const sod = startOfDay(now);
    for (let i = 0; i < days; i++) ends.push(addDays(sod, i + 1));
    const out = ends.map((end, i) => ({ i, date: addDays(sod, i), n: 0 }));
    let overdue = 0;
    for (const c of cards) {
      const s = srsOf(c.id);
      if (!s || (isBuried && isBuried(c.id))) continue;
      if (s.due >= ends[days - 1]) continue;
      if (s.due <= now) overdue++;
      for (let i = 0; i < days; i++) if (s.due < ends[i]) { out[i].n++; break; }
    }
    out.overdue = overdue;
    return out;
  }

  // Reviews per local day for the last `days` days, oldest first.
  function dailyReviews(revLog, days, now) {
    const out = [];
    const sod = startOfDay(now || Date.now());
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(addDays(sod, -i));
      out.push({ date: d.getTime(), key: F.util.dayKey(d), n: (revLog && revLog[F.util.dayKey(d)]) || 0 });
    }
    return out;
  }

  // Streak with rest days: walking back from today, a day without reviews is
  // a rest day unless it would make 3 in any 7-day window. Today never counts
  // against you while it is still going. Returns {days, studied, rest,
  // restThisWeek, today}.
  function streak(revLog, now, freezes) {
    freezes = freezes == null ? FREEZES_PER_WEEK : freezes;
    const sod = startOfDay(now || Date.now());
    const has = i => !!(revLog && revLog[F.util.dayKey(new Date(addDays(sod, -i)))]);
    const today = has(0);
    const missed = [];   // offsets of rest days
    let studied = 0, earliest = -1;
    for (let i = today ? 0 : 1; i < 800; i++) {
      if (has(i)) { studied++; earliest = i; continue; }
      const inWindow = missed.filter(m => i - m < 7).length;
      if (inWindow + 1 > freezes) break;
      missed.push(i);
    }
    if (!studied) return { days: 0, studied: 0, rest: 0, restThisWeek: 0, today };
    const start = today ? 0 : 1;
    const rest = missed.filter(m => m < earliest).length;
    const restThisWeek = missed.filter(m => m < earliest && m < 7).length;
    return { days: earliest - start + 1, studied, rest, restThisWeek, today };
  }

  // Seconds per review and per new card, from logged durations when there
  // are enough of them (20+), else 8 s and 20 s. A new card is seen about
  // three times on its first day, so it costs its first look plus two reviews.
  function median(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  const timing = { review: [], fresh: [] };
  function addTiming(r) {
    if (!r || !(r.durationMs > 500) || r.durationMs > 120000) return;   // idle, not studying
    (r.stateBefore === 'new' ? timing.fresh : timing.review).push(Math.min(r.durationMs, 60000) / 1000);
  }
  function rates() {
    const calibrated = timing.review.length >= 20;
    const review = calibrated ? Math.min(30, Math.max(3, median(timing.review))) : DEFAULT_REVIEW_SEC;
    let fresh = DEFAULT_NEW_SEC;
    if (calibrated && timing.fresh.length >= 10) fresh = Math.min(60, Math.max(10, median(timing.fresh) + 2 * review));
    return { review, fresh, calibrated, samples: timing.review.length };
  }
  function estimateSec(due, fresh) { const r = rates(); return due * r.review + fresh * r.fresh; }
  function fmtMinutes(sec) {
    if (sec <= 0) return '0 min';
    if (sec < 60) return '< 1 min';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  // ---------- Cache ----------
  let version = 0;
  const cache = {};
  function cached(name, fn) {
    const key = version + '|' + F.util.todayKey();
    if (cache[name] && cache[name].key === key) return cache[name].value;
    const value = fn();
    cache[name] = { key, value };
    return value;
  }
  function invalidate() { version++; }

  const srsOf = id => F.store.srs(id);
  const isBuried = id => F.store.isBuried(id);
  function stats() { return cached('items', () => itemStats(F.cards.all, srsOf)); }
  function weekForecast() { return cached('forecast', () => forecast(F.cards.all, srsOf, isBuried, Date.now(), 7)); }

  // ---------- Markup helpers (shared with Today) ----------
  const esc = s => F.util.esc(s);
  const nf = n => Number(n || 0).toLocaleString();

  // counts: {known, learning, new}. One bar, three segments.
  function meterHTML(c, opts) {
    opts = opts || {};
    const total = (c.known || 0) + (c.learning || 0) + (c.new || 0);
    const w = n => (total ? (n / total) * 100 : 0);
    const segs = [['known', c.known], ['learning', c.learning], ['new', c.new]]
      .filter(x => x[1]).map(([k, n]) => `<i class="m-seg m-${k}" style="width:${w(n)}%"></i>`).join('');
    const unit = opts.unit ? ' ' + opts.unit : '';
    const legend = opts.legend === false ? '' : '<div class="m-legend">'
      + `<span><i class="m-dot m-known"></i>Known <b>${nf(c.known)}</b></span>`
      + `<span><i class="m-dot m-learning"></i>Learning <b>${nf(c.learning)}</b></span>`
      + `<span><i class="m-dot m-new"></i>New <b>${nf(c.new)}</b>${esc(unit)}</span></div>`;
    const label = `${nf(c.known)} known, ${nf(c.learning)} learning, ${nf(c.new)} new${unit}`;
    return `<div class="meter-bar" role="img" aria-label="${F.util.escAttr(label)}">${segs}</div>${legend}`;
  }

  function topRoundedBar(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  const dayName = ts => new Date(ts).toLocaleDateString(undefined, { weekday: 'short' });
  const dateLabel = ts => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  function forecastSVG(fc) {
    const W = 336, H = 168, top = 22, base = 136, gap = 10;
    const max = Math.max(1, ...fc.map(d => d.n));
    const bw = (W - gap * (fc.length - 1)) / fc.length;
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews due over the next 7 days">`;
    out += `<line class="axis" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    fc.forEach((d, i) => {
      const x = i * (bw + gap);
      const h = d.n ? Math.max(2, (d.n / max) * (base - top)) : 0;
      const name = i === 0 ? 'Today' : dayName(d.date);
      const title = `${dateLabel(d.date)}: ${d.n} due` + (i === 0 && fc.overdue ? ` (${fc.overdue} overdue)` : '');
      out += `<g><title>${esc(title)}</title>`
        + `<rect class="hit" x="${x}" y="0" width="${bw}" height="${H}"/>`
        + (h ? `<path class="bar${i === 0 ? ' bar-now' : ''}" d="${topRoundedBar(x, base - h, bw, h, 4)}"/>` : '')
        + `<text class="val" x="${x + bw / 2}" y="${base - h - 6}" text-anchor="middle">${nf(d.n)}</text>`
        + `<text class="lbl" x="${x + bw / 2}" y="${base + 20}" text-anchor="middle">${esc(name)}</text></g>`;
    });
    return out + '</svg>';
  }

  function historySVG(days) {
    const W = 336, H = 132, top = 20, base = 104, gap = 2;
    const max = Math.max(1, ...days.map(d => d.n));
    const bw = (W - gap * (days.length - 1)) / days.length;
    const maxIdx = days.reduce((m, d, i) => (d.n > days[m].n ? i : m), 0);
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews per day over the last 30 days">`;
    out += `<line class="axis" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    days.forEach((d, i) => {
      const x = i * (bw + gap);
      const h = d.n ? Math.max(2, (d.n / max) * (base - top)) : 0;
      const last = i === days.length - 1;
      out += `<g><title>${esc(dateLabel(d.date))}: ${nf(d.n)} ${d.n === 1 ? 'review' : 'reviews'}</title>`
        + `<rect class="hit" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${H}"/>`
        + (h ? `<path class="bar${last ? ' bar-now' : ''}" d="${topRoundedBar(x, base - h, bw, h, 2)}"/>` : '');
      // Label the busiest day and today only; every bar has a hover title.
      if (d.n && (i === maxIdx || last)) {
        const anchor = last ? 'end' : (i < 3 ? 'start' : 'middle');
        const tx = last ? x + bw : (i < 3 ? x : x + bw / 2);
        out += `<text class="val" x="${tx}" y="${base - h - 6}" text-anchor="${anchor}">${nf(d.n)}</text>`;
      }
      out += '</g>';
    });
    out += `<text class="lbl" x="0" y="${base + 20}" text-anchor="start">${esc(new Date(days[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</text>`;
    out += `<text class="lbl" x="${W}" y="${base + 20}" text-anchor="end">Today</text>`;
    return out + '</svg>';
  }

  function streakHTML(s) {
    if (!s.days) return '<p class="p-note">No streak yet. Any day with a review starts one.</p>';
    return `<p class="p-streak"><b>${nf(s.days)}-day streak</b> &middot; ${nf(s.studied)} ${s.studied === 1 ? 'day' : 'days'} studied`
      + (s.rest ? `, ${nf(s.rest)} rest ${s.rest === 1 ? 'day' : 'days'}` : '') + '</p>'
      + `<p class="p-note">Up to ${FREEZES_PER_WEEK} rest days in any 7 don't break it.`
      + (s.today ? '' : ' Today counts once you review a card.') + '</p>';
  }

  // ---------- The page ----------
  function renderPage() {
    const st = stats();
    const t = st.total;
    const fc = weekForecast();
    const hist = dailyReviews(F.store.data.revLog, 30);
    const histTotal = hist.reduce((a, d) => a + d.n, 0);
    const histDays = hist.filter(d => d.n).length;
    const sk = streak(F.store.data.revLog, Date.now());
    const weekTotal = fc.reduce((a, d) => a + d.n, 0);

    const rows = F.cards.sessions.map(s => {
      const e = st.bySession.get(s.id);
      if (!e || !e.total) return '';
      const pct = Math.round((e.known / e.total) * 100);
      return '<li class="p-row">'
        + `<div class="p-row-head"><span class="p-row-name">${esc(s.label)}</span>`
        + `<span class="p-row-n"><b>${nf(e.known)}</b> / ${nf(e.total)} known &middot; ${pct}%</span></div>`
        + meterHTML(e, { legend: false })
        + '</li>';
    }).join('');

    const html = '<div class="page progress-page">'
      + '<div class="page-head"><h1 class="page-title">Progress</h1></div>'
      + '<section class="p-card">'
      + `<div class="big-stats"><div><b>${nf(t.known)}</b><span>words you know</span></div>`
      + `<div><b>${nf(t.learning)}</b><span>learning</span></div>`
      + `<div><b>${nf(t.new)}</b><span>not started</span></div></div>`
      + meterHTML(t, { legend: false })
      + '<p class="p-note">A word counts as known when every card for it (both directions, where it has two) '
      + `is stable for at least ${matureDays()} days: you'd still recall it 9 times in 10 after three weeks away.`
      + (t.oneWay ? ` ${nf(t.oneWay)} more ${t.oneWay === 1 ? 'word is' : 'words are'} known one way only and count as learning.` : '')
      + ` Verb forms and letters count as words too.</p>`
      + '</section>'

      + '<section class="p-sec"><h2 class="sec-h">Next 7 days</h2>'
      + `<p class="p-note">${nf(weekTotal)} ${weekTotal === 1 ? 'review' : 'reviews'} due this week`
      + (fc.overdue ? `, including ${nf(fc.overdue)} overdue today` : '') + '. New cards are not included.</p>'
      + forecastSVG(fc) + '</section>'

      + '<section class="p-sec"><h2 class="sec-h">Last 30 days</h2>'
      + `<p class="p-note">${nf(histTotal)} ${histTotal === 1 ? 'review' : 'reviews'} on ${histDays} ${histDays === 1 ? 'day' : 'days'}`
      + (histDays ? `, about ${nf(Math.round(histTotal / histDays))} a day when you studied` : '') + '.</p>'
      + historySVG(hist) + streakHTML(sk) + '</section>'

      + '<section class="p-sec"><h2 class="sec-h">By lesson</h2>'
      + `<ul class="p-rows">${rows}</ul></section>`
      + '</div>';
    document.getElementById('card-area').innerHTML = html;
  }

  // ---------- Public API ----------
  F.progress = {
    FREEZES_PER_WEEK, DEFAULT_REVIEW_SEC, DEFAULT_NEW_SEC,
    cardKnown, itemStats, forecast, dailyReviews, streak, median,
    addTiming, rates, estimateSec, fmtMinutes,
    stats, weekForecast, invalidate, meterHTML,
    streakNow: () => streak(F.store.data.revLog, Date.now()),
  };

  if (typeof document === 'undefined' || !F.views) return;

  F.views.register('progress', {
    label: 'Progress',
    order: 40,
    page: true,
    render: renderPage,
  });

  // The one meter above a study card: known · learning · new cards under the
  // current filters. It replaces the old progress bar and scope track.
  F.hooks.on('render', ({ view }) => {
    if (view !== 'cards' || !F.study || !F.study.scopeStateCounts) return;
    const el = document.getElementById('meter-row');
    if (!el) return;
    const c = F.study.scopeStateCounts();
    if (!c.total) return;
    el.innerHTML = meterHTML({ known: c.mature, learning: c.young + c.learning, new: c.new }, { unit: 'cards' });
  });

  for (const ev of ['boot', 'card:graded', 'card:buried', 'card:unburied', 'progress:reset']) F.hooks.on(ev, invalidate);
  F.hooks.on('card:graded', p => addTiming(p && p.review));
  F.hooks.on('boot', () => {
    F.store.reviews.all().then(all => {
      timing.review.length = 0; timing.fresh.length = 0;
      for (const r of all) addTiming(r);
      F.hooks.emit('progress:timing', rates());
      const v = F.app.view();
      if (v && v.name === 'today') F.app.render();
    }).catch(() => {});
  });
})(typeof window !== 'undefined' ? window : globalThis);
