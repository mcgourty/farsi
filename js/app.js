// app.js: boot, view switching, the shared render pass, and the global click
// and keyboard dispatch. Loaded last.
//
// Render pass (F.app.render): syncChrome() -> view.render() ->
// view.renderScoreRow() -> hooks 'render' -> store.syncPrefs().
// Nothing here writes the store on render; store.syncPrefs() only schedules
// a save when a preference actually changed.
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const $ = id => document.getElementById(id);

  function view() { return F.views.get(S.tab) || F.views.list()[0]; }

  function buildTabs() {
    const box = $('tabs');
    box.innerHTML = '';
    for (const v of F.views.list()) {
      if (v.tab === false) continue;
      const b = document.createElement('button');
      b.className = 'tab-btn';
      b.id = `tab-${v.name}`;
      b.setAttribute('role', 'tab');
      b.dataset.action = 'set-view';
      b.dataset.arg = v.name;
      b.textContent = v.label;
      box.appendChild(b);
    }
  }

  function syncChrome() {
    const v = view();
    for (const t of F.views.list()) {
      const b = $(`tab-${t.name}`);
      if (b) b.classList.toggle('active', t === v);
    }
    // Each view's settings panel is the element whose id is view.panel.
    for (const t of F.views.list()) {
      if (t.panel && $(t.panel)) $(t.panel).style.display = t === v ? '' : 'none';
    }
    document.querySelector('.bottom-actions').style.display = v.hideActions ? 'none' : '';
    document.body.classList.toggle('filters-collapsed', !S.filtersExpanded);
    document.body.dataset.view = v.name;
    const ft = $('filter-toggle');
    if (ft) ft.textContent = S.filtersExpanded ? 'Hide filters' : 'Filters';
    const hint = $('phone-hint');
    if (hint) hint.hidden = app.standalone() || root.innerWidth > 720;
    if (v.syncChrome) v.syncChrome();
    $('shortcuts').innerHTML = v.shortcutsHTML ? v.shortcutsHTML() : '';
  }

  function render() {
    const v = view();
    syncChrome();
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
    const prevView = view();
    if (prevView.leave) prevView.leave();
    S.tab = name;
    S.flipped = false;
    const v = view();
    if (v.enter) v.enter();
    render();
    F.hooks.emit('view:changed', { from: prevView.name, to: name });
  }

  const app = F.app = {
    view, render, flip, setView, syncChrome,
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
  A.register('reset', () => { const v = view(); if (v.reset) v.reset(); });

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
    const v = view();
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); flip(); }
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
