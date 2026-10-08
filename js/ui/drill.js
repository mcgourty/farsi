// ui/drill.js: the verb trainer view ("verbs"): browse conjugation tables, or
// run the conjugation drill (produce a form; scored right/wrong per
// verb|tense|person in store.drill).
(function (root) {
  'use strict';
  const F = root.F;
  const S = F.state;
  const V = F.verbs;
  const $ = id => document.getElementById(id);

  const st = {
    mode: 'browse',          // 'browse' | 'drill'
    tenses: new Set(V.TENSES.map(t => t.id)),
    verbs: new Set(V.VERBS.map(v => v.id)),
    persons: new Set([0, 1, 2, 3, 4, 5]),
    vIdx: 0,
    browseIds: null,         // shuffled browse order
    prompt: null,
    queue: [],
    qIdx: 0,
    right: 0,
    wrong: 0,
  };

  const scores = () => F.store.data.drill;

  function browseVerbs() { return V.VERBS.filter(v => st.verbs.has(v.id)); }

  function browseList() {
    const selected = browseVerbs();
    if (!S.shuffled) return selected;
    const sel = new Set(selected.map(v => v.id));
    if (!st.browseIds || st.browseIds.some(id => !sel.has(id)) || selected.some(v => !st.browseIds.includes(v.id))) {
      st.browseIds = selected.map(v => v.id);
      F.util.shuffle(st.browseIds);
    }
    return st.browseIds.map(id => V.byId(id)).filter(Boolean);
  }

  function allDrillCombos() {
    const combos = [];
    for (const v of browseVerbs()) {
      for (const t of V.TENSES) {
        if (!st.tenses.has(t.id)) continue;
        if (t.id === 'continuous' && v.noCont) continue;
        if ((t.id === 'imperative' || t.id === 'impneg') && !v.imp) continue;
        const pis = (t.id === 'imperative' || t.id === 'impneg') ? [1, 4] : [0, 1, 2, 3, 4, 5];
        for (const pi of pis) {
          if (!st.persons.has(pi)) continue;
          combos.push({ v, tense: t.id, pi });
        }
      }
    }
    return combos;
  }

  function rebuildDrillQueue() {
    const combos = allDrillCombos();
    if (S.shuffled) F.util.shuffle(combos);
    else {
      combos.sort((a, b) => {
        const x = scores()[V.drillKey(a)] || { r: 0, w: 0 };
        const y = scores()[V.drillKey(b)] || { r: 0, w: 0 };
        return (y.w - x.w) || (x.r - y.r);
      });
    }
    st.queue = combos;
    st.qIdx = 0;
    st.prompt = st.queue[0] || null;
    S.flipped = false;
    F.typed.reset();
  }

  // ---------- Rendering ----------
  function conjCell(f) {
    return f
      ? `<span class="fa">${f.fa}</span><span class="pin">${f.pin}</span>`
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
    return `<div class="conj-imp">Do it! <strong>${v.imp.sg}</strong> <span class="fa-inline">${v.imp.sgFa}</span> &middot; <strong>${v.imp.pl}</strong> <span class="fa-inline">${v.imp.plFa}</span><br>Don't! <strong>${v.imp.negSg}</strong> <span class="fa-inline">${v.imp.negSgFa}</span> &middot; <strong>${v.imp.negPl}</strong> <span class="fa-inline">${v.imp.negPlFa}</span></div>`;
  }

  function renderBrowse() {
    const area = $('card-area');
    const list = browseList();
    if (!list.length) {
      area.innerHTML = '<div class="empty-state"><h2>No verbs selected</h2><p>Pick some verbs above</p></div>';
      $('nav-pos').textContent = '0 / 0';
      $('prev-btn').disabled = true;
      $('next-btn').disabled = true;
      $('card-count').innerHTML = '<strong>0</strong> verbs';
      $('progress-fill').style.width = '0%';
      $('progress-text').textContent = '0/0';
      return;
    }
    if (st.vIdx >= list.length) st.vIdx = list.length - 1;
    if (st.vIdx < 0) st.vIdx = 0;
    const v = list[st.vIdx];
    area.innerHTML = `<div class="card-wrapper" style="min-height:800px" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card" style="min-height:800px">
    <div class="card-face card-front">
      <span class="card-tag">VERB</span>
      <div class="front-content">
        <div class="farsi-big">${v.fa}</div>
        <div class="drill-verb-pin">${v.pin}</div>
        <div class="drill-verb-en">${v.en}</div>
      </div>
      <span class="tap-hint">tap for conjugations</span>
    </div>
    <div class="card-face card-back" style="justify-content:flex-start">
      <span class="card-tag">VERB</span>
      <div class="back-content" style="margin-top:16px">
        <div class="pinglish" style="margin-bottom:0">${v.pin} — ${v.en}</div>
        ${conjTableHTML(v)}
        ${pastTableHTML(v)}
        ${impHTML(v)}
      </div>
    </div>
  </div></div>`;
    $('nav-pos').textContent = `${st.vIdx + 1} / ${list.length}`;
    $('prev-btn').disabled = st.vIdx === 0;
    $('next-btn').disabled = st.vIdx >= list.length - 1;
    $('card-count').innerHTML = `<strong>${list.length}</strong> verbs`;
    $('progress-fill').style.width = ((st.vIdx + 1) / list.length * 100) + '%';
    $('progress-text').textContent = `${st.vIdx + 1}/${list.length}`;
  }

  function renderDrill() {
    const area = $('card-area');
    if (!st.queue.length && !st.prompt) rebuildDrillQueue();
    if (!st.prompt) {
      const tot = st.right + st.wrong;
      if (tot) {
        area.innerHTML = `<div class="empty-state"><h2>Done for now</h2><p><strong>${st.right}</strong> right &middot; ${st.wrong} again</p>`
          + '<p><button type="button" class="action-btn" data-action="drill-again">Drill again</button></p></div>';
        $('progress-fill').style.width = '100%';
        $('progress-text').textContent = `${tot}`;
      } else {
        area.innerHTML = '<div class="empty-state"><h2>Nothing to drill</h2><p>Select at least one verb, tense, and person above</p></div>';
        $('progress-fill').style.width = '0%';
        $('progress-text').textContent = '—';
      }
      $('nav-pos').textContent = '0 / 0';
      $('prev-btn').disabled = true;
      $('next-btn').disabled = true;
      $('card-count').innerHTML = tot
        ? `<strong>${st.right}</strong> right &middot; <span style="color:var(--red)">${st.wrong} again</span>`
        : '';
      return;
    }
    if (st.qIdx >= st.queue.length) st.qIdx = st.queue.length - 1;
    if (st.qIdx < 0) st.qIdx = 0;
    st.prompt = st.queue[st.qIdx];
    const d = st.prompt, v = d.v;
    const t = V.TENSES.find(x => x.id === d.tense);
    const personLabel = V.personLabel(d.tense, d.pi);
    const ans = V.drillAnswer(d);
    area.innerHTML = `<div class="card-wrapper" data-action="flip"><div class="card${S.flipped ? ' flipped' : ''}" id="card">
    <div class="card-face card-front" id="card-front">
      <span class="card-tag">VERB DRILL</span>
      <div class="front-content">
        <div class="farsi-big" style="font-size:2.4rem">${v.fa}</div>
        <div class="drill-verb-pin">${v.pin}</div>
        <div class="drill-verb-en">${v.en}</div>
        <div class="drill-chips">
          <span class="chip person">${personLabel}</span>
          <span class="chip tense">${t.desc}</span>
        </div>
      </div>
      <span class="tap-hint">tap for answer</span>
    </div>
    <div class="card-face card-back" id="card-back">
      <span class="card-tag">VERB DRILL</span>
      <div class="back-content">
        <div class="farsi-answer">${ans.fa}</div>
        <div class="pinglish">${ans.pin}</div>
        <div class="meaning" style="font-size:1rem;color:var(--text-dim);font-weight:400">${personLabel} &middot; ${t.desc}</div>
        <div class="breakdown">${V.drillBreakdown(d)}</div>
      </div>
    </div>
  </div></div>`;

    const front = $('card-front');
    const back = $('card-back');
    if (S.typedMode) {
      front.insertAdjacentHTML('beforeend', F.typed.inputHTML('type it in pinglish…'));
      back.insertAdjacentHTML('beforeend', F.typed.bannerHTML());
    }
    if (F.audio.ready() && ans.fa) back.insertAdjacentHTML('beforeend', F.audio.buttonHTML());
    F.hooks.emit('card:rendered', { drill: d, front, back, flipped: S.flipped, view: 'verbs' });

    $('nav-pos').textContent = `${st.qIdx + 1} / ${st.queue.length}`;
    $('prev-btn').disabled = st.qIdx === 0;
    $('next-btn').disabled = st.qIdx >= st.queue.length - 1;
    $('card-count').innerHTML = `<strong>${st.queue.length}</strong> left &middot; <strong>${st.right}</strong> right &middot; <span style="color:var(--red)">${st.wrong} again</span>`
      + (S.shuffled ? ' &middot; shuffled' : ' &middot; weak first');
    const total = st.right + st.wrong + st.queue.length;
    const pct = total ? Math.round((st.right + st.wrong) / total * 100) : 0;
    $('progress-fill').style.width = pct + '%';
    $('progress-text').textContent = `${st.right + st.wrong}/${total}`;
    F.typed.focusInput();
    if (S.flipped) F.audio.maybeSpeak();
  }

  function renderScoreRow() {
    $('score-row').innerHTML = st.mode === 'drill' && st.prompt
      ? `<button class="score-btn again${S.typedResult === 'wrong' ? ' suggest' : ''}" data-action="drill-mark" data-arg="0">Again</button>`
        + `<button class="score-btn know${S.typedResult === 'right' ? ' suggest' : ''}" data-action="drill-mark" data-arg="1">Got it</button>`
      : '';
  }

  // Drill keeps the simple right/wrong scoring.
  function markCard(known) {
    if (st.mode !== 'drill' || !st.prompt) return;
    if (!S.flipped) { F.app.flip(); return; }
    const c = st.prompt;
    const k = V.drillKey(c);
    const sc = scores()[k] || { r: 0, w: 0 };
    if (known) { sc.r++; st.right++; } else { sc.w++; st.wrong++; }
    scores()[k] = sc;
    F.store.saveSoon();
    st.queue.splice(st.qIdx, 1);
    if (!known) {
      const pos = Math.min(st.queue.length, st.qIdx + 2 + Math.floor(Math.random() * 3));
      st.queue.splice(pos, 0, c);
    }
    if (st.qIdx >= st.queue.length) st.qIdx = 0;
    st.prompt = st.queue[st.qIdx] || null;
    S.flipped = false;
    F.typed.reset();
    F.hooks.emit('drill:marked', { prompt: c, known });
    F.app.render();
  }

  function resetScores() {
    const combos = allDrillCombos();
    const hasSaved = combos.some(c => scores()[V.drillKey(c)]);
    if (hasSaved && !root.confirm('Reset conjugation drill scores for the selected verbs?')) return;
    for (const c of combos) delete scores()[V.drillKey(c)];
    F.store.saveSoon();
    st.right = 0;
    st.wrong = 0;
    rebuildDrillQueue();
    F.app.render();
  }

  F.actions.register('drill-mark', el => markCard(el.dataset.arg === '1'));
  F.actions.register('drill-again', () => { rebuildDrillQueue(); F.app.render(); });
  F.hooks.on('shuffle:changed', () => { st.browseIds = null; });

  F.store.registerPrefs({
    save(p) {
      p.vtMode = st.mode;
      p.tenses = [...st.tenses];
      p.knownTenses = V.TENSES.map(t => t.id);
      p.persons = [...st.persons];
      p.verbsOff = V.VERBS.filter(v => !st.verbs.has(v.id)).map(v => v.id);
    },
    load(p) {
      if (p.vtMode === 'drill') st.mode = 'drill';
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
      if (Array.isArray(p.verbsOff)) for (const id of p.verbsOff) st.verbs.delete(id);
    },
  });

  F.drill = { state: st, rebuildDrillQueue, allDrillCombos, browseList, markCard };

  F.views.register('verbs', {
    label: 'Verb trainer',
    order: 20,
    panel: 'vt-filters',
    init() { if (S.tab === 'verbs' && st.mode === 'drill') rebuildDrillQueue(); },
    enter() { if (st.mode === 'drill' && !st.queue.length) rebuildDrillQueue(); },
    render() {
      if (st.mode === 'browse') renderBrowse(); else renderDrill();
      $('scope-bar').innerHTML = '';
    },
    renderScoreRow,
    syncChrome() {
      $('mastered-btn').hidden = true;
      $('newlimit-btn').hidden = true;
      $('score-row').style.display = st.mode === 'drill' ? '' : 'none';
    },
    shortcutsHTML() {
      return '<span><kbd>Space</kbd> show answer &nbsp; <kbd>1</kbd> again &nbsp; <kbd>2</kbd> got it &nbsp; <kbd>&#8592;</kbd><kbd>&#8594;</kbd> skip'
        + (F.audio.ready() ? ' &nbsp; <kbd>s</kbd> hear it' : '') + '</span>';
    },
    next() {
      if (st.mode === 'browse') {
        if (st.vIdx < browseList().length - 1) { st.vIdx++; S.flipped = false; F.app.render(); }
      } else if (st.qIdx < st.queue.length - 1) {
        st.qIdx++; st.prompt = st.queue[st.qIdx]; S.flipped = false; F.typed.reset(); F.app.render();
      }
    },
    prev() {
      if (st.mode === 'browse' && st.vIdx > 0) { st.vIdx--; S.flipped = false; F.app.render(); }
      else if (st.mode === 'drill' && st.qIdx > 0) {
        st.qIdx--; st.prompt = st.queue[st.qIdx]; S.flipped = false; F.typed.reset(); F.app.render();
      }
    },
    onShuffle() {
      if (st.mode === 'drill') rebuildDrillQueue();
      F.app.render();
    },
    reset: resetScores,
    typedActive() { return S.typedMode && st.mode === 'drill' && !!st.prompt; },
    typedAnswer() {
      if (st.mode !== 'drill' || !st.prompt) return '';
      const ans = V.drillAnswer(st.prompt);
      return ans ? ans.pin : '';
    },
    speech() {
      if (st.mode === 'drill' && st.prompt) {
        const ans = V.drillAnswer(st.prompt);
        return { text: ans ? ans.fa : '', token: V.drillKey(st.prompt) + '|' + st.right + '|' + st.wrong };
      }
      if (st.mode === 'browse') {
        const v = browseList()[st.vIdx];
        return v ? { text: v.fa, token: 'browse|' + v.id } : null;
      }
      return null;
    },
    keydown(e) {
      if (e.key === '1') markCard(false);
      if (e.key === '2') markCard(true);
    },
  });
})(window);
