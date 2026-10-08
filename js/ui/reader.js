// reader.js: view 'read', graded practice stories (lessons/stories.js).
//
// List: stories grouped by lesson, newest first; stories for a lesson ahead of
// the newest one you've studied are marked. Reading: one sentence per block;
// tap a sentence for its English, long-press (or the toggle) for pinglish, tap
// a word for its gloss from the deck. Words are matched to deck items with
// js/lemma.js (the same lemmatiser tools/coverage.js uses).
//
// Word status, from F.store srs for the cards of the matched item(s):
//   known    - a card is mastered: in review with stability >= F.fsrs.MATURE_DAYS (21 days),
//              the same rule as "Hide mastered"
//   learning - a card has been reviewed but isn't mastered yet
//   new      - the word is in the deck but none of its cards has been studied   (dotted underline)
//   unseen   - not in the deck at all                                          (dotted underline)
//   glossed  - not in the deck, glossed by the story (story.unknown)            (solid underline)
//   free     - not a deck item but a name or everyday function word: counts as known
// Coverage on screen = (known + free) / all Persian tokens.
//
// Prefs (F.store.registerPrefs): storiesRead {storyId: timestamp}, readerPin (bool).
// Today section (if F.today exists): "Read · <an unread story for the newest lesson>".
(function (root) {
  'use strict';
  const F = root.F;
  const L = F.lemma;
  const { esc, escAttr } = F.util;
  const $ = id => document.getElementById(id);

  const st = F.reader = {
    state: { storyId: null, showPin: false, showEn: false, read: {}, revealed: new Set(), pinLines: new Set(), gloss: null },
    stories: () => F.stories || [],
    story: id => (F.stories || []).find(s => s.id === id) || null,
    analyse: (story) => analyseStory(story),
    lookup: token => lookup(token),     // deck entries for a word: {items, verbs, phrases, base}
    status: (token, story) => statusOf(token, story),
    newestStudiedIndex: () => newestStudiedIndex(),
    isRead: id => !!st.state.read[id],
    open: id => openStory(id),
  };
  const S = st.state;

  // ---------- Deck index (built lazily, rebuilt if the deck is rebuilt) ----------
  let idx = null;
  function index() {
    if (idx && idx.cardsRef === F.cards.all) return idx;
    const deck = L.deckFromF(F);
    const lex = L.buildLexicon(deck, null, {});
    const sessionOrder = new Map(F.cards.sessions.map((s, i) => [s.id, i]));
    const single = new Map();   // word key -> [{item, session}]
    const multi = new Map();    // 'k1 k2 ...' -> [{item, session}]
    const byFa = new Map();     // key(fa) -> [{item, session}] (for verb infinitives)
    const inPhrase = new Map(); // word key -> multi-word items that contain it
    const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).some(x => x.item === v.item)) m.get(k).push(v); };
    for (const lesson of F.lessons) {
      if (lesson.id === 'alphabet') continue;
      for (const item of lesson.items) {
        if (item.type === 'letter') continue;
        const ref = { item, session: lesson.id, label: lesson.label || lesson.id };
        for (const alt of L.cardTexts(item)) {
          const ws = L.wordsOf(alt);
          if (ws.length > 1) for (const w of ws) for (const x of [w, ...L.deriveBases(w)]) put(inPhrase, x, ref);
        }
        if (item.type === 'story') continue;
        put(byFa, L.key(item.fa), ref);
        for (const alt of L.cardTexts(item)) {
          const ws = L.wordsOf(alt);
          if (ws.length === 1) put(single, ws[0], ref);
          else if (ws.length > 1 && ws.length <= 4 && item.type !== 'phrases') put(multi, ws.join(' '), ref);
          if (item.type === 'vocabulary') for (const w of L.pinLemmas(alt, item.pin)) if (w.length >= 3 || ws.length === 1) put(single, w, ref);
          if (ws.length === 1) for (const w of L.deriveBases(ws[0])) if (!single.has(w)) put(single, w, ref);
        }
      }
    }
    // Phrases and grammar only count as a word's entry when nothing in vocabulary matches.
    for (const [k, refs] of single) {
      const vocab = refs.filter(r => r.item.type === 'vocabulary');
      if (vocab.length) single.set(k, vocab);
    }
    const cardsByItem = new Map();
    const cardsByVerb = new Map();
    for (const c of F.cards.all) {
      if (!cardsByItem.has(c.itemId)) cardsByItem.set(c.itemId, []);
      cardsByItem.get(c.itemId).push(c.id);
      const m = /^verb\.([^.]+)\./.exec(c.itemId);
      if (m) { if (!cardsByVerb.has(m[1])) cardsByVerb.set(m[1], []); cardsByVerb.get(m[1]).push(c.id); }
    }
    const fnWords = new Set(L.FUNCTION_WORDS.map(L.key));
    idx = { cardsRef: F.cards.all, lex, single, multi, byFa, inPhrase, fnWords, cardsByItem, cardsByVerb, sessionOrder, memo: new Map() };
    return idx;
  }

  // Deck entries for one token: exact item > literal verb form > the word as
  // it stands inside a phrase (when the alternative is a base of 1-2 letters:
  // نون is bread, not نو + ن) > item for a stripped base (کیفش -> کیف) >
  // verb by stem (رفتم -> رفتن) > a phrase containing its base.
  function lookup(token) {
    const ix = index();
    const k = L.key(token);
    if (ix.memo.has(k)) return ix.memo.get(k);
    const res = { key: k, items: [], verbs: [], phrases: [] };
    const verbsOf = () => {
      const vs = L.verbCandidates(k, ix.lex).filter((v, i, a) => a.indexOf(v) === i);
      // a lone form is the simple verb, not a compound (داره: داشتن, not دوست داشتن)
      const simple = vs.filter(v => !v.pre);
      return simple.length ? simple : vs;
    };
    if (ix.single.has(k)) res.items = ix.single.get(k);
    else if (ix.lex.formMap.has(k)) res.verbs = verbsOf();
    else {
      for (const c of L.nounCandidates(k)) {
        if (c !== k && ix.single.has(c)) {
          if (c.length < 3 && ix.inPhrase.has(k)) break;
          res.items = ix.single.get(c); res.base = c; break;
        }
      }
      if (!res.items.length && !ix.inPhrase.has(k)) res.verbs = verbsOf();
    }
    // a verb's entry in the deck: its vocabulary item (infinitive) if any
    for (const v of res.verbs) {
      for (const ref of ix.byFa.get(L.key(v.fa)) || []) if (!res.items.includes(ref)) res.items.push(ref);
    }
    // a word taught only inside phrases or story cards: those cards stand for it
    if (!res.items.length && !res.verbs.length) {
      for (const c of L.nounCandidates(k)) if (ix.inPhrase.has(c)) { res.phrases = ix.inPhrase.get(c); break; }
    }
    ix.memo.set(k, res);
    return res;
  }

  function cardIdsFor(res) {
    const ix = index();
    const ids = [];
    for (const r of res.items.concat(res.phrases)) ids.push(...(ix.cardsByItem.get(r.item.id) || []));
    for (const v of res.verbs) if (!/^vocab:/.test(v.id)) ids.push(...(ix.cardsByVerb.get(v.id) || []));
    return ids;
  }

  function statusOf(token, story) {
    const k = L.key(token);
    if (story && (story.unknown || []).some(u => L.key(u.fa) === k)) return 'glossed';
    // everyday words (و, نه, خیلی ...) need no card, even when a deck word shares the spelling
    if (FUNCTION_GLOSS[k]) return 'free';
    const res = lookup(token);
    // names and function words that appear only inside phrases need no card of their own
    if (!res.items.length && !res.verbs.length && isFree(token)) return 'free';
    const ids = cardIdsFor(res);
    if (!ids.length) return isFree(token) ? 'free' : 'unseen';
    let seen = false;
    for (const id of ids) {
      const s = F.store.srs(id);
      if (!s) continue;
      if (s.state === 'review' && s.s >= F.fsrs.MATURE_DAYS) return 'known';
      seen = true;
    }
    return seen ? 'learning' : 'new';
  }

  // Names and everyday function words (and their suffixed forms) need no card.
  function isFree(token) {
    const ix = index();
    const r = L.classify(token, ix.lex);
    if (r.known && (r.why === 'name' || r.why === 'non-Persian')) return true;
    for (const c of L.nounCandidates(L.key(token))) if (ix.fnWords.has(c) || ix.lex.names.has(c)) return true;
    return false;
  }

  function analyseStory(story) {
    const counts = { total: 0, known: 0, free: 0, learning: 0, new: 0, unseen: 0, glossed: 0 };
    for (const line of story.lines) {
      for (const seg of L.segments(line.fa)) {
        if (!seg.word) continue;
        counts.total++;
        counts[statusOf(seg.text, story)]++;
      }
    }
    const pct = n => (counts.total ? Math.round(n / counts.total * 100) : 0);
    counts.knownPct = pct(counts.known + counts.free);
    counts.learningPct = pct(counts.learning);
    return counts;
  }

  // ---------- Progress through the lessons ----------
  function newestStudiedIndex() {
    const ix = index();
    const studied = new Set();
    for (const c of F.cards.all) if (!studied.has(c.session) && F.store.srs(c.id)) studied.add(c.session);
    let best = -1;
    F.cards.sessions.forEach((s, i) => { if (s.kind === 'lesson' && studied.has(s.id)) best = Math.max(best, i); });
    return best < 0 ? (ix.sessionOrder.get((F.cards.sessions.find(s => s.kind === 'lesson') || {}).id) ?? -1) : best;
  }
  const lessonOf = id => F.lessons.find(l => l.id === id) || null;

  // ---------- List ----------
  function renderList() {
    const ix = index();
    const newest = newestStudiedIndex();
    const groups = new Map();
    for (const s of st.stories()) {
      if (!groups.has(s.session)) groups.set(s.session, []);
      groups.get(s.session).push(s);
    }
    const order = [...groups.keys()].sort((a, b) => (ix.sessionOrder.get(b) ?? -1) - (ix.sessionOrder.get(a) ?? -1));
    const readCount = st.stories().filter(s => S.read[s.id]).length;
    const head = F.notes && F.notes.readHeadHTML ? F.notes.readHeadHTML('read') : '<div class="page-head"><h1 class="page-title">Read</h1></div>';
    let html = `<div class="rd-list">
      <div class="rd-intro">
        ${head}
        <h2>Practice stories</h2>
        <p>Short stories written for you from the words in your lessons. They aren't from your teacher. Tap a word for its meaning, tap a sentence for its English.</p>
        <p class="rd-intro-meta">${readCount} of ${st.stories().length} read</p>
      </div>`;
    if (!order.length) html += '<div class="empty-state"><h2>No stories yet</h2><p>Stories are added with each lesson.</p></div>';
    for (const sid of order) {
      const lesson = lessonOf(sid);
      const ahead = (ix.sessionOrder.get(sid) ?? -1) > newest;
      html += `<section class="rd-group">
        <h3 class="rd-group-h"><span>${esc(lesson ? lesson.label : 'Session ' + sid)}</span>${lesson && lesson.title ? `<span class="rd-group-t">${esc(lesson.title)}</span>` : ''}${ahead ? '<span class="rd-badge rd-badge-ahead">Ahead of you</span>' : ''}</h3>`;
      for (const s of groups.get(sid)) {
        const a = analyseStory(s);
        const read = !!S.read[s.id];
        html += `<button type="button" class="rd-row${read ? ' is-read' : ''}" data-action="read-open" data-arg="${escAttr(s.id)}">
          <span class="rd-row-main">
            <span class="rd-row-en">${esc(s.title_en)}</span>
            <span class="rd-row-fa" lang="fa" dir="rtl">${esc(s.title_fa)}</span>
          </span>
          <span class="rd-row-meta">
            <span class="rd-row-cov" title="Words you know">~${a.knownPct}% known</span>
            ${read ? '<span class="rd-badge rd-badge-read">Read</span>' : ''}
          </span>
        </button>`;
      }
      html += '</section>';
    }
    html += '</div>';
    $('card-area').innerHTML = html;
  }

  // ---------- Reading ----------
  function lineHTML(story, line, i) {
    let fa = '';
    L.segments(line.fa).forEach((seg, j) => {
      if (!seg.word) { fa += esc(seg.text); return; }
      const status = statusOf(seg.text, story);
      fa += `<span class="rd-w rd-${status}" data-action="read-word" data-arg="${i}:${j}">${esc(seg.text)}</span>`;
    });
    const showEn = S.showEn || S.revealed.has(i);
    const showPin = S.showPin || S.pinLines.has(i);
    return `<div class="rd-line${showEn ? ' show-en' : ''}${showPin ? ' show-pin' : ''}" data-line="${i}" data-action="read-line" data-arg="${i}">
      <p class="rd-fa" lang="fa" dir="rtl">${fa}</p>
      <p class="rd-pin">${esc(line.pin)}</p>
      <p class="rd-en">${esc(line.en)}</p>
    </div>`;
  }

  function renderStory(story) {
    const lesson = lessonOf(story.session);
    const a = analyseStory(story);
    const read = !!S.read[story.id];
    const nextUnread = st.stories().find(s => s.session === story.session && s.id !== story.id && !S.read[s.id]);
    $('card-area').innerHTML = `<article class="rd-story">
      <button type="button" class="rd-back" data-action="read-back">&#8592; All stories</button>
      <div class="rd-head">
        ${story.generated ? '<p class="rd-gen">Practice story · written for you, not from your teacher</p>' : ''}
        <h2 class="rd-title-fa" lang="fa" dir="rtl">${esc(story.title_fa)}</h2>
        <p class="rd-title-en">${esc(story.title_en)}</p>
        <p class="rd-meta">${esc(lesson ? lesson.label : 'Session ' + story.session)}${lesson && lesson.title ? ' · ' + esc(lesson.title) : ''}</p>
        <div class="rd-cov">
          <div class="rd-cov-bar" aria-hidden="true"><span class="rd-cov-k" style="width:${a.knownPct}%"></span><span class="rd-cov-l" style="width:${Math.min(a.learningPct, 100 - a.knownPct)}%"></span></div>
          <p><strong>You know ~${a.knownPct}% of these words</strong>${a.learningPct ? ` · ${a.learningPct}% still learning` : ''}</p>
          <p class="rd-cov-note">Known means mastered: a card for the word has lasted 3 weeks or more. <span class="rd-key rd-new">Dotted</span> words you haven't studied yet; <span class="rd-key rd-glossed">underlined</span> words aren't in your deck.</p>
        </div>
        <div class="rd-tools">
          <button type="button" class="rd-toggle${S.showEn ? ' active' : ''}" data-action="read-toggle-en" aria-pressed="${S.showEn}">Show all English</button>
          <button type="button" class="rd-toggle${S.showPin ? ' active' : ''}" data-action="read-toggle-pin" aria-pressed="${S.showPin}">Show pinglish</button>
        </div>
      </div>
      <div class="rd-lines">${story.lines.map((l, i) => lineHTML(story, l, i)).join('')}</div>
      <p class="rd-hint">Tap a word for its meaning. Tap a sentence for its English; press and hold for pinglish.</p>
      <div class="rd-foot">
        <button type="button" class="rd-mark${read ? ' is-read' : ''}" data-action="read-mark" aria-pressed="${read}">${read ? 'Read · mark as unread' : 'Mark as read'}</button>
        ${read && nextUnread ? `<button type="button" class="rd-next" data-action="read-open" data-arg="${escAttr(nextUnread.id)}">Next story: ${esc(nextUnread.title_en)}</button>` : ''}
      </div>
    </article>`;
    if (S.gloss) showGloss(S.gloss.line, S.gloss.seg, false);
  }

  // ---------- Word gloss ----------
  // Everyday words that need no card but deserve a meaning (and that can
  // share their spelling with a deck word: نه is "no" before it is "nine").
  const FUNCTION_GLOSS = Object.fromEntries(Object.entries({
    'و': 'and', 'که': 'that, which, who', 'به': 'to', 'از': 'from; than', 'در': 'in', 'با': 'with',
    'را': 'object marker', 'رو': 'object marker (spoken)', 'یه': 'a, one', 'یک': 'a, one', 'این': 'this', 'اون': 'that; he, she',
    'آن': 'that', 'هم': 'also, too', 'هر': 'every', 'چه': 'what', 'چی': 'what', 'چرا': 'why', 'کجا': 'where',
    'کی': 'who; when', 'چند': 'how many', 'چطور': 'how', 'ولی': 'but', 'اما': 'but', 'یا': 'or', 'تا': 'until; (counter)',
    'برای': 'for', 'بعد': 'after, then', 'قبل': 'before', 'اگه': 'if', 'اگر': 'if', 'نه': 'no; not', 'آره': 'yes', 'بله': 'yes',
    'خیلی': 'very, a lot', 'همه': 'all, everyone', 'دیگه': 'other; already, any more', 'هنوز': 'still, yet', 'فقط': 'only',
    'بیشتر': 'more', 'کمی': 'a little', 'یکم': 'a little', 'الان': 'now', 'حالا': 'now',
    'من': 'I, me', 'تو': 'you; in', 'او': 'he, she', 'ما': 'we', 'شما': 'you (plural, polite)', 'اونا': 'they', 'آنها': 'they',
    'ایشون': 'he, she (polite)', 'خودم': 'myself', 'خودت': 'yourself', 'خودش': 'himself, herself',
  }).map(([fa, en]) => [L.key(fa), en]));

  function itemRank(r, k, res) {
    const exact = L.cardTexts(r.item).some(t => L.key(t) === k) || (res.base && L.key(r.item.fa) === res.base);
    if (r.item.type === 'vocabulary') return exact ? 0 : 1;
    return exact ? 2 : 3;
  }
  // A grammar, phrase or story card only shows where the word was seen: its
  // Persian part (rule cards read "کوچیک‌تر = younger"), isolated, and its English.
  function seenInHTML(r) {
    const fa = String(r.item.fa || '').split(/\s*=\s*/)[0].replace(/<[^>]*>/g, ' ').trim();
    return `<p class="rd-g-form">Seen in <bdi lang="fa" dir="rtl">${fa}</bdi>${r.item.en ? ` · <bdi>${r.item.en}</bdi>` : ''} <span class="rd-g-src">${esc(r.label)}</span></p>`;
  }

  function glossHTML(story, token) {
    const k = L.key(token);
    const status = statusOf(token, story);
    const statusLabel = { known: 'Known', learning: 'Learning', new: 'Not studied yet', unseen: 'Not in your deck', glossed: 'Not in your deck yet', free: '' }[status];
    let body = '';
    const g = (story.unknown || []).find(u => L.key(u.fa) === k);
    if (g) {
      body += `<div class="rd-g-entry"><span class="rd-g-fa" lang="fa" dir="rtl">${esc(g.fa)}</span><span class="rd-g-pin">${esc(g.pin)}</span><span class="rd-g-en">${esc(g.en)}</span></div>`;
    } else {
      const res = lookup(token);
      const senses = [];   // at most two, best first
      const fn = FUNCTION_GLOSS[k];
      if (fn) senses.push(`<div class="rd-g-entry"><span class="rd-g-en">${esc(fn)}</span><span class="rd-g-src">everyday word</span></div>`);
      const shownVerbs = new Set();
      for (const v of res.verbs.filter(v => v.en).slice(0, 2)) {
        if (L.key(v.fa) === k) continue;
        shownVerbs.add(L.key(v.fa));
        senses.push(`<p class="rd-g-form">A form of <bdi class="rd-g-fa" lang="fa" dir="rtl">${esc(v.fa)}</bdi> <bdi class="rd-g-pin">${esc(v.pin || '')}</bdi> · <bdi>${esc(v.en)}</bdi></p>`);
      }
      // Vocabulary whose word is exactly this one first, then other vocabulary,
      // then grammar or phrase cards, which only show where the word was seen.
      const ranked = res.items.slice().sort((x, y) => itemRank(x, k, res) - itemRank(y, k, res));
      for (const r of ranked) {
        if (senses.length >= 2) break;
        if (shownVerbs.has(L.key(r.item.fa))) continue;   // the verb line above already says it
        if (r.item.type === 'vocabulary') {
          senses.push(`<div class="rd-g-entry"><bdi class="rd-g-fa" lang="fa" dir="rtl">${r.item.fa}</bdi><bdi class="rd-g-pin">${r.item.pin || ''}</bdi><bdi class="rd-g-en">${r.item.en || ''}</bdi><span class="rd-g-src">${esc(r.label)}</span></div>`);
        } else {
          senses.push(seenInHTML(r));
        }
      }
      if (res.base && res.items.length && senses.length) senses.splice(fn ? 1 : 0, 0, `<p class="rd-g-form">From <bdi lang="fa" dir="rtl">${esc(res.base)}</bdi> with an ending</p>`);
      for (const r of res.phrases) {
        if (senses.length >= 2) break;
        senses.push(seenInHTML(r));
      }
      body = senses.join('');
      if (!body) body = status === 'free'
        ? '<p class="rd-g-form">An everyday word or a name, not a card in your deck.</p>'
        : '<p class="rd-g-form">Not in your deck. The English for the whole sentence is one tap away.</p>';
    }
    return `<div class="rd-gloss" role="dialog" aria-label="Word meaning">
      <div class="rd-g-head"><span class="rd-g-word" lang="fa" dir="rtl">${esc(token)}</span>${statusLabel ? `<span class="rd-g-status rd-s-${status}">${statusLabel}</span>` : ''}
      <button type="button" class="rd-g-close" data-action="read-gloss-close" aria-label="Close">&#215;</button></div>
      ${body}
    </div>`;
  }

  function closeGloss() {
    S.gloss = null;
    document.querySelectorAll('.rd-gloss').forEach(el => el.remove());
    document.querySelectorAll('.rd-w.is-sel').forEach(el => el.classList.remove('is-sel'));
  }

  function showGloss(line, seg, toggle = true) {
    const story = st.story(S.storyId);
    if (!story) return;
    if (toggle && S.gloss && S.gloss.line === line && S.gloss.seg === seg) { closeGloss(); return; }
    closeGloss();
    const lineEl = document.querySelector(`.rd-line[data-line="${line}"]`);
    const span = lineEl && lineEl.querySelector(`.rd-w[data-arg="${line}:${seg}"]`);
    if (!span) return;
    S.gloss = { line, seg };
    span.classList.add('is-sel');
    lineEl.querySelector('.rd-fa').insertAdjacentHTML('afterend', glossHTML(story, span.textContent));
  }

  // ---------- View ----------
  function openStory(id) {
    if (!st.story(id)) return;
    S.storyId = id;
    S.revealed = new Set();
    S.pinLines = new Set();
    S.gloss = null;
    if (F.state.tab !== 'read') F.app.setView('read'); else F.app.render();
    const area = $('card-area');
    if (area && area.getBoundingClientRect().top < 0) area.scrollIntoView({ block: 'start' });
    else root.scrollTo(0, 0);
  }

  F.views.register('read', {
    label: 'Read',
    order: 30,
    page: true,
    hideActions: true,
    render() {
      const story = S.storyId && st.story(S.storyId);
      if (story) renderStory(story); else { S.storyId = null; renderList(); }
      $('scope-bar').innerHTML = '';
      $('nav-pos').textContent = '';
      $('card-count').innerHTML = '';
    },
    renderScoreRow() { $('score-row').innerHTML = ''; },
    syncChrome() {
      $('mastered-btn').hidden = true;
      $('newlimit-btn').hidden = true;
      $('score-row').style.display = 'none';
    },
    shortcutsHTML() { return S.storyId ? '<span><kbd>Esc</kbd> back to all stories</span>' : ''; },
    keydown(e) {
      if (e.key === 'Escape' && S.storyId) {
        if (S.gloss) closeGloss(); else { S.storyId = null; F.app.render(); }
      }
    },
  });

  // ---------- Actions ----------
  let suppressClick = false;
  const A = F.actions;
  A.register('read-open', el => openStory(el.dataset.arg));
  A.register('read-back', () => { S.storyId = null; S.gloss = null; F.app.render(); root.scrollTo(0, 0); });
  A.register('read-line', el => {
    if (suppressClick) { suppressClick = false; return; }
    const i = +el.dataset.arg;
    if (S.revealed.has(i)) S.revealed.delete(i); else S.revealed.add(i);
    el.classList.toggle('show-en', S.showEn || S.revealed.has(i));
  });
  A.register('read-word', el => {
    if (suppressClick) { suppressClick = false; return; }
    const [line, seg] = el.dataset.arg.split(':').map(Number);
    showGloss(line, seg);
  });
  A.register('read-gloss-close', () => closeGloss());
  A.register('read-toggle-en', () => { S.showEn = !S.showEn; S.revealed.clear(); F.app.render(); });
  A.register('read-toggle-pin', () => { S.showPin = !S.showPin; S.pinLines.clear(); F.app.render(); });
  A.register('read-mark', () => {
    if (!S.storyId) return;
    if (S.read[S.storyId]) delete S.read[S.storyId]; else S.read[S.storyId] = Date.now();
    S.gloss = null;
    F.app.render();
  });

  // Long-press a sentence: toggle its pinglish.
  if (root.document) {
    let timer = null, startX = 0, startY = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    document.addEventListener('pointerdown', e => {
      const line = e.target.closest && e.target.closest('.rd-line');
      if (!line) return;
      suppressClick = false;
      startX = e.clientX; startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        const i = +line.dataset.line;
        if (S.pinLines.has(i)) S.pinLines.delete(i); else S.pinLines.add(i);
        line.classList.toggle('show-pin', S.showPin || S.pinLines.has(i));
        suppressClick = true;
        if (navigator.vibrate) navigator.vibrate(10);
      }, 500);
    });
    document.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel(); });
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.rd-line')) e.preventDefault(); });
  }

  // ---------- Prefs ----------
  F.store.registerPrefs({
    save(p) { p.storiesRead = Object.assign({}, S.read); p.readerPin = S.showPin; },
    load(p) {
      if (p.storiesRead && typeof p.storiesRead === 'object') S.read = Object.assign({}, p.storiesRead);
      if (typeof p.readerPin === 'boolean') S.showPin = p.readerPin;
    },
  });

  // ---------- Today section ----------
  function todayStory() {
    const newest = F.cards.newestLesson();
    if (!newest) return null;
    return st.stories().find(s => s.session === newest.id && !S.read[s.id]) || null;
  }
  let todayRegistered = false;
  function registerToday() {
    if (todayRegistered || !F.today || typeof F.today.registerSection !== 'function') return false;
    todayRegistered = true;
    const html = () => {
      const s = todayStory();
      if (!s) return '';
      const a = analyseStory(s);
      return '<div class="t-row"><span class="t-row-label">Read a story</span>'
        + `<span class="t-row-val t-row-small">~${a.knownPct}% known</span></div>`
        + `<div class="rd-today"><span class="rd-today-fa" lang="fa" dir="rtl">${esc(s.title_fa)}</span>`
        + `<span class="rd-today-en">${esc(s.title_en)}</span></div>`
        + `<div class="t-sub">A short practice story for ${esc((lessonOf(s.session) || {}).label || 'your newest lesson')}. Tap any word for its meaning.</div>`
        + `<div class="t-acts"><button type="button" class="btn-secondary" data-action="read-open" data-arg="${escAttr(s.id)}">Read it</button></div>`;
    };
    F.today.registerSection({
      id: 'read', order: 40,
      visible: () => !!todayStory(),
      html,
      render(el) { el.innerHTML = html(); },
    });
    return true;
  }
  if (!registerToday()) {
    F.hooks.on('boot', () => { if (registerToday() && F.app) F.app.render(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
