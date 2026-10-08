// ui/sheet.js: the settings sheet (#sheet). A bottom sheet on phones and a
// side panel on wide screens, opened from the header button. It holds the
// view's filter panel, the practice toggles, the theme, backup and a
// two-step reset that says exactly what it will reset.
//
// Contract for views: a view may define resetPlan() -> {title, intro?, askLabel?,
// lines: [html], count, confirmLabel, run()} | null to describe and perform its own reset.
// Without one, the study selection's reset below is used (the verbs view's
// plan, in js/ui/drill.js, resets drill scores).
(function (root) {
  'use strict';
  const F = root.F;
  const U = F.util;
  const $ = id => document.getElementById(id);

  let open = false;
  let lastFocus = null;
  let resetAsk = false;     // second step of the reset is showing
  let resetMsg = '';

  // ---------- Open / close ----------
  function setOpen(on) {
    if (on === open) return;
    open = on;
    const sheet = $('sheet');
    const bd = $('sheet-backdrop');
    if (on) {
      lastFocus = document.activeElement;
      resetAsk = false;
      resetMsg = '';
      F.settings.build();
      renderReset();
      if (F.backupUI) F.backupUI.render();
      sheet.hidden = false;
      bd.hidden = false;
      // next frame so the transition runs
      requestAnimationFrame(() => { document.body.classList.add('sheet-open'); });
      const btn = $('sheet-btn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      setTimeout(() => { const c = sheet.querySelector('.sheet-head .icon-btn'); if (c) c.focus({ preventScroll: true }); }, 30);
    } else {
      document.body.classList.remove('sheet-open');
      const btn = $('sheet-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      const done = () => { if (!open) { sheet.hidden = true; bd.hidden = true; } };
      const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) done(); else setTimeout(done, 220);
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    }
    document.body.classList.toggle('filters-collapsed', !on);
    F.hooks.emit('sheet:toggled', { open: on });
  }

  // ---------- Reset ----------
  function describeSet(all, chosen, labelOf) {
    if (chosen.length === all.length) return 'all';
    if (!chosen.length) return 'none';
    return chosen.map(labelOf).join(', ');
  }

  function cardsPlan() {
    const T = F.study;
    if (!T) return null;
    const st = T.state;
    const base = F.cards.all.filter(T.matchesFilters);
    let withProgress = 0, buried = 0;
    for (const c of base) {
      if (F.store.srs(c.id)) withProgress++;
      if (F.store.isBuried(c.id)) buried++;
    }
    const sessions = describeSet(F.cards.sessions, F.cards.sessions.filter(s => st.sessions.has(s.id)), s => s.label);
    const types = describeSet(F.cards.TYPES, F.cards.TYPES.filter(t => st.types.has(t.id)), t => t.label.toLowerCase());
    const dir = (T.DIRECTIONS.find(d => d.id === st.direction) || {}).label || st.direction;
    return {
      title: 'Reset review progress',
      count: withProgress + buried,
      lines: [
        `Sessions: <b>${U.esc(sessions)}</b>. Card types: <b>${U.esc(types)}</b>. Direction: <b>${U.esc(dir)}</b>.`,
        `<b>${withProgress.toLocaleString()}</b> ${U.plural(withProgress, 'card')} with progress go back to new`
          + (buried ? `, and <b>${buried.toLocaleString()}</b> buried ${U.plural(buried, 'card')} come back` : '') + '.',
        'Cards outside this selection, the review log, verb drill scores and your backups are not touched.',
      ],
      confirmLabel: `Reset ${(withProgress + buried).toLocaleString()} ${U.plural(withProgress + buried, 'card')}`,
      run() {
        for (const c of base) {
          delete F.store.data.srs[c.id];
          delete F.store.data.buried[c.id];
        }
        F.store.save();
        T.applyFilters();
        return `Reset ${(withProgress + buried).toLocaleString()} ${U.plural(withProgress + buried, 'card')}.`;
      },
    };
  }

  function currentPlan() {
    const v = F.app.view();
    return v.resetPlan ? v.resetPlan() : cardsPlan();
  }

  function renderReset() {
    const el = $('reset-sec');
    if (!el) return;
    const plan = currentPlan();
    if (!plan) { el.innerHTML = ''; return; }
    let html = `<h3 class="sec-title">${U.esc(plan.title)}</h3>`;
    if (resetMsg) html += `<p class="sec-note reset-msg" role="status">${U.esc(resetMsg)}</p>`;
    if (!resetAsk) {
      html += `<p class="sec-note">${plan.intro || 'Starts the cards in the current selection over.'} You see exactly what will change before anything happens.</p>`
        + `<button type="button" class="action-btn danger-quiet" data-action="reset-ask">${U.esc(plan.askLabel || 'Reset progress…')}</button>`;
    } else if (!plan.count) {
      html += '<div class="confirm-box"><p>Nothing to reset: no progress in the current selection.</p>'
        + '<div class="confirm-acts"><button type="button" class="action-btn" data-action="reset-cancel">OK</button></div></div>';
    } else {
      html += '<div class="confirm-box" role="alertdialog" aria-labelledby="reset-q">'
        + '<p id="reset-q"><b>This will reset:</b></p><ul>'
        + plan.lines.map(l => `<li>${l}</li>`).join('') + '</ul>'
        + '<p class="sec-note">This cannot be undone, except by restoring a backup.</p>'
        + '<div class="confirm-acts">'
        + `<button type="button" class="action-btn danger" data-action="reset-confirm">${U.esc(plan.confirmLabel)}</button>`
        + '<button type="button" class="action-btn" data-action="reset-cancel">Cancel</button>'
        + '</div></div>';
    }
    el.innerHTML = html;
  }

  // ---------- Actions + keys ----------
  const A = F.actions;
  A.register('open-sheet', () => setOpen(true));
  A.register('close-sheet', () => setOpen(false));
  A.register('reset-ask', () => {
    resetAsk = true; resetMsg = ''; renderReset();
    const b = document.querySelector('#reset-sec .confirm-box');
    if (b) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  A.register('reset-cancel', () => { resetAsk = false; renderReset(); });
  A.register('reset-confirm', () => {
    const plan = currentPlan();
    resetAsk = false;
    resetMsg = plan ? (plan.run() || 'Done.') : '';
    F.settings.build();
    renderReset();
    F.hooks.emit('progress:reset', {});
  });

  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'Tab') {
      // keep focus inside the sheet
      const items = [...$('sheet').querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden]), [tabindex="0"]')]
        .filter(x => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Filters changed inside the sheet: keep the reset description current.
  F.hooks.on('render', () => { if (open) renderReset(); });

  F.sheet = {
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    renderReset,
  };
})(window);
