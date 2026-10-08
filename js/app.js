// app.js: boot, view switching, the shared render pass, and the global click
// and keyboard dispatch. Loaded last.
//
// Render pass (F.app.render): syncChrome() -> clear shared chrome -> view.render() ->
// view.renderScoreRow() -> hooks 'render' -> store.syncPrefs().
// Nothing here writes the store on render; store.syncPrefs() only schedules
// a save when a preference actually changed.
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const $ = id => document.getElementById(id);

  function view() { return F.views.get(S.tab) || F.views.list()[0]; }

  // The main navigation: at most five places, each an icon and a short label.
  // A view joins it unless it sets `tab: false`; `navAs` makes a view light up
  // another's tab (the lesson notes sit under Read). Labels come from
  // `tabLabel` (falling back to `label`), icons from `navIcon` or NAV_ICONS.
  const TAB_LABELS = { cards: 'Study', verbs: 'Verbs' };
  const svg = d => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const NAV_ICONS = {
    // the eight-pointed tile star (khatam)
    today: svg('<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="1"/><path d="M12 3.8 20.2 12 12 20.2 3.8 12z"/>'),
    // two cards
    cards: svg('<rect x="7.5" y="4" width="12" height="15" rx="2.2"/><path d="M4.5 7.5v10.3A2.2 2.2 0 0 0 6.7 20H15"/>'),
    // a conjugation table
    verbs: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15"/>'),
    // an open book
    read: svg('<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>'),
    // bars
    progress: svg('<path d="M5 19.5V13M10 19.5V8.5M15 19.5V11M20 19.5V5"/>'),
  };

  function buildTabs() {
    const box = $('tabs');
    box.innerHTML = '';
    for (const v of F.views.list()) {
      if (v.tab === false) continue;
      const b = document.createElement('button');
      b.className = 'tab-btn';
      b.id = `tab-${v.name}`;
      b.type = 'button';
      b.dataset.action = 'set-view';
      b.dataset.arg = v.name;
      const label = v.tabLabel || TAB_LABELS[v.name] || v.label;
      b.innerHTML = (v.navIcon || NAV_ICONS[v.name] || NAV_ICONS.today) + `<span class="tab-label">${F.util.esc(label)}</span>`;
      box.appendChild(b);
    }
  }

  // Two views behind one tab (Read: stories and lesson notes) switch with
  // this segmented control at the top of their pages.
  function segmentsHTML(items, active) {
    return '<div class="seg-switch" role="group" aria-label="Show">'
      + items.map(([name, label]) => `<button type="button" class="seg-btn${name === active ? ' active' : ''}" data-action="set-view" data-arg="${name}" aria-pressed="${name === active}">${F.util.esc(label)}</button>`).join('')
      + '</div>';
  }

  function syncChrome() {
    const v = view();
    const navName = v.navAs || v.name;
    for (const t of F.views.list()) {
      const b = $(`tab-${t.name}`);
      if (!b) continue;
      const on = t.name === navName;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    // Each view's settings panel (view.panel) lives in the settings sheet and
    // shows while its view is active. Views without one (Today, Progress)
    // show the study panel, since that is what their buttons start.
    const shown = v.panel ? v : F.views.get('cards');
    for (const t of F.views.list()) {
      if (t.panel && $(t.panel)) $(t.panel).style.display = t === shown ? '' : 'none';
    }
    const acts = document.querySelector('.bottom-actions');
    if (acts) acts.style.display = v.hideActions ? 'none' : '';
    // backup.js reads this class to know whether its panel is on screen.
    document.body.classList.toggle('filters-collapsed', !(F.sheet && F.sheet.isOpen()));
    document.body.dataset.view = v.name;
    // A page view (view.page) draws a whole page into #card-area; the study
    // chrome (stats, meter, nav, grading row, shortcuts) is hidden for it.
    if (v.page) document.body.dataset.page = ''; else delete document.body.dataset.page;
    if (v.syncChrome) v.syncChrome();
    $('shortcuts').innerHTML = v.shortcutsHTML ? v.shortcutsHTML() : '';
  }

  function render() {
    const v = view();
    syncChrome();
    // The shared meter is drawn by a 'render' hook (progress.js) for the
    // views that want it; clear it so other views start clean.
    $('meter-row').innerHTML = '';
    if (v.page) {
      $('card-count').innerHTML = '';
      $('scope-bar').innerHTML = '';
      $('score-row').innerHTML = '';
    }
    v.render();
    if (v.renderScoreRow) v.renderScoreRow();
    else $('score-row').innerHTML = '';
    F.hooks.emit('render', { view: v.name });
    F.store.syncPrefs();
  }

  // Shared flip: typed recall grades what was typed before showing the back.
  function flip() {
    const v = view();
    if (!S.flipped && v.typedActive && v.typedActive()) {
      const el = $('typed-input');
      if (el && el.value.trim()) { F.typed.submit(el.value); return; }
    }
    S.flipped = !S.flipped;
    const card = $('card');
    if (card) card.classList.toggle('flipped', S.flipped);
    if (v.renderScoreRow) v.renderScoreRow();
    if (S.flipped) F.audio.maybeSpeak();
    F.hooks.emit('card:flipped', { view: v.name, flipped: S.flipped });
  }

  function setView(name) {
    if (!F.views.get(name)) return;
    if (F.sheet && F.sheet.isOpen()) F.sheet.close();
    const prevView = view();
    if (prevView.leave) prevView.leave();
    S.tab = name;
    S.flipped = false;
    const v = view();
    if (v.enter) v.enter();
    render();
    root.scrollTo(0, 0);
    // Keep the address in step (a reload stays on this view; Today is the bare URL).
    try {
      const url = root.location.pathname + root.location.search + (name === 'today' ? '' : '#' + name);
      root.history.replaceState(null, '', url);
    } catch (e) { /* ignore */ }
    F.hooks.emit('view:changed', { from: prevView.name, to: name });
  }

  // The app opens on Today (when registered) rather than the last tab, unless
  // the URL names a view: index.html#cards, #verbs, #progress.
  function initialView() {
    const hash = (root.location.hash || '').replace(/^#/, '');
    if (hash && F.views.get(hash)) return hash;
    if (F.views.get('today')) return 'today';
    return S.tab;
  }

  const app = F.app = {
    view, render, flip, setView, syncChrome, segmentsHTML,
    standalone() {
      return root.navigator.standalone === true
        || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
    },
  };

  // ---------- Actions ----------
  const A = F.actions;
  A.register('set-view', el => setView(el.dataset.arg));
  A.register('flip', () => flip());
  A.register('next', () => { const v = view(); if (v.next) v.next(); });
  A.register('prev', () => { const v = view(); if (v.prev) v.prev(); });
  A.register('toggle-shuffle', () => {
    S.shuffled = !S.shuffled;
    $('shuffle-btn').classList.toggle('active', S.shuffled);
    F.hooks.emit('shuffle:changed', { shuffled: S.shuffled });
    const v = view();
    if (v.onShuffle) v.onShuffle(); else render();
  });

  // One delegated click listener for every data-action in the page.
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('input, textarea, select, label')) return;   // typing, not tapping the card
    const el = t.closest('[data-action]');
    if (!el || el.disabled) return;
    F.actions.run(el.dataset.action, el, e);
  });

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (F.sheet && F.sheet.isOpen()) return;   // the sheet handles its own keys
    const v = view();
    // Page views (Today, Read, Notes, Progress) keep Space for scrolling.
    if (v.page) { if (v.keydown) v.keydown(e); return; }
    if ((e.key === ' ' || e.key === 'Spacebar') && $('card-area').querySelector('.card-wrapper, .learn-card')) { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight' && v.next) v.next();
    if (e.key === 'ArrowLeft' && v.prev) v.prev();
    if (e.key === 's' || e.key === 'S') F.audio.speakCurrent();
    if (v.keydown) v.keydown(e);
  });

  F.store.registerPrefs({
    save(p) { p.tab = S.tab; p.shuffled = S.shuffled; },
    load(p) {
      if (p.tab && F.views.get(p.tab)) S.tab = p.tab;
      if (typeof p.shuffled === 'boolean') S.shuffled = p.shuffled;
    },
  });

  // ---------- Boot ----------
  function boot() {
    F.cards.build();
    F.store.applyPrefs();
    F.store.pruneLogs();
    S.tab = initialView();
    buildTabs();
    $('shuffle-btn').classList.toggle('active', S.shuffled);
    $('typed-btn').classList.toggle('active', S.typedMode);
    F.audio.init();
    F.audio.syncButton();
    for (const v of F.views.list()) if (v.init) v.init();
    F.settings.build();
    render();
    F.hooks.emit('boot', { migrated: F.store.status.migrated });
    try {
      if (root.navigator.storage && root.navigator.storage.persist) {
        root.navigator.storage.persist().catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  F.store.init().then(boot, e => { console.error(e); boot(); });
})(window);
