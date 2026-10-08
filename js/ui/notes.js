// ui/notes.js: F.notes + view 'notes'. Reads the lesson write-ups
// (lesson.notesFiles, e.g. ALEX-SESSION-35_formatted.md) at runtime and
// renders them with F.md: a lesson list (newest first) with search across
// every file, and a lesson page with a sticky title, contents and jump links.
//
// Also:
//   - a "Lesson notes" link on the back of study cards (hook 'card:rendered'),
//     which opens the card's lesson and highlights its Farsi;
//   - a Today section when F.today exists.
//
// API: F.notes.open(lessonId, {find, from}) opens a lesson (find = text to
// scroll to and highlight). F.notes.lessons() lists lessons with notes,
// newest first. F.notes.search(query) -> Promise<[{lesson, file, unit, heading, snippetHTML}]>.
(function (root) {
  'use strict';
  const F = root.F;
  const U = F.util;
  const $ = id => document.getElementById(id);

  const st = {
    lessonId: null,     // open lesson, or null for the list
    query: '',
    find: null,         // text to highlight once the lesson renders
    findUnit: null,     // {file, unit} from a search result
    from: null,         // view to offer "Back to ..." for
    fromFlipped: false, // the card was showing its back when the notes opened
    token: 0,           // guards async renders
  };

  // ---------- Data ----------
  function lessons() {
    return F.lessons.filter(l => l.notesFiles && l.notesFiles.length).slice().reverse();
  }
  function lessonById(id) { return F.lessons.find(l => l.id === id) || null; }
  function newestWithNotes() { return lessons()[0] || null; }

  const texts = new Map();     // file -> Promise<string>
  const parsed = new Map();    // file -> {html, headings, units}
  function fetchText(file) {
    if (!texts.has(file)) {
      const p = fetch(encodeURI(file), { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.text();
      });
      p.catch(() => texts.delete(file));     // let a later attempt retry
      texts.set(file, p);
    }
    return texts.get(file);
  }
  function parse(file, fileIdx) {
    return fetchText(file).then(src => {
      const key = `${file}#${fileIdx}`;
      if (!parsed.has(key)) parsed.set(key, F.md.render(src, { idPrefix: `nf${fileIdx}` }));
      return parsed.get(key);
    });
  }
  function loadLesson(l) {
    return Promise.all(l.notesFiles.map((f, i) => parse(f, i)));
  }

  // ---------- Search ----------
  // Normalised substring match over every unit (heading, paragraph, list
  // item, table row, code block) of every notes file.
  function snippetHTML(text, start, end) {
    const pad = 48;
    let a = Math.max(0, start - pad);
    let b = Math.min(text.length, end + pad);
    if (a > 0) { const sp = text.indexOf(' ', a); if (sp > -1 && sp < start) a = sp + 1; }
    if (b < text.length) { const sp = text.lastIndexOf(' ', b); if (sp > end) b = sp; }
    // Isolate whole Persian runs, with the match marked inside them: wrapping
    // the text before, in and after the match separately would cut a run in
    // two and the pieces would show in the wrong order.
    const hit = text.slice(start, end);
    if (/[؀-ۿ]/.test(hit) && /[^؀-ۿ‌\s]/.test(hit.replace(/[\s\p{P}]/gu, ''))) {
      // a match that mixes scripts: isolate each part on its own
      const wrap = t => F.md.esc(t).replace(/[؀-ۿ‌]+(?:[ ‌][؀-ۿ‌]+)*/g, r => `<bdi class="fa" lang="fa" dir="rtl">${r}</bdi>`);
      return (a > 0 ? '…' : '') + wrap(text.slice(a, start)) + '<mark>' + wrap(hit) + '</mark>'
        + wrap(text.slice(end, b)) + (b < text.length ? '…' : '');
    }
    const OPEN = '\uE000', CLOSE = '\uE001';
    const raw = text.slice(a, start) + OPEN + text.slice(start, end) + CLOSE + text.slice(end, b);
    const html = F.md.esc(raw)
      .replace(/[\uE000\uE001]*[؀-ۿ‌][؀-ۿ‌\uE000\uE001]*(?:[ ‌\uE000\uE001]+[؀-ۿ‌][؀-ۿ‌\uE000\uE001]*)*/g,
        r => `<bdi class="fa" lang="fa" dir="rtl">${r}</bdi>`)
      .replace(OPEN, '<mark>').replace(CLOSE, '</mark>');
    return (a > 0 ? '…' : '') + html + (b < text.length ? '…' : '');
  }

  function search(query) {
    const q = F.md.norm(query);
    if (!q) return Promise.resolve([]);
    const ls = lessons();
    return Promise.all(ls.map(l => loadLesson(l).catch(() => null))).then(all => {
      const out = [];
      all.forEach((docs, li) => {
        if (!docs) return;
        const l = ls[li];
        const seen = new Set();
        docs.forEach((doc, fi) => {
          doc.units.forEach((u, ui) => {
            const m = F.md.normMap(u.text);
            const at = m.n.indexOf(q);
            if (at < 0) return;
            // 24 and 25 repeat a lot of text: show each line once per lesson.
            if (seen.has(m.n)) return;
            seen.add(m.n);
            const start = m.map[at];
            const end = m.map[at + q.length - 1] + 1;
            out.push({ lesson: l, file: fi, unit: ui, heading: u.heading, isHeading: !!u.isHeading, snippetHTML: snippetHTML(u.text, start, end) });
          });
        });
      });
      return out;
    });
  }

  // ---------- Rendering ----------
  function headerOffset() {
    const h = document.querySelector('header');
    if (!h) return 0;
    const pos = getComputedStyle(h).position;
    return pos === 'sticky' || pos === 'fixed' ? h.getBoundingClientRect().height : 0;
  }

  function lessonTitle(l) { return l.title || ''; }

  // The page head shared with the Read view: title + Stories | Lesson notes.
  function readHeadHTML(active) {
    const segs = F.views.get('read') ? F.app.segmentsHTML([['read', 'Stories'], ['notes', 'Lesson notes']], active) : '';
    return `<div class="page-head read-head"><h1 class="page-title">${F.views.get('read') ? 'Read' : 'Lesson notes'}</h1></div>${segs}`;
  }

  function listHTML() {
    const ls = lessons();
    const without = F.lessons.filter(l => l.kind === 'lesson' && !(l.notesFiles && l.notesFiles.length) && /^\d/.test(l.id));
    let h = '<div class="notes"><div class="notes-list-head">' + readHeadHTML('notes')
      + '<label class="notes-search"><span class="visually-hidden">Search all notes</span>'
      + `<input type="search" id="notes-q" placeholder="Search notes: a Farsi word, pinglish or English" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${U.escAttr(st.query)}">`
      + '</label></div>'
      + '<div id="notes-results" aria-live="polite"></div>'
      + '<ul class="notes-lessons" id="notes-lessons">';
    for (const l of ls) {
      const t = lessonTitle(l);
      h += `<li><button type="button" class="notes-lesson" data-action="notes-open" data-arg="${U.escAttr(l.id)}">`
        + `<span class="notes-lesson-label">${U.esc(l.label || l.id)}</span>`
        + (t ? `<span class="notes-lesson-title">${snippetPlain(t)}</span>` : '')
        + (l.summary ? `<span class="notes-lesson-summary">${F.md.esc(l.summary).replace(/[؀-ۿ‌]+(?:[ ‌][؀-ۿ‌]+)*/g, r => `<span class="fa" lang="fa" dir="rtl">${r}</span>`)}</span>` : '')
        + '</button></li>';
    }
    h += '</ul>';
    if (without.length) {
      h += `<p class="notes-foot">No written notes yet for ${without.map(l => U.esc(l.label || l.id)).join(', ')}.</p>`;
    }
    return h + '</div>';
  }

  function lessonShellHTML(l) {
    const back = st.from && F.views.get(st.from)
      ? `<button type="button" class="notes-back" data-action="notes-return">${U.esc(({ cards: 'Back to card', today: 'Back to Today', read: 'Back to the story', learn: 'Back to learning' })[st.from] || `Back to ${(F.views.get(st.from).tabLabel || F.views.get(st.from).label).toLowerCase()}`)}</button>` : '';
    return '<div class="notes notes-doc">'
      + '<div class="notes-bar" id="notes-bar">'
      + '<button type="button" class="notes-back" data-action="notes-list" aria-label="All notes"><span aria-hidden="true">&#8592;</span> All notes</button>'
      + `<div class="notes-bar-title"><span class="notes-bar-label">${U.esc(l.label || l.id)}</span>`
      + (lessonTitle(l) ? `<span class="notes-bar-sub">${snippetPlain(lessonTitle(l))}</span>` : '') + '</div>'
      + back
      + '</div>'
      + '<div id="notes-body"><p class="notes-status">Loading notes…</p></div>'
      + '</div>';
  }

  function tocHTML(docs, l) {
    const items = [];
    docs.forEach((d, fi) => {
      if (docs.length > 1) items.push(`<li class="notes-toc-file">${U.esc(l.notesFiles[fi].replace(/^ALEX-SESSION-(\d+).*$/, 'Session $1'))}</li>`);
      for (const h of d.headings) {
        if (h.level !== 2) continue;
        items.push(`<li><button type="button" class="notes-toc-link" data-action="notes-jump" data-arg="${h.id}">`
          + F.md.esc(h.text).replace(/[؀-ۿ‌]+(?:[ ‌][؀-ۿ‌]+)*/g, r => `<span class="fa" lang="fa" dir="rtl">${r}</span>`)
          + '</button></li>');
      }
    });
    if (!items.length) return '';
    return `<details class="notes-toc" id="notes-toc"><summary>Contents</summary><ol>${items.join('')}</ol></details>`;
  }

  function renderLesson(l) {
    const token = ++st.token;
    $('card-area').innerHTML = lessonShellHTML(l);
    setTop();
    loadLesson(l).then(docs => {
      if (token !== st.token || F.state.tab !== 'notes') return;
      const body = $('notes-body');
      if (!body) return;
      let h = tocHTML(docs, l);
      docs.forEach((d, fi) => {
        h += `<article class="md" data-file="${fi}">${d.html}</article>`;
      });
      body.innerHTML = h;
      applyFind();
    }, err => {
      if (token !== st.token) return;
      console.warn('notes', err);
      const body = $('notes-body');
      if (body) {
        body.innerHTML = '<div class="notes-status"><p>Could not load these notes.</p>'
          + '<p>They load from the site the first time you open them, then work offline.</p>'
          + `<button type="button" class="notes-retry" data-action="notes-open" data-arg="${U.escAttr(l.id)}">Try again</button></div>`;
      }
    });
  }

  function setTop() {
    const el = document.querySelector('.notes-doc');
    if (el) el.style.setProperty('--notes-top', `${Math.round(headerOffset())}px`);
  }

  function scrollToEl(el, smooth) {
    if (!el) return;
    const bar = $('notes-bar');
    const off = headerOffset() + (bar ? bar.getBoundingClientRect().height : 0) + 24;
    const y = el.getBoundingClientRect().top + root.scrollY - off;
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top: Math.max(0, y), behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  function flash(el) {
    el.classList.remove('notes-flash');
    void el.offsetWidth;
    el.classList.add('notes-flash');
  }

  // Wrap the first literal occurrence of `needle` inside el in <mark>.
  function markIn(el, needle) {
    if (!needle) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nn = F.md.norm(needle);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const m = F.md.normMap(n.nodeValue);
      const at = m.n.indexOf(nn);
      if (at < 0) continue;
      const start = m.map[at];
      const end = m.map[at + nn.length - 1] + 1;
      const range = document.createRange();
      range.setStart(n, start);
      range.setEnd(n, end);
      const mark = document.createElement('mark');
      mark.className = 'notes-mark';
      range.surroundContents(mark);
      return true;
    }
    return false;
  }

  // The Farsi of a card can be "a / b" or carry <br>: try the whole thing,
  // then each part.
  function candidates(text) {
    const plain = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = plain.split(/\s*[\/،,]\s*/).map(s => s.trim()).filter(Boolean);
    return [...new Set([plain, ...parts])].filter(s => F.md.norm(s).length);
  }

  // Find the best unit for a card's Farsi: a table cell, heading or line equal
  // to it, else the first unit that contains it.
  function locate(docs, text) {
    for (const c of candidates(text)) {
      const q = F.md.norm(c);
      for (let fi = 0; fi < docs.length; fi++) {
        const units = docs[fi].units;
        for (let ui = 0; ui < units.length; ui++) {
          const u = units[ui];
          const exact = u.cells ? u.cells.some(x => F.md.norm(x) === q) : F.md.norm(u.text).split(/ — | - |\n/).some(x => x.trim() === q);
          if (exact) return { file: fi, unit: ui, needle: c };
        }
      }
      for (let fi = 0; fi < docs.length; fi++) {
        const ui = docs[fi].units.findIndex(u => F.md.norm(u.text).includes(q));
        if (ui > -1) return { file: fi, unit: ui, needle: c };
      }
    }
    return null;
  }

  function applyFind() {
    const l = lessonById(st.lessonId);
    if (!l) return;
    let target = null;
    let needle = null;
    if (st.findUnit) {
      target = st.findUnit;
      needle = st.findUnit.needle;
    } else if (st.find) {
      const docs = l.notesFiles.map((f, i) => parsed.get(`${f}#${i}`)).filter(Boolean);
      target = locate(docs, st.find);
      needle = target && target.needle;
      if (!target) showNotice(`“${st.find.replace(/<[^>]*>/g, ' ').trim()}” isn't written out in these notes.`);
    }
    st.find = null;
    st.findUnit = null;
    if (!target) { root.scrollTo(0, 0); return; }
    const el = document.querySelector(`.md[data-file="${target.file}"] [data-u="${target.unit}"]`);
    if (!el) return;
    markIn(el, needle);
    scrollToEl(el, false);
    // A table row may be wider than the screen: bring the match into view.
    const wrap = el.closest('.md-table-wrap');
    const mark = el.querySelector('.notes-mark');
    if (wrap && mark) {
      const wr = wrap.getBoundingClientRect();
      const mr = mark.getBoundingClientRect();
      if (mr.left < wr.left || mr.right > wr.right) wrap.scrollLeft += mr.left - wr.left - (wr.width - mr.width) / 2;
    }
    flash(el);
  }

  function showNotice(msg) {
    const body = $('notes-body');
    if (!body) return;
    body.insertAdjacentHTML('afterbegin', `<p class="notes-notice">${F.md.esc(msg)}</p>`);
  }

  // Search results go in their own container so typing never redraws the input.
  let searchTimer = null;
  let searchToken = 0;
  function runSearch() {
    const box = $('notes-results');
    const list = $('notes-lessons');
    if (!box) return;
    const q = st.query.trim();
    const qn = F.md.norm(q);
    if (!qn || (qn.length < 2 && !F.md.hasPersian(q))) {
      box.innerHTML = '';
      if (list) list.hidden = false;
      return;
    }
    if (list) list.hidden = true;
    const token = ++searchToken;
    if (!box.innerHTML) box.innerHTML = '<p class="notes-status">Searching…</p>';
    search(q).then(res => {
      if (token !== searchToken || !$('notes-results')) return;
      if (!res.length) {
        box.innerHTML = `<p class="notes-status">Nothing in the notes matches “${F.md.esc(q)}”.</p>`;
        return;
      }
      const max = 60;
      let h = `<p class="notes-count">${res.length} ${U.plural(res.length, 'match', 'matches')}${res.length > max ? `, showing the first ${max}` : ''}</p><ul class="notes-hits">`;
      res.slice(0, max).forEach((r, i) => {
        h += `<li><button type="button" class="notes-hit" data-action="notes-hit" data-arg="${i}">`
          + `<span class="notes-hit-where">${U.esc(r.lesson.label || r.lesson.id)}${r.heading && !r.isHeading ? ' · ' + snippetPlain(r.heading) : ''}</span>`
          + `<span class="notes-hit-text">${r.snippetHTML}</span></button></li>`;
      });
      box.innerHTML = h + '</ul>';
      lastResults = res;
    }, () => {
      if (token === searchToken && $('notes-results')) box.innerHTML = '<p class="notes-status">Could not load the notes to search them.</p>';
    });
  }
  let lastResults = [];
  function snippetPlain(s) {
    return F.md.esc(s).replace(/[؀-ۿ‌]+(?:[ ‌][؀-ۿ‌]+)*/g, r => `<span class="fa" lang="fa" dir="rtl">${r}</span>`);
  }

  function bindList() {
    const input = $('notes-q');
    if (!input) return;
    input.addEventListener('input', () => {
      st.query = input.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 160);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; st.query = ''; runSearch(); }
      if (e.key === 'Enter') input.blur();
    });
    if (st.query) runSearch();
  }

  function render() {
    $('scope-bar').innerHTML = '';
    $('score-row').innerHTML = '';
    $('card-count').innerHTML = '';
    $('nav-pos').textContent = '';
    const l = st.lessonId && lessonById(st.lessonId);
    if (l && l.notesFiles.length) renderLesson(l);
    else {
      st.lessonId = null;
      st.token++;
      $('card-area').innerHTML = listHTML();
      bindList();
    }
  }

  // ---------- Public ----------
  function open(id, opts) {
    opts = opts || {};
    const l = lessonById(id);
    if (!l || !l.notesFiles.length) return;
    st.lessonId = id;
    // Opened from the back of a card: "Back to card" brings it back flipped.
    if (opts.from !== undefined) st.fromFlipped = opts.from === 'cards' && F.state.tab === 'cards' && !!F.state.flipped;
    st.find = opts.find || null;
    st.findUnit = opts.unit || null;
    if (opts.from !== undefined) st.from = opts.from;
    if (F.state.tab === 'notes') F.app.render();
    else F.app.setView('notes');
    if (!st.find && !st.findUnit) root.scrollTo(0, 0);
  }

  F.notes = { state: st, open, lessons, newestWithNotes, search, locate, candidates, readHeadHTML };

  // ---------- Actions ----------
  const A = F.actions;
  A.register('notes-open', el => {
    const from = F.state.tab === 'notes' ? st.from : F.state.tab;
    open(el.dataset.arg, { find: el.dataset.find || null, from: from === 'notes' ? null : from });
  });
  A.register('notes-list', () => {
    st.lessonId = null;
    F.app.render();
    root.scrollTo(0, 0);
  });
  A.register('notes-return', () => {
    const to = st.from;
    const flipped = st.fromFlipped;
    st.from = null;
    st.fromFlipped = false;
    if (!to || !F.views.get(to)) return;
    F.app.setView(to);
    if (flipped && to === 'cards' && F.study && F.study.current()) {
      F.state.flipped = true;
      F.app.render();
    }
  });
  A.register('notes-jump', el => {
    const t = document.getElementById(el.dataset.arg);
    const toc = $('notes-toc');
    if (toc) toc.open = false;
    scrollToEl(t, true);
    if (t) flash(t);
  });
  A.register('notes-hit', el => {
    const r = lastResults[Number(el.dataset.arg)];
    if (!r) return;
    open(r.lesson.id, { unit: { file: r.file, unit: r.unit, needle: st.query.trim() } });
  });

  // ---------- View ----------
  F.views.register('notes', {
    label: 'Lesson notes',
    order: 31,
    tab: false,          // reached from Read (its "Lesson notes" segment), cards and Today
    navAs: 'read',
    page: true,
    hideActions: true,
    init() { registerToday(); },
    render,
    enter() { st.token++; },
    leave() { st.token++; st.from = null; },
    syncChrome() {
      $('mastered-btn').hidden = true;
      $('newlimit-btn').hidden = true;
      $('score-row').style.display = 'none';
    },
    shortcutsHTML() { return ''; },
  });

  F.store.registerPrefs({
    save(p) { p.notesLesson = st.lessonId; },
    load(p) { if (typeof p.notesLesson === 'string' && lessonById(p.notesLesson)) st.lessonId = p.notesLesson; },
  });

  root.addEventListener('resize', () => { if (F.state.tab === 'notes') setTop(); });

  // ---------- Card back link ----------
  F.hooks.on('card:rendered', ({ card, back, view }) => {
    if (!card || !back || (view && view !== 'cards')) return;
    const l = lessonById(card.session);
    if (!l || !l.notesFiles || !l.notesFiles.length) return;
    if (back.querySelector('.notes-link')) return;
    const find = card.farsi || '';
    const html = `<button type="button" class="notes-link" data-action="notes-open" data-arg="${U.escAttr(l.id)}"`
      + `${find ? ` data-find="${U.escAttr(String(find).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())}"` : ''}>Lesson notes</button>`;
    const host = back.querySelector('.back-content') || back;
    host.insertAdjacentHTML('beforeend', html);
  });

  // ---------- Today section ----------
  let todayDone = false;
  function registerToday() {
    if (todayDone || !F.today || typeof F.today.registerSection !== 'function') return;
    todayDone = true;
    const html = () => {
      const l = newestWithNotes();
      if (!l) return '';
      return '<div class="t-row"><span class="t-row-label">Lesson notes</span></div>'
        + `<div class="t-sub">${U.esc(l.label || l.id)}${lessonTitle(l) ? ' · ' + snippetPlain(lessonTitle(l)) : ''}: your teacher’s write-up, searchable.</div>`
        + `<div class="t-acts"><button type="button" class="btn-link" data-action="notes-open" data-arg="${U.escAttr(l.id)}">Read the notes</button>`
        + '<button type="button" class="btn-link" data-action="set-view" data-arg="notes">All lessons</button></div>';
    };
    F.today.registerSection({
      id: 'notes',
      order: 50,
      title: 'Lesson notes',
      visible: () => !!newestWithNotes(),
      html,
      render(el) { el.innerHTML = html(); },
    });
  }
  registerToday();
  F.hooks.on('boot', registerToday);
})(window);
