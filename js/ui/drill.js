// ui/drill.js: the verb trainer view ("verbs").
//
//   sets   short mixed sets: 10 prompts that interleave verbs, tenses and
//          persons, weighted toward forms you miss and verbs from the newest
//          lessons (F.verbs.buildSet), then a summary.
//   focus  "Practice one verb": the whole paradigm of one verb in order, a
//          blocked warm-up for a new verb.
//   browse conjugation tables.
//
// Answers are typed (pinglish) and self-graded; scores stay per
// verb|tense|person in store.drill. The view's settings live in #drill-panel
// (built here). It also owns the "All verb forms" setting for the verb
// flashcard deck (F.verbs.config.allForms).
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const V = F.verbs;
  const U = F.util;
  const $ = id => document.getElementById(id);
  const SET_SIZE = 10;
  const RECENT_LESSONS = 3;

  const st = {
    mode: 'sets',            // 'sets' | 'focus' | 'browse'
    tenses: new Set(V.TENSES.map(t => t.id)),
    persons: new Set([0, 1, 2, 3, 4, 5]),
    scope: 'recent',         // 'recent' | 'all' | 'custom'
    verbs: new Set(V.VERBS.map(v => v.id)),   // the custom choice
    focus: null,             // verb id for focus mode
    search: '',
    vIdx: 0,
    browseIds: null,         // shuffled browse order
    set: null,               // {kind, prompts, idx, results: [{d, known, typed}]}
    confirmReset: false,
  };

  const scores = () => F.store.data.drill;

  // ---------- F.typed, called defensively (typed.js is shared) ----------
  const T = () => F.typed || {};
  function typedReset() { if (typeof T().reset === 'function') T().reset(); else { S.typedResult = null; S.typedValue = ''; } }
  function typedInputHTML(hint) {
    if (typeof T().inputHTML === 'function') return T().inputHTML(hint);
    return `<input id="typed-input" class="typed-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${U.escAttr(hint)}">`;
  }
  function typedBannerHTML() { return typeof T().bannerHTML === 'function' ? T().bannerHTML() : ''; }
  function typedFocus() { if (typeof T().focusInput === 'function') T().focusInput(); }

  // ---------- Which verbs and prompts ----------
  function recentIds() { return V.recentVerbIds(RECENT_LESSONS); }
  function scopeIds() {
    if (st.scope === 'all') return V.VERBS.map(v => v.id);
    if (st.scope === 'custom') return V.VERBS.filter(v => st.verbs.has(v.id)).map(v => v.id);
    return recentIds();
  }
  function scopeVerbs() { const ids = new Set(scopeIds()); return V.VERBS.filter(v => ids.has(v.id)); }
  function focusVerb() {
    let v = st.focus && V.byId(st.focus);
    if (!v) { v = V.byId(recentIds().slice(-1)[0]) || V.VERBS[0]; st.focus = v.id; }
    return v;
  }

  function promptsFor(verbs) {
    const out = [];
    for (const v of verbs) {
      // imperatives only exist for 'to' (pi 1) and 'shomā' (pi 4)
      for (const d of V.formsOf(v, st.tenses)) if (st.persons.has(d.pi)) out.push(d);
    }
    return out;
  }
  function allDrillCombos() { return st.mode === 'focus' ? promptsFor([focusVerb()]) : promptsFor(scopeVerbs()); }

  function browseList() {
    const selected = scopeVerbs();
    if (!S.shuffled) return selected;
    const sel = new Set(selected.map(v => v.id));
    if (!st.browseIds || st.browseIds.some(id => !sel.has(id)) || selected.some(v => !st.browseIds.includes(v.id))) {
      st.browseIds = U.shuffle(selected.map(v => v.id));
    }
    return st.browseIds.map(id => V.byId(id)).filter(Boolean);
  }

  // ---------- Sets ----------
  function newSet(prompts, kind) {
    st.set = { kind, prompts, idx: 0, results: [] };
    st.confirmReset = false;
    S.flipped = false;
    typedReset();
  }
  function startSet() {
    if (st.mode === 'focus') {
      newSet(allDrillCombos(), 'focus');
    } else {
      const combos = allDrillCombos();
      const prompts = S.shuffled
        ? U.shuffle(combos.slice()).slice(0, SET_SIZE)
        : V.buildSet({ combos, scores: scores(), recent: new Set(recentIds()), size: SET_SIZE });
      newSet(prompts, 'mixed');
    }
  }
  function retryMissed() {
    const missed = st.set ? st.set.results.filter(r => !r.known).map(r => r.d) : [];
    if (!missed.length) { startSet(); return; }
    newSet(missed, 'retry');
  }
  const current = () => (st.set && st.set.idx < st.set.prompts.length ? st.set.prompts[st.set.idx] : null);
  const setDone = () => !!st.set && st.set.idx >= st.set.prompts.length;

  // ---------- Rendering helpers ----------
  function conjCell(f) {
    return f
      ? `<span class="fa" lang="fa" dir="rtl">${f.fa}</span><span class="pin">${f.pin}</span>`
      : '<span class="pin" style="opacity:.3">—</span>';
  }
  function conjTableHTML(v) {
    let rows = '';
    for (let i = 0; i < 6; i++) {
      rows += `<tr><td class="person">${V.PERSONS[i].pin}</td><td>${conjCell(V.conj(v, 'present', i))}</td><td>${conjCell(V.conj(v, 'negative', i))}</td><td>${conjCell(V.conj(v, 'continuous', i))}</td></tr>`;
    }
    return `<table class="conj-table"><thead><tr><th></th><th>Present</th><th>Negative</th><th>Right now</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function pastTableHTML(v) {
    let rows = '';
    for (let i = 0; i < 6; i++) {
      rows += `<tr><td class="person">${V.PERSONS[i].pin}</td><td>${conjCell(V.conj(v, 'past', i))}</td><td>${conjCell(V.conj(v, 'pastneg', i))}</td></tr>`;
    }
    const ps = V.pastStem(v);
    return `<table class="conj-table" style="margin-top:14px"><thead><tr><th>past stem: ${ps.pin}</th><th>Past</th><th>Neg. past</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function impHTML(v) {
    if (!v.imp) return '';
    return `<div class="conj-imp">Do it! <strong>${v.imp.sg}</strong> <span class="fa-inline" lang="fa" dir="rtl">${v.imp.sgFa}</span> &middot; <strong>${v.imp.pl}</strong> <span class="fa-inline" lang="fa" dir="rtl">${v.imp.plFa}</span><br>Don't! <strong>${v.imp.negSg}</strong> <span class="fa-inline" lang="fa" dir="rtl">${v.imp.negSgFa}</span> &middot; <strong>${v.imp.negPl}</strong> <span class="fa-inline" lang="fa" dir="rtl">${v.imp.negPlFa}</span></div>`;
  }
  function stats(count, pct, text) {
    $('card-count').innerHTML = count;
    $('progress-fill').style.width = pct + '%';
    $('progress-text').textContent = text;
  }
  function nav(pos, prevOn, nextOn) {
    $('nav-pos').textContent = pos;
    $('prev-btn').disabled = !prevOn;
    $('next-btn').disabled = !nextOn;
  }

  // ---------- Browse ----------
  function renderBrowse() {
    const area = $('card-area');
    const list = browseList();
    if (!list.length) {
      area.innerHTML = '<div class="empty-state"><h2>No verbs selected</h2><p>Pick some verbs in the filters</p></div>';
      nav('0 / 0', false, false);
      stats('<strong>0</strong> verbs', 0, '0/0');
      return;
    }
    st.vIdx = Math.max(0, Math.min(st.vIdx, list.length - 1));
    const v = list[st.vIdx];
    area.innerHTML = `<div class="card-wrapper" style="min-height:800px" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card" style="min-height:800px">
    <div class="card-face card-front">
      <span class="card-tag">Verb</span>
      <div class="front-content">
        <div class="farsi-big" lang="fa" dir="rtl">${v.fa}</div>
        <div class="drill-verb-pin">${v.pin}</div>
        <div class="drill-verb-en">${v.en}</div>
      </div>
      <span class="tap-hint">tap for conjugations</span>
    </div>
    <div class="card-face card-back" style="justify-content:flex-start">
      <span class="card-tag">Verb</span>
      <div class="back-content" style="margin-top:16px">
        <div class="pinglish" style="margin-bottom:0">${v.pin} — ${v.en}</div>
        ${conjTableHTML(v)}
        ${pastTableHTML(v)}
        ${impHTML(v)}
        <p class="drill-browse-act"><button type="button" class="action-btn" data-action="drill-focus-verb" data-arg="${v.id}">Practice this verb</button></p>
      </div>
    </div>
  </div></div>`;
    nav(`${st.vIdx + 1} / ${list.length}`, st.vIdx > 0, st.vIdx < list.length - 1);
    stats(`<strong>${list.length}</strong> verbs`, (st.vIdx + 1) / list.length * 100, `${st.vIdx + 1}/${list.length}`);
  }

  // ---------- Drill (sets and focus) ----------
  function setTitle() {
    if (!st.set) return '';
    if (st.set.kind === 'focus') return `Practice one verb: ${V.byId(st.set.prompts[0] ? st.set.prompts[0].v.id : st.focus).pin}`;
    if (st.set.kind === 'retry') return 'Missed forms';
    return 'Mixed set';
  }

  function renderSummary() {
    const s = st.set;
    const right = s.results.filter(r => r.known).length;
    const missed = s.results.filter(r => !r.known);
    const rows = missed.map(r => {
      const a = V.drillAnswer(r.d);
      const t = V.TENSES.find(x => x.id === r.d.tense);
      return `<li><div class="drill-miss-form"><span class="drill-miss-fa" lang="fa" dir="rtl">${a.fa}</span><span class="drill-miss-pin">${a.pin}</span></div>`
        + `<div class="drill-miss-what">${r.d.v.pin} &middot; ${V.personLabel(r.d.tense, r.d.pi)} &middot; ${t.label}`
        + (r.typed ? ` &middot; you typed “${U.esc(r.typed)}”` : '') + '</div></li>';
    }).join('');
    $('card-area').innerHTML = `<section class="drill-summary" aria-live="polite">
      <p class="drill-eyebrow">${setTitle()} done</p>
      <div class="drill-score"><strong>${right}</strong> / ${s.results.length}</div>
      <p class="drill-score-note">${missed.length ? `${missed.length} ${U.plural(missed.length, 'form')} to look at again` : 'Every form right'}</p>
      ${missed.length ? `<h3 class="drill-sub">Forms you missed</h3><ul class="drill-missed">${rows}</ul>` : ''}
      <div class="drill-summary-acts">
        <button type="button" class="drill-primary" data-action="drill-new-set">${s.kind === 'focus' ? 'Go again' : 'Another set'}</button>
        ${missed.length ? '<button type="button" class="action-btn" data-action="drill-retry">Retry missed</button>' : ''}
        ${s.kind === 'focus' ? '<button type="button" class="action-btn" data-action="drill-mode" data-arg="sets">Mixed sets</button>' : ''}
      </div>
    </section>`;
    nav(`${s.prompts.length} / ${s.prompts.length}`, false, false);
    stats(`<strong>${right}</strong> right &middot; <span style="color:var(--red)">${missed.length} missed</span>`, 100, `${s.results.length}/${s.prompts.length}`);
  }

  function renderConfirmReset() {
    const n = allDrillCombos().filter(d => scores()[V.drillKey(d)]).length;
    $('card-area').innerHTML = `<section class="drill-summary">
      <h2 class="drill-sub">Reset drill scores?</h2>
      <p class="drill-score-note">This clears the right/wrong record for ${n} ${U.plural(n, 'form')} of the verbs in the filters. Flashcard progress is not touched.</p>
      <div class="drill-summary-acts">
        <button type="button" class="drill-primary danger" data-action="drill-reset-confirm">Reset scores</button>
        <button type="button" class="action-btn" data-action="drill-reset-cancel">Cancel</button>
      </div>
    </section>`;
    nav('', false, false);
    stats('', 0, '');
  }

  function renderDrill() {
    const area = $('card-area');
    if (st.confirmReset) { renderConfirmReset(); return; }
    if (!st.set) startSet();
    if (setDone() && st.set.results.length) { renderSummary(); return; }
    const d = current();
    if (!d) {
      area.innerHTML = '<div class="empty-state"><h2>Nothing to drill</h2><p>Choose at least one verb, tense and person in the filters</p></div>';
      nav('0 / 0', false, false);
      stats('', 0, '—');
      return;
    }
    const v = d.v;
    const t = V.TENSES.find(x => x.id === d.tense);
    const personLabel = V.personLabel(d.tense, d.pi);
    const ans = V.drillAnswer(d);
    const s = st.set;
    area.innerHTML = `<div class="card-wrapper" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card">
    <div class="card-face card-front" id="card-front">
      <span class="card-tag">${setTitle()}</span>
      <div class="front-content">
        <div class="farsi-big" style="font-size:2.4rem" lang="fa" dir="rtl">${v.fa}</div>
        <div class="drill-verb-pin">${v.pin}</div>
        <div class="drill-verb-en">${v.en}</div>
        <div class="drill-chips">
          <span class="chip person">${personLabel}</span>
          <span class="chip tense">${t.desc}</span>
        </div>
      </div>
      <span class="tap-hint">type it, then Enter &middot; or tap for the answer</span>
    </div>
    <div class="card-face card-back" id="card-back">
      <span class="card-tag">${setTitle()}</span>
      <div class="back-content">
        <div class="farsi-answer" lang="fa" dir="rtl">${ans.fa}</div>
        <div class="pinglish">${ans.pin}</div>
        <div class="meaning" style="font-size:1rem;color:var(--text-dim);font-weight:400">${personLabel} &middot; ${t.desc}</div>
        <div class="breakdown">${V.drillBreakdown(d)}</div>
      </div>
    </div>
  </div></div>`;

    const front = $('card-front');
    const back = $('card-back');
    front.insertAdjacentHTML('beforeend', typedInputHTML('type it in pinglish…'));
    back.insertAdjacentHTML('beforeend', typedBannerHTML());
    if (F.audio && F.audio.ready() && ans.fa) back.insertAdjacentHTML('beforeend', F.audio.buttonHTML());
    F.hooks.emit('card:rendered', { drill: d, front, back, flipped: S.flipped, view: 'verbs' });

    const done = s.results.length;
    const right = s.results.filter(r => r.known).length;
    nav(`${s.idx + 1} / ${s.prompts.length}`, false, false);
    stats(`<strong>${s.prompts.length - s.idx}</strong> left &middot; <strong>${right}</strong> right &middot; <span style="color:var(--red)">${done - right} missed</span>`,
      Math.round(done / s.prompts.length * 100), `${done}/${s.prompts.length}`);
    typedFocus();
    if (S.flipped && F.audio) F.audio.maybeSpeak();
  }

  function renderScoreRow() {
    $('score-row').innerHTML = st.mode !== 'browse' && current() && !st.confirmReset
      ? `<button class="score-btn again${S.typedResult === 'wrong' ? ' suggest' : ''}" data-action="drill-mark" data-arg="0">Again</button>`
        + `<button class="score-btn know${S.typedResult === 'right' ? ' suggest' : ''}" data-action="drill-mark" data-arg="1">Got it</button>`
      : '';
  }

  function markCard(known) {
    const d = current();
    if (st.mode === 'browse' || !d) return;
    if (!S.flipped) { F.app.flip(); return; }
    const k = V.drillKey(d);
    const sc = scores()[k] || { r: 0, w: 0 };
    if (known) sc.r++; else sc.w++;
    scores()[k] = sc;
    F.store.saveSoon();
    st.set.results.push({ d, known, typed: S.typedValue || '' });
    st.set.idx++;
    S.flipped = false;
    typedReset();
    F.hooks.emit('drill:marked', { prompt: d, known });
    if (setDone()) F.hooks.emit('drill:set-done', { kind: st.set.kind, right: st.set.results.filter(r => r.known).length, total: st.set.results.length });
    F.app.render();
  }

  function resetScores() {
    for (const c of allDrillCombos()) delete scores()[V.drillKey(c)];
    F.store.saveSoon();
    st.confirmReset = false;
    startSet();
    F.app.render();
  }

  // ---------- Settings panel (#drill-panel) ----------
  function pillHTML(label, active, action, arg, title) {
    return `<button type="button" class="pill${active ? ' active' : ''}" data-action="${action}"${arg != null ? ` data-arg="${U.escAttr(String(arg))}"` : ''}${title ? ` title="${U.escAttr(title)}"` : ''} aria-pressed="${active}">${U.esc(label)}</button>`;
  }
  function lessonName(id) {
    const l = (F.lessons || []).find(x => x.id === id);
    if (!l) return 'Not in a lesson yet';
    return l.label + (l.title ? ` · ${l.title}` : '');
  }

  function verbListHTML() {
    const q = st.search.trim().toLowerCase();
    const qn = V.normPin(q).trim();
    const match = v => !q || v.pin.toLowerCase().includes(q) || V.normPin(v.pin).includes(qn) || v.en.toLowerCase().includes(q) || v.fa.includes(st.search.trim());
    const focus = st.mode === 'focus';
    const chosen = new Set(focus ? [focusVerb().id] : scopeIds());
    const recent = new Set(recentIds());
    let html = '';
    for (const g of V.verbsByLesson()) {
      const vs = g.verbs.filter(match);
      if (!vs.length) continue;
      html += `<li class="vl-group"><div class="vl-head">${U.esc(lessonName(g.lessonId))}</div><ul>`;
      for (const v of vs) {
        const on = chosen.has(v.id);
        html += `<li><button type="button" class="vl-row${on ? ' on' : ''}" role="${focus ? 'radio' : 'checkbox'}" aria-checked="${on}" data-action="${focus ? 'drill-focus-verb' : 'drill-toggle-verb'}" data-arg="${v.id}">`
          + `<span class="vl-check" aria-hidden="true"></span><span class="vl-pin">${U.esc(v.pin)}</span>`
          + `<span class="vl-fa" lang="fa" dir="rtl">${v.fa}</span><span class="vl-en">${U.esc(v.en)}</span>`
          + (st.scope !== 'recent' && recent.has(v.id) ? '<span class="vl-new">recent</span>' : '') + '</button></li>';
      }
      html += '</ul></li>';
    }
    return html || '<li class="vl-empty">No verb matches</li>';
  }

  function buildPanel() {
    const el = $('drill-panel');
    if (!el) return;
    const drilling = st.mode !== 'browse';
    const n = scopeIds().length;
    const usedAll = V.config.allForms;
    let html = `<div class="filter-group"><label>Mode</label><div class="pills">`
      + pillHTML('Mixed sets', st.mode === 'sets', 'drill-mode', 'sets', '10 prompts across verbs, tenses and persons')
      + pillHTML('Practice one verb', st.mode === 'focus', 'drill-mode', 'focus', 'The whole paradigm of one verb, in order')
      + pillHTML('Browse', st.mode === 'browse', 'drill-mode', 'browse', 'Conjugation tables')
      + '</div></div>';
    if (drilling) {
      html += `<div class="filter-group"><div class="filter-head"><label>Tenses</label><div class="filter-acts">`
        + '<button type="button" class="mini" data-action="drill-tenses" data-arg="all">All</button><button type="button" class="mini" data-action="drill-tenses" data-arg="none">None</button></div></div><div class="pills">'
        + V.TENSES.map(t => pillHTML(t.label, st.tenses.has(t.id), 'drill-tense', t.id)).join('') + '</div></div>';
      html += `<div class="filter-group"><div class="filter-head"><label>Person</label><div class="filter-acts">`
        + '<button type="button" class="mini" data-action="drill-persons" data-arg="all">All</button><button type="button" class="mini" data-action="drill-persons" data-arg="none">None</button></div></div><div class="pills">'
        + V.PERSONS.map((p, i) => pillHTML(p.pin, st.persons.has(i), 'drill-person', i, p.en)).join('') + '</div></div>';
    }
    html += '<div class="filter-group">';
    if (st.mode === 'focus') {
      html += `<label>Verb to practice</label>`;
    } else {
      html += `<div class="filter-head"><label>Verbs (${n})</label></div><div class="pills">`
        + pillHTML('From recent lessons', st.scope === 'recent', 'drill-scope', 'recent', `Verbs used in the newest ${RECENT_LESSONS} lessons`)
        + pillHTML('All verbs', st.scope === 'all', 'drill-scope', 'all')
        + pillHTML('My choice', st.scope === 'custom', 'drill-scope', 'custom')
        + '</div>';
    }
    html += `<input type="search" id="drill-verb-search" class="vl-search" placeholder="Search verbs" autocomplete="off" autocapitalize="off" spellcheck="false" value="${U.escAttr(st.search)}" aria-label="Search verbs">`
      + `<ul class="verb-list" id="drill-verb-list">${verbListHTML()}</ul></div>`;
    const all = V.allMeaningItems().length * 2;
    const deck = F.cards.all.filter(c => c.type === 'verbs').length;
    html += `<div class="filter-group"><label>Verb flashcards</label><div class="pills">`
      + pillHTML('All verb forms', usedAll, 'drill-all-forms', null)
      + `</div><p class="drill-note">${usedAll
        ? `Every form of every verb: ${deck.toLocaleString()} cards.`
        : `Off: the forms your lessons use, plus anything you have already studied (${deck.toLocaleString()} of ${all.toLocaleString()} cards).`}</p></div>`;
    el.innerHTML = html;
  }

  function refreshList() {
    const ul = $('drill-verb-list');
    if (ul) ul.innerHTML = verbListHTML();
  }

  // Typing in the search box filters the list only (keeps focus).
  document.addEventListener('input', e => {
    if (!e.target || e.target.id !== 'drill-verb-search') return;
    st.search = e.target.value;
    refreshList();
  });

  function changed(rebuildSet) {
    st.vIdx = 0;
    st.browseIds = null;
    if (rebuildSet && st.mode !== 'browse') startSet();
    buildPanel();
    F.app.render();
  }

  function setMode(m) {
    if (!['sets', 'focus', 'browse'].includes(m)) return;
    st.mode = m;
    st.set = null;
    st.confirmReset = false;
    S.flipped = false;
    typedReset();
    buildPanel();
    F.app.render();
  }

  function setAllForms(on) {
    V.config.allForms = !!on;
    F.cards.build();
    if (F.study && typeof F.study.applyFilters === 'function') { try { F.study.applyFilters(); } catch (e) { console.error(e); } }
    if (F.settings && typeof F.settings.buildStudyPills === 'function') { try { F.settings.buildStudyPills(); } catch (e) { console.error(e); } }
    buildPanel();
    F.app.render();
  }

  // ---------- Actions ----------
  const A = F.actions;
  A.register('drill-mark', el => markCard(el.dataset.arg === '1'));
  A.register('drill-new-set', () => { startSet(); F.app.render(); });
  A.register('drill-again', () => { startSet(); F.app.render(); });
  A.register('drill-retry', () => { retryMissed(); F.app.render(); });
  A.register('drill-mode', el => setMode(el.dataset.arg));
  A.register('drill-tense', el => { U.toggleSet(st.tenses, el.dataset.arg); changed(true); });
  A.register('drill-person', el => { U.toggleSet(st.persons, +el.dataset.arg); changed(true); });
  A.register('drill-tenses', el => { st.tenses = new Set(el.dataset.arg === 'all' ? V.TENSES.map(t => t.id) : []); changed(true); });
  A.register('drill-persons', el => { st.persons = new Set(el.dataset.arg === 'all' ? [0, 1, 2, 3, 4, 5] : []); changed(true); });
  A.register('drill-scope', el => {
    if (el.dataset.arg === 'custom' && st.scope !== 'custom' && !st.verbs.size) st.verbs = new Set(scopeIds());
    st.scope = el.dataset.arg;
    changed(true);
  });
  A.register('drill-toggle-verb', el => {
    if (st.scope !== 'custom') { st.verbs = new Set(scopeIds()); st.scope = 'custom'; }
    U.toggleSet(st.verbs, el.dataset.arg);
    changed(true);
  });
  A.register('drill-focus-verb', el => {
    st.focus = el.dataset.arg;
    st.mode = 'focus';
    S.flipped = false;
    startSet();
    buildPanel();
    if (S.tab !== 'verbs') F.app.setView('verbs'); else F.app.render();
  });
  A.register('drill-start-set', () => {
    st.mode = 'sets';
    st.confirmReset = false;
    startSet();
    buildPanel();
    if (S.tab !== 'verbs') F.app.setView('verbs'); else F.app.render();
  });
  A.register('drill-all-forms', () => setAllForms(!V.config.allForms));
  A.register('drill-reset-confirm', () => resetScores());
  A.register('drill-reset-cancel', () => { st.confirmReset = false; F.app.render(); });
  F.hooks.on('shuffle:changed', () => { st.browseIds = null; });

  // ---------- Prefs ----------
  F.store.registerPrefs({
    save(p) {
      p.vtMode = st.mode;
      p.tenses = [...st.tenses];
      p.knownTenses = V.TENSES.map(t => t.id);
      p.persons = [...st.persons];
      p.drillScope = st.scope;
      p.drillVerbs = V.VERBS.filter(v => st.verbs.has(v.id)).map(v => v.id);
      p.drillFocus = st.focus;
      p.verbAllForms = V.config.allForms;
    },
    load(p) {
      if (p.vtMode === 'browse' || p.vtMode === 'focus' || p.vtMode === 'sets') st.mode = p.vtMode;
      else if (p.vtMode === 'drill') st.mode = 'sets';
      if (Array.isArray(p.tenses)) {
        const valid = p.tenses.filter(t => V.TENSES.some(x => x.id === t));
        if (valid.length) {
          st.tenses = new Set(valid);
          const knownT = new Set(p.knownTenses || []);
          for (const t of V.TENSES) if (!knownT.has(t.id)) st.tenses.add(t.id);
        }
      }
      if (Array.isArray(p.persons) && p.persons.length) {
        st.persons = new Set(p.persons.filter(n => n >= 0 && n <= 5));
      }
      if (Array.isArray(p.drillVerbs)) st.verbs = new Set(p.drillVerbs.filter(id => V.byId(id)));
      else if (Array.isArray(p.verbsOff)) for (const id of p.verbsOff) st.verbs.delete(id);   // the old pill filter
      if (['recent', 'all', 'custom'].includes(p.drillScope)) st.scope = p.drillScope;
      if (p.drillFocus && V.byId(p.drillFocus)) st.focus = p.drillFocus;
      if (typeof p.verbAllForms === 'boolean' && p.verbAllForms !== V.config.allForms) {
        V.config.allForms = p.verbAllForms;
        F.cards.build();
      }
    },
  });

  // ---------- Today section (js/ui/today.js, if present) ----------
  let todayDone = false;
  function todayHTML() {
    const combos = promptsFor(scopeVerbs());
    const weak = combos.filter(d => { const s = scores()[V.drillKey(d)]; return s && s.w > s.r; }).length;
    const nVerbs = scopeIds().length;
    return `<div class="drill-today">
      <h3 class="drill-today-title">Verb drill · ${SET_SIZE} prompts</h3>
      <p class="drill-today-note">Mixed tenses and persons from ${st.scope === 'recent' ? 'your recent lessons' : `${nVerbs} ${U.plural(nVerbs, 'verb')}`}${weak ? ` · ${weak} ${U.plural(weak, 'form')} to fix` : ''}</p>
      <button type="button" class="drill-primary" data-action="drill-start-set">Start a set</button>
    </div>`;
  }
  function registerToday() {
    if (todayDone || !F.today || typeof F.today.registerSection !== 'function') return;
    todayDone = true;
    try {
      F.today.registerSection({
        id: 'verb-drill',
        order: 40,
        title: 'Verb drill',
        html: todayHTML,
        render(el) { el.innerHTML = todayHTML(); },
        visible() { return promptsFor(scopeVerbs()).length > 0; },
      });
    } catch (e) { console.error('verb drill: today section', e); }
  }
  registerToday();
  F.hooks.on('boot', registerToday);

  F.drill = {
    state: st, startSet, retryMissed, allDrillCombos, browseList, markCard, buildPanel,
    rebuildDrillQueue: startSet,   // old name, still called by settings.js
    setAllForms, SET_SIZE,
  };

  F.views.register('verbs', {
    label: 'Verb trainer',
    order: 20,
    panel: 'drill-panel',
    init() { buildPanel(); },
    enter() { buildPanel(); },
    render() {
      if (st.mode === 'browse') renderBrowse(); else renderDrill();
      $('scope-bar').innerHTML = '';
    },
    renderScoreRow,
    syncChrome() {
      $('mastered-btn').hidden = true;
      $('newlimit-btn').hidden = true;
      if ($('typed-btn')) $('typed-btn').hidden = st.mode !== 'browse';   // drill always takes typed answers
      $('score-row').style.display = st.mode !== 'browse' ? '' : 'none';
    },
    leave() { if ($('typed-btn')) $('typed-btn').hidden = false; },
    shortcutsHTML() {
      if (st.mode === 'browse') return '<span><kbd>Space</kbd> flip &nbsp; <kbd>&#8592;</kbd><kbd>&#8594;</kbd> verbs</span>';
      return '<span><kbd>Enter</kbd> check &nbsp; <kbd>Space</kbd> show answer &nbsp; <kbd>1</kbd> again &nbsp; <kbd>2</kbd> got it'
        + (F.audio && F.audio.ready() ? ' &nbsp; <kbd>s</kbd> hear it' : '') + '</span>';
    },
    next() {
      if (st.mode === 'browse' && st.vIdx < browseList().length - 1) { st.vIdx++; S.flipped = false; F.app.render(); }
    },
    prev() {
      if (st.mode === 'browse' && st.vIdx > 0) { st.vIdx--; S.flipped = false; F.app.render(); }
    },
    onShuffle() {
      if (st.mode !== 'browse') startSet();
      F.app.render();
    },
    reset() { if (st.mode !== 'browse') { st.confirmReset = true; F.app.render(); } },
    typedActive() { return st.mode !== 'browse' && !!current() && !st.confirmReset; },
    typedAnswer() {
      const d = current();
      const ans = d && V.drillAnswer(d);
      return ans ? ans.pin : '';
    },
    speech() {
      const d = current();
      if (st.mode !== 'browse' && d) {
        const ans = V.drillAnswer(d);
        return { text: ans ? ans.fa : '', token: V.drillKey(d) + '|' + st.set.idx };
      }
      if (st.mode === 'browse') {
        const v = browseList()[st.vIdx];
        return v ? { text: v.fa, token: 'browse|' + v.id } : null;
      }
      return null;
    },
    keydown(e) {
      if (st.mode === 'browse') return;
      if (e.key === '1') markCard(false);
      if (e.key === '2') markCard(true);
      if (e.key === 'Enter' && setDone()) { startSet(); F.app.render(); }
    },
  });
})(window);
