// ui/settings.js: the panels inside the settings sheet. Study filters
// (#fc-filters: mode, sessions with known/learning/new meters, types,
// direction, front) with their quick All/None/Newest buttons, and the theme
// (system / light / dark, saved in prefs as `theme`). The verb trainer's
// panel (#drill-panel) is built by js/ui/drill.js.
(function (root) {
  'use strict';
  const F = root.F;
  const U = F.util;
  const $ = id => document.getElementById(id);

  function pill(label, active, onClick, extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.className = 'pill' + (extra ? ' ' + extra : '') + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Study filters ----------
  function buildStudyPills() {
    const T = F.study;
    const st = T.state;
    const refilter = () => { buildStudyPills(); T.applyFilters(); };

    const mp = $('mode-pills');
    mp.innerHTML = '';
    for (const m of T.STUDY_MODES) {
      mp.appendChild(pill(m.label, st.mode === m.id, () => { st.mode = m.id; refilter(); }));
    }

    const sp = $('session-pills');
    sp.innerHTML = '';
    const perSession = T.sessionStateCounts();
    for (const s of F.cards.sessions) {
      const counts = perSession.get(s.id) || { new: 0, learning: 0, young: 0, mature: 0, total: 0 };
      const b = pill('', st.sessions.has(s.id), () => { U.toggleSet(st.sessions, s.id); refilter(); }, 'has-meter');
      b.innerHTML = `<span class="pill-text">${U.esc(shortLabel(s.label))}</span>` + sessionMeterHTML(counts);
      b.title = T.meterTitle(s.label, counts);
      b.setAttribute('aria-label', `${s.label}: ${known(counts)} of ${counts.total} cards known`);
      b.dataset.session = s.id;
      sp.appendChild(b);
    }

    const tp = $('type-pills');
    tp.innerHTML = '';
    for (const t of F.cards.TYPES) {
      tp.appendChild(pill(t.label, st.types.has(t.id), () => { U.toggleSet(st.types, t.id); refilter(); }));
    }

    const fp = $('front-pills');
    fp.innerHTML = '';
    for (const f of T.FRONT_MODES) {
      fp.appendChild(pill(f.label, st.frontMode === f.id, () => { st.frontMode = f.id; buildStudyPills(); F.app.render(); }));
    }

    syncQuick();

    const dp = $('dir-pills');
    dp.innerHTML = '';
    for (const d of T.DIRECTIONS) {
      dp.appendChild(pill(d.label, st.direction === d.id, () => { st.direction = d.id; refilter(); }));
    }
  }

  // "Session 35" -> "35" keeps the grid of session pills compact; the
  // alphabet and verbs keep their names.
  function shortLabel(label) { return String(label).replace(/^Sessions?\s+/i, ''); }
  const known = c => c.mature || 0;
  // known (mature, stable 21+ days) · learning (young + learning) · new
  function sessionMeterHTML(c) {
    if (!c.total) return '<span class="meter"></span><span class="pill-sub">no cards</span>';
    const learning = (c.young || 0) + (c.learning || 0);
    const w = n => (n / c.total) * 100;
    const segs = [['known', known(c)], ['learning', learning], ['new', c.new || 0]]
      .filter(x => x[1]).map(([k, n]) => `<i class="seg seg-${k}" style="width:${w(n)}%"></i>`).join('');
    return `<span class="meter">${segs}</span><span class="pill-sub">${Math.round(w(known(c)))}% known</span>`;
  }
  // Highlights "Newest only" / "All" when the selection is exactly that.
  function syncQuick() {
    const sel = F.study.state.sessions;
    const newest = F.cards.newestLesson();
    const nb = $('sessions-newest-btn'), ab = $('sessions-all-btn');
    const isNewest = !!newest && sel.size === 1 && sel.has(newest.id);
    const isAll = sel.size === F.cards.sessions.length;
    if (nb) { nb.classList.toggle('active', isNewest); nb.setAttribute('aria-pressed', String(isNewest)); }
    if (ab) { ab.classList.toggle('active', isAll); ab.setAttribute('aria-pressed', String(isAll)); }
  }

  // ---------- Theme ----------
  const THEMES = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];
  let theme = 'system';
  const THEME_COLORS = { light: '#f4f5f1', dark: '#0d1422' };
  function applyTheme() {
    const html = document.documentElement;
    if (theme === 'system') delete html.dataset.theme; else html.dataset.theme = theme;
    // The status bar colour follows a manual choice; with "system" the two
    // media-qualified theme-color tags in <head> apply.
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      if (!m.dataset.media) m.dataset.media = m.getAttribute('media') || '';
      if (theme === 'system') { if (m.dataset.media) m.setAttribute('media', m.dataset.media); }
      else { m.removeAttribute('media'); m.setAttribute('content', THEME_COLORS[theme]); }
    }
    if (theme === 'system') {
      for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
        m.setAttribute('content', /dark/.test(m.dataset.media) ? THEME_COLORS.dark : THEME_COLORS.light);
      }
    }
  }
  function buildThemePills() {
    const tp = $('theme-pills');
    if (!tp) return;
    tp.innerHTML = '';
    for (const t of THEMES) {
      tp.appendChild(pill(t.label, theme === t.id, () => { theme = t.id; applyTheme(); buildThemePills(); F.store.syncPrefs(); }));
    }
  }

  function setAllSessions(on) {
    F.study.state.sessions = on ? new Set(F.cards.sessions.map(x => x.id)) : new Set();
    buildStudyPills();
    F.study.applyFilters();
  }
  function setAllTypes(on) {
    F.study.state.types = on ? new Set(F.cards.TYPES.map(t => t.id)) : new Set();
    buildStudyPills();
    F.study.applyFilters();
  }
  // "Newest" means the last numbered lesson, not the alphabet or verbs.
  function onlyNewestSession() {
    const newest = F.cards.newestLesson();
    if (!newest) return;
    F.study.state.sessions = new Set([newest.id]);
    buildStudyPills();
    F.study.applyFilters();
  }

  const A = F.actions;
  A.register('sessions-all', () => setAllSessions(true));
  A.register('sessions-none', () => setAllSessions(false));
  A.register('sessions-newest', () => onlyNewestSession());
  A.register('types-all', () => setAllTypes(true));
  A.register('types-none', () => setAllTypes(false));
  // Old name for opening the settings (the filters now live in the sheet).
  A.register('toggle-filters', () => F.sheet.toggle());

  F.store.registerPrefs({
    save(p) { p.theme = theme; },
    load(p) {
      if (THEMES.some(t => t.id === p.theme)) theme = p.theme;
      applyTheme();
    },
  });

  F.settings = {
    // Rebuild every panel (pills carry live counts, so call after grading
    // changes them if they are visible).
    build() { buildStudyPills(); buildThemePills(); if (F.drill && F.drill.buildPanel) F.drill.buildPanel(); },
    buildStudyPills, buildThemePills,
    theme: () => theme,
    setTheme(id) { if (THEMES.some(t => t.id === id)) { theme = id; applyTheme(); buildThemePills(); F.store.syncPrefs(); } },
    setAllSessions, setAllTypes, onlyNewestSession,
  };
})(window);
