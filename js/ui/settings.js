// ui/settings.js: the filter panels. Study filters (#fc-filters: mode,
// sessions with progress meters, types, front, direction) and verb trainer
// filters (#vt-filters: mode, tenses, persons, verbs), plus their bulk
// All/None buttons and the phone-only Filters toggle.
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const U = F.util;
  const $ = id => document.getElementById(id);

  function pill(label, active, onClick, extra) {
    const b = document.createElement('button');
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
      b.innerHTML = `<span class="pill-text">${U.esc(s.label)}</span>` + T.meterHTML(counts);
      b.title = T.meterTitle(s.label, counts);
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

    const dp = $('dir-pills');
    dp.innerHTML = '';
    for (const d of T.DIRECTIONS) {
      dp.appendChild(pill(d.label, st.direction === d.id, () => { st.direction = d.id; refilter(); }));
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

  // ---------- Verb trainer filters ----------
  function buildVtPills() {
    const D = F.drill;
    const st = D.state;
    const V = F.verbs;
    const refresh = () => { D.rebuildDrillQueue(); buildVtPills(); F.app.render(); };

    const mp = $('vt-mode-pills');
    mp.innerHTML = '';
    for (const m of [{ id: 'browse', label: 'Browse verbs' }, { id: 'drill', label: 'Conjugation drill' }]) {
      mp.appendChild(pill(m.label, st.mode === m.id, () => {
        st.mode = m.id; S.flipped = false; F.typed.reset();
        if (m.id === 'drill') D.rebuildDrillQueue();
        buildVtPills(); F.app.render();
      }));
    }
    $('vt-tense-group').style.display = st.mode === 'drill' ? '' : 'none';
    $('vt-person-group').style.display = st.mode === 'drill' ? '' : 'none';

    const tp = $('vt-tense-pills');
    tp.innerHTML = '';
    for (const t of V.TENSES) {
      tp.appendChild(pill(t.label, st.tenses.has(t.id), () => { U.toggleSet(st.tenses, t.id); refresh(); }));
    }

    const pp = $('vt-person-pills');
    pp.innerHTML = '';
    V.PERSONS.forEach((p, i) => {
      const b = pill(p.pin, st.persons.has(i), () => { U.toggleSet(st.persons, i); refresh(); });
      b.title = p.en;
      pp.appendChild(b);
    });

    const vp = $('vt-verb-pills');
    vp.innerHTML = '';
    for (const v of V.VERBS) {
      vp.appendChild(pill(v.pin, st.verbs.has(v.id), () => {
        U.toggleSet(st.verbs, v.id); st.vIdx = 0; st.browseIds = null; refresh();
      }));
    }
  }

  function vtSetAll(field, all) {
    return on => {
      const st = F.drill.state;
      st[field] = on ? new Set(all()) : new Set();
      if (field === 'verbs') { st.vIdx = 0; st.browseIds = null; }
      F.drill.rebuildDrillQueue();
      buildVtPills();
      F.app.render();
    };
  }
  const setAllTenses = vtSetAll('tenses', () => F.verbs.TENSES.map(t => t.id));
  const setAllPersons = vtSetAll('persons', () => [0, 1, 2, 3, 4, 5]);
  const setAllVtVerbs = vtSetAll('verbs', () => F.verbs.VERBS.map(v => v.id));

  const A = F.actions;
  A.register('sessions-all', () => setAllSessions(true));
  A.register('sessions-none', () => setAllSessions(false));
  A.register('sessions-newest', () => onlyNewestSession());
  A.register('types-all', () => setAllTypes(true));
  A.register('types-none', () => setAllTypes(false));
  A.register('tenses-all', () => setAllTenses(true));
  A.register('tenses-none', () => setAllTenses(false));
  A.register('persons-all', () => setAllPersons(true));
  A.register('persons-none', () => setAllPersons(false));
  A.register('vtverbs-all', () => setAllVtVerbs(true));
  A.register('vtverbs-none', () => setAllVtVerbs(false));
  A.register('toggle-filters', () => { S.filtersExpanded = !S.filtersExpanded; F.app.render(); });

  F.store.registerPrefs({
    save(p) { p.filtersExpanded = S.filtersExpanded; },
    load(p) { if (typeof p.filtersExpanded === 'boolean') S.filtersExpanded = p.filtersExpanded; },
  });

  F.settings = {
    // Rebuild every panel (pills carry live counts, so call after grading
    // changes them if they are visible).
    build() { buildStudyPills(); buildVtPills(); },
    buildStudyPills, buildVtPills,
    setAllSessions, setAllTypes, onlyNewestSession,
  };
})(window);
