// ui/typed.js: typed recall (type the pinglish), shared by the study view and
// the verb drill. A view opts in with typedActive() and typedAnswer().
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;

  // Tolerant match: ignores case, macrons, punctuation and the usual oo/u, ee/i, q/gh swaps
  function normalizePin(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .replace(/ou|oo/g, 'u')
      .replace(/ee/g, 'i')
      .replace(/ey/g, 'ei')
      .replace(/q/g, 'gh');
  }
  function pinMatches(input, answer) {
    const t = normalizePin(input);
    if (!t) return false;
    if (normalizePin(answer) === t) return true;
    return String(answer).split(/[\/,;]/).some(a => normalizePin(a) === t);
  }

  const typed = F.typed = {
    normalizePin, pinMatches,

    inputHTML(hint) {
      return `<input id="typed-input" class="typed-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`
        + ` placeholder="${F.util.escAttr(hint)}" value="${F.util.escAttr(S.typedValue)}">`;
    },

    bannerHTML() {
      if (!S.typedResult) return '';
      const ok = S.typedResult === 'right';
      return `<div class="typed-banner ${S.typedResult}">${ok ? '✓ correct' : '✗ you typed “' + F.util.escAttr(S.typedValue || '—') + '”'}</div>`;
    },

    // Grade what was typed and show the back of the card.
    submit(value) {
      const v = F.app.view();
      S.typedValue = value;
      S.typedResult = pinMatches(value, v.typedAnswer ? v.typedAnswer() : '') ? 'right' : 'wrong';
      S.flipped = true;
      F.app.render();
    },

    focusInput() {
      const input = document.getElementById('typed-input');
      if (input && !S.flipped) input.focus();
    },

    reset() { S.typedResult = null; S.typedValue = ''; },
  };

  // Enter in the typed box submits; other keys stay in the box.
  document.addEventListener('keydown', e => {
    if (!e.target || e.target.id !== 'typed-input') return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    typed.submit(e.target.value);
  });

  F.actions.register('toggle-typed', () => {
    S.typedMode = !S.typedMode;
    document.getElementById('typed-btn').classList.toggle('active', S.typedMode);
    typed.reset();
    S.flipped = false;
    F.app.render();
  });

  F.store.registerPrefs({
    save(p) { p.typedMode = S.typedMode; },
    load(p) { if (typeof p.typedMode === 'boolean') S.typedMode = p.typedMode; },
  });
})(window);
