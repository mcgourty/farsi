// ui/typed.js: typed recall, shared by the study view and the verb drill.
// A view opts in with typedActive() and typedAnswer(); a view that also has
// typedCheck(value) -> check result gets the Farsi diff and a suggested grade.
//
// The checking functions at the top are pure (no DOM), so tools/test.js can
// load this file in node:
//   F.typed.canonFa(s)    Persian text normalised for comparison
//   F.typed.skeletonFa(s) canonFa without spaces and half-spaces
//   F.typed.diff(typed, answer) -> [{t: 'ok'|'miss'|'extra', s}]
//   F.typed.checkFarsi(value, farsi, pinglish) -> {kind, grade, answer, ops, script}
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const hasDom = typeof document !== 'undefined';

  // ---------- Pinglish ----------
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
  const pinAlternatives = answer => [String(answer || '')].concat(String(answer || '').split(/[\/,;]/));
  function pinMatches(input, answer) {
    const t = normalizePin(input);
    if (!t) return false;
    return pinAlternatives(answer).some(a => normalizePin(a) === t);
  }
  // Looser still, for pinglish typed where Farsi was asked: also drops the
  // vowel-length and ezafe spellings people vary on (ā/a, -e/-ye, h at the end).
  function loosePin(s) {
    return normalizePin(s).replace(/aa/g, 'a').replace(/ye\b/g, 'e').replace(/([aeiou])h$/, '$1').replace(/'/g, '');
  }

  // ---------- Persian ----------
  const ZWNJ = '‌';
  function canonFa(s) {
    return String(s || '').normalize('NFC')
      .replace(/[يى]/g, 'ی')                  // Arabic yeh, alef maksura -> Persian ی
      .replace(/ك/g, 'ک')                          // Arabic kaf -> Persian ک
      .replace(/[ۀة]/g, 'ه')                  // ۀ, ة -> ه
      .replace(/[ً-ٰٟۖ-ۭ]/g, '')    // harakat, superscript alef, Quranic marks
      .replace(/ـ/g, '')                                // tatweel
      .replace(/[​‍‎‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[.,!?;:،؛؟«»"'()[\]…–—٫٬-]/g, ' ')
      .replace(/\s*‌[\s‌]*/g, ZWNJ)               // half-space with spaces around it
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^‌+|‌+$/g, '');
  }
  function skeletonFa(s) { return canonFa(s).replace(/[\s‌]/g, ''); }
  const hasLatin = s => /[A-Za-z]/.test(s);
  const hasPersian = s => /[؀-ۿ]/.test(s);

  function lev(a, b) {
    a = Array.from(a); b = Array.from(b);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // Character diff (LCS) of what was typed against the answer, both canonFa'd.
  // Runs of the same kind are merged so Persian letters stay joined.
  function diff(typed, answer) {
    const a = Array.from(canonFa(typed)), b = Array.from(canonFa(answer));
    const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    const ops = [];
    const push = (t, ch) => {
      const last = ops[ops.length - 1];
      if (last && last.t === t) last.s += ch; else ops.push({ t, s: ch });
    };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { push('ok', a[i]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) push('extra', a[i++]);
      else push('miss', b[j++]);
    }
    while (i < n) push('extra', a[i++]);
    while (j < m) push('miss', b[j++]);
    return ops;
  }

  // Alternatives in an answer such as "تو / توی" or "می‌گذارم / می‌ذارم".
  function faAlternatives(farsi) {
    const whole = String(farsi || '');
    const parts = whole.split(/\s*\/\s*/).filter(Boolean);
    return parts.length > 1 ? [whole].concat(parts) : [whole];
  }

  // Grades a typed answer to an English -> Farsi prompt.
  //   exact (letters, spacing; harakat, ی/ي, ک/ك, tatweel, punctuation ignored) -> Good
  //   only spacing differs (half-space vs space or none)                        -> Hard
  //   one letter off in a word of 3+ letters                                    -> Hard
  //   pinglish that matches the pinglish (Latin typed instead of Farsi)          -> Hard
  //   anything else                                                             -> Again
  function checkFarsi(value, farsi, pinglish) {
    const input = String(value || '').trim();
    if (!input) return null;
    if (hasLatin(input) && !hasPersian(input)) {
      const right = pinMatches(input, pinglish)
        || pinAlternatives(pinglish).some(p => loosePin(p) && loosePin(p) === loosePin(input));
      return { kind: right ? 'pinglish' : 'wrong', grade: right ? 2 : 1, script: 'latin', input, answer: farsi, ops: null };
    }
    let best = null;
    for (const alt of faAlternatives(farsi)) {
      let kind, grade;
      const d = lev(skeletonFa(input), skeletonFa(alt));
      if (canonFa(input) === canonFa(alt)) { kind = 'exact'; grade = 3; }
      else if (d === 0) { kind = 'spacing'; grade = 2; }
      else if (d === 1 && skeletonFa(alt).length >= 3) { kind = 'letter'; grade = 2; }
      else { kind = 'wrong'; grade = 1; }
      const score = grade * 1000 - d;
      if (!best || score > best.score) best = { kind, grade, answer: alt, score };
    }
    return { kind: best.kind, grade: best.grade, script: 'fa', input, answer: best.answer, ops: diff(input, best.answer) };
  }

  // Grades typed pinglish (Farsi -> English cards, the verb drill).
  function checkPinglish(value, pinglish) {
    const input = String(value || '').trim();
    if (!input) return null;
    const right = pinMatches(input, pinglish);
    return { kind: right ? 'exact' : 'wrong', grade: right ? 3 : 1, script: 'latin', input, answer: pinglish, ops: null };
  }

  // ---------- Markup ----------
  const esc = s => F.util.esc(s);
  function diffHTML(ops) {
    return ops.map(o => {
      if (o.t === 'ok') return `<span class="d-ok">${esc(o.s)}</span>`;
      // Spaces and half-spaces are invisible; draw them as a gap mark.
      const gap = /^[\s‌]+$/.test(o.s);
      if (gap) {
        const what = o.s.includes(ZWNJ) ? 'half-space' : 'space';
        return `<span class="d-${o.t} d-gap" title="${o.t === 'miss' ? 'Missing' : 'Extra'} ${what}" aria-label="${o.t === 'miss' ? 'missing' : 'extra'} ${what}"></span>`;
      }
      return `<span class="d-${o.t}">${esc(o.s)}</span>`;
    }).join('');
  }
  const MESSAGES = {
    exact: 'Exactly right',
    spacing: 'Right letters; check the spacing',
    letter: 'One letter off',
    pinglish: 'Right, in pinglish. Type it in Persian script for Good',
    wrong: 'Not quite',
  };
  function resultHTML(r) {
    const cls = r.grade >= 3 ? 'right' : r.grade === 2 ? 'close' : 'wrong';
    let html = `<div class="typed-result ${cls}">`;
    html += `<div class="typed-msg">${MESSAGES[r.kind] || ''}</div>`;
    if (r.script === 'fa' && r.ops && r.kind !== 'exact') {
      html += `<div class="typed-diff" lang="fa" dir="rtl">${diffHTML(r.ops)}</div>`
        + '<div class="typed-legend"><span class="d-ok">kept</span> <span class="d-miss">missing</span> <span class="d-extra">extra</span></div>';
    } else if (r.kind !== 'exact') {
      html += `<div class="typed-you">You typed <bdi>${esc(r.input)}</bdi></div>`;
    }
    return html + '</div>';
  }

  const typed = F.typed = {
    normalizePin, pinMatches, loosePin, canonFa, skeletonFa, diff, lev, checkFarsi, checkPinglish,
    faAlternatives, diffHTML, resultHTML, MESSAGES,

    // opts.fa: the answer is Persian script (input is RTL-aware, Persian font).
    inputHTML(hint, opts) {
      const fa = opts && opts.fa;
      return '<div class="typed-row">'
        + `<input id="typed-input" class="typed-input${fa ? ' fa-input' : ''}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`
        + (fa ? ' dir="auto" lang="fa"' : '')
        + ` enterkeyhint="done" placeholder="${F.util.escAttr(hint)}" value="${F.util.escAttr(S.typedValue)}">`
        + '<button type="button" class="typed-go" data-action="typed-check">Check</button>'
        + '</div>';
    },

    bannerHTML() {
      if (S.typedCheck) return resultHTML(S.typedCheck);
      if (!S.typedResult) return '';
      const ok = S.typedResult === 'right';
      return `<div class="typed-banner ${S.typedResult}">${ok ? 'Correct' : 'You typed “' + F.util.esc(S.typedValue || '—') + '”'}</div>`;
    },

    // Grade what was typed and show the back of the card.
    submit(value) {
      const v = F.app.view();
      S.typedValue = value;
      const r = v.typedCheck ? v.typedCheck(value) : null;
      if (r) {
        S.typedCheck = r;
        S.suggestGrade = r.grade;
        S.typedResult = r.grade >= 2 ? 'right' : 'wrong';
      } else {
        S.typedCheck = null;
        S.typedResult = pinMatches(value, v.typedAnswer ? v.typedAnswer() : '') ? 'right' : 'wrong';
      }
      S.flipped = true;
      F.app.render();
    },

    // Focuses the box once per card (key), so a re-render of the same card
    // does not pop the keyboard again.
    focusInput(key) {
      const input = hasDom && document.getElementById('typed-input');
      if (!input || S.flipped) return;
      if (key !== undefined && key === typed.lastFocusKey) return;
      typed.lastFocusKey = key;
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    },
    lastFocusKey: undefined,

    reset() { S.typedResult = null; S.typedValue = ''; S.typedCheck = null; S.suggestGrade = null; },
  };

  if (hasDom) {
    // Enter in the typed box submits; other keys stay in the box.
    document.addEventListener('keydown', e => {
      if (!e.target || e.target.id !== 'typed-input') return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      typed.submit(e.target.value);
    });
  }

  F.actions.register('typed-check', () => {
    const el = hasDom && document.getElementById('typed-input');
    if (el && el.value.trim()) typed.submit(el.value);
    else F.app.flip();
  });

  F.actions.register('toggle-typed', () => {
    S.typedMode = !S.typedMode;
    const b = hasDom && document.getElementById('typed-btn');
    if (b) b.classList.toggle('active', S.typedMode);
    typed.reset();
    typed.lastFocusKey = undefined;
    S.flipped = false;
    F.app.render();
  });

  F.store.registerPrefs({
    save(p) { p.typedMode = S.typedMode; },
    load(p) { if (typeof p.typedMode === 'boolean') S.typedMode = p.typedMode; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
