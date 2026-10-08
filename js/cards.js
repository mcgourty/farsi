// cards.js: lesson registry + generated decks -> the flat card list, plus the
// pure filter and queue-building helpers the study view uses.
// No DOM and no store writes, so tools/ can load it in node.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  // Direction codes used in card ids: `${itemId}:${code}`
  // 'cloze' is the single direction of a fill-in-the-blank card (js/ui/cloze.js).
  const DIR_CODE = { 'farsi-to-english': 'fa-en', 'english-to-farsi': 'en-fa', letter: 'letter', cloze: 'cloze' };
  const BOTH = ['farsi-to-english', 'english-to-farsi'];

  const TYPES = [
    { id: 'vocabulary', label: 'Vocabulary' },
    { id: 'grammar', label: 'Grammar' },
    { id: 'phrases', label: 'Phrases' },
    { id: 'story', label: 'Story' },
    { id: 'alphabet', label: 'Alphabet' },
    { id: 'verbs', label: 'Verbs' },
    { id: 'cloze', label: 'Fill in the blank' },
  ];

  // Decks generated from code rather than written in lessons/*.js.
  //   {session?, type, items(), dirs?, extra?(item)}
  // items() returns objects with {id, fa, pin, en, notes, session?, ...}. Every
  // item becomes one card per direction in `dirs` (default fa-en and en-fa).
  // With `session` the deck is its own session after all the lessons; without
  // it each item names the session it belongs to (cloze cards sit in the
  // session of the phrase they were made from).
  const generators = [];
  function registerGenerator(def) { generators.push(def); }
  registerGenerator({
    session: { id: 'verbs', label: 'Verbs', kind: 'generated' },
    type: 'verbs',
    items: () => (F.verbs ? F.verbs.meaningItems() : []),
    extra: it => ({ verb: it.verb, tense: it.tense, pi: it.pi }),
  });

  function cardId(itemId, direction) { return `${itemId}:${DIR_CODE[direction]}`; }

  function lessonCards(lesson) {
    const out = [];
    for (const it of lesson.items) {
      if (it.type === 'letter') {
        out.push({
          id: cardId(it.id, 'letter'), itemId: it.id, session: lesson.id, type: 'alphabet', direction: 'letter',
          name: it.name, sound: it.sound, isolated: it.isolated, initial: it.initial,
          medial: it.medial, final: it.final, notes: it.notes,
        });
        continue;
      }
      for (const direction of it.dirs || BOTH) {
        out.push({
          id: cardId(it.id, direction), itemId: it.id, session: lesson.id, type: it.type, direction,
          farsi: it.fa, pinglish: it.pin, english: it.en, breakdown: it.notes || '',
        });
      }
    }
    return out;
  }

  let rankCache = null;

  const api = F.cards = {
    DIR_CODE, TYPES, SIBLING_GAP: 8,
    all: [],
    byId: new Map(),
    sessions: [],
    registerGenerator,
    cardId,

    // (Re)build the deck from F.lessons and the generators. Cheap enough to
    // call again after a lesson is registered late.
    build() {
      const all = [];
      const sessions = [];
      for (const lesson of F.lessons) {
        sessions.push({ id: lesson.id, label: lesson.label || lesson.id, kind: lesson.kind || 'lesson', lesson });
        all.push(...lessonCards(lesson));
      }
      const items = new Map();
      for (const lesson of F.lessons) for (const it of lesson.items) items.set(it.id, it);
      for (const g of generators) {
        if (g.session) sessions.push(Object.assign({}, g.session));
        for (const it of g.items()) {
          items.set(it.id, it);
          for (const direction of g.dirs || BOTH) {
            all.push(Object.assign({
              id: cardId(it.id, direction), itemId: it.id, session: it.session || g.session.id, type: g.type, direction,
              farsi: it.fa, pinglish: it.pin, english: it.en, breakdown: it.notes || '',
            }, g.extra ? g.extra(it) : {}));
          }
        }
      }
      const byId = new Map();
      const byItem = new Map();
      for (const c of all) {
        if (byId.has(c.id)) throw new Error(`duplicate card id ${c.id}`);
        byId.set(c.id, c);
        if (!byItem.has(c.itemId)) byItem.set(c.itemId, []);
        byItem.get(c.itemId).push(c);
      }
      api.all = all;
      api.byId = byId;
      api.byItem = byItem;
      api.items = items;
      api.sessions = sessions;
      rankCache = null;
      return all;
    },

    // The source item of a card (lesson item or generated item), by item id.
    item(itemId) { return api.items.get(itemId) || null; },
    cardsOf(itemId) { return api.byItem.get(itemId) || []; },

    // Example sentences for an item: [{fa, pin, en, source}]. They come from
    // the item itself (`examples` in a lesson file) or from F.examples
    // (itemId -> array), whichever has them. Always returns an array.
    examplesFor(itemId) {
      const it = api.item(itemId);
      let ex = it && Array.isArray(it.examples) ? it.examples : null;
      if (!ex && F.examples && typeof F.examples === 'object') {
        const x = typeof F.examples.get === 'function' ? F.examples.get(itemId) : F.examples[itemId];
        if (Array.isArray(x)) ex = x;
      }
      return (ex || []).filter(e => e && typeof e.fa === 'string' && e.fa);
    },
    // The example to show on a given review: rotates with the review count so
    // each review meets the word in a different sentence.
    exampleFor(itemId, n) {
      const ex = api.examplesFor(itemId);
      if (!ex.length) return null;
      const i = ((Math.floor(n) || 0) % ex.length + ex.length) % ex.length;
      return ex[i];
    },

    // New-card order: the newest numbered lesson first, then older lessons,
    // then other lesson-like decks (alphabet), then generated decks (verbs).
    sessionRank(sessionId) {
      if (!rankCache) {
        rankCache = new Map();
        const lessons = api.sessions.filter(s => s.kind === 'lesson');
        lessons.slice().reverse().forEach((s, i) => rankCache.set(s.id, i));
        let r = lessons.length;
        for (const s of api.sessions) if (s.kind !== 'lesson' && s.kind !== 'generated') rankCache.set(s.id, r);
        r++;
        for (const s of api.sessions) if (s.kind === 'generated') rankCache.set(s.id, r);
      }
      const v = rankCache.get(sessionId);
      return v === undefined ? 1e6 : v;
    },

    // The newest numbered lesson: the last one registered with kind 'lesson'.
    newestLesson() {
      const numbered = api.sessions.filter(s => s.kind === 'lesson');
      return numbered[numbered.length - 1] || null;
    },

    // ---------- Filters ----------
    // Alphabet is a letter drill, not a translation, so direction does not apply.
    // Cloze cards are Farsi sentences with an English hint, so they show in
    // either direction too.
    directionExcluded(c, direction) {
      if (c.direction === 'letter' || c.direction === 'cloze') return false;
      return c.type !== 'alphabet' && direction !== 'both' && c.direction !== direction;
    },
    // f = {sessions: Set, types: Set, direction}
    matchesFilters(c, f) {
      if (!f.sessions.has(c.session)) return false;
      if (!f.types.has(c.type)) return false;
      if (api.directionExcluded(c, f.direction)) return false;
      return true;
    },
    // Each direction gets its own New/day budget.
    // Cloze cards have their own bucket so they never eat into the word budget.
    newBucket(c) {
      if (c.direction === 'cloze') return 'cloze';
      return c.direction === 'english-to-farsi' ? 'en' : 'fa';
    },

    // ---------- Queue building ----------
    // Spreads the day's new cards evenly through the due cards.
    interleave(due, fresh) {
      if (!fresh.length) return due.slice();
      if (!due.length) return fresh.slice();
      const out = [];
      const gap = due.length / fresh.length;
      let n = 0;
      for (let i = 0; i < due.length; i++) {
        out.push(due[i]);
        while (n < fresh.length && (n + 1) * gap <= i + 1) out.push(fresh[n++]);
      }
      while (n < fresh.length) out.push(fresh[n++]);
      return out;
    },

    // Two directions of one item are the same fact, so keep them `gap` apart.
    // A cloze card is a sibling of the phrase it was cut from.
    siblingKey(c) { return c.clozeOf || c.itemId; },
    spaceSiblings(list, gap) {
      const out = [];
      const held = [];
      const lastAt = new Map();
      const place = c => { lastAt.set(api.siblingKey(c), out.length); out.push(c); };
      const clear = c => {
        const i = lastAt.get(api.siblingKey(c));
        return i === undefined || out.length - i >= gap;
      };
      for (const c of list) {
        if (clear(c)) place(c); else held.push(c);
        for (let i = 0; i < held.length; i++) {
          if (clear(held[i])) { place(held.splice(i, 1)[0]); i--; }
        }
      }
      for (const c of held) place(c);   // no room left; take the collision
      return out;
    },

    // o = {base, mode, shuffled, direction, now, srsOf(c), isWeak(c), allowance: {fa, en, cloze?, learn?}}
    // Optional, all off by default (the legacy order):
    //   newOrder: 'newest'      new cards from the newest lesson first (sessionRank)
    //   siblingRule: true       in 'due' mode, at most one card per sibling key
    //                           today; siblingSeenToday(c) says a sibling of c was
    //                           already reviewed (or introduced) today
    //   needsIntro(c)           a new card whose item has not been presented yet;
    //                           only one such card per item enters, and it uses
    //                           allowance.learn (items/day) instead of its bucket
    //   eligibleNew(c)          false keeps a new card out today (e.g. a cloze
    //                           whose phrase has not been learnt yet)
    //   deferred: []            receives the cards held back by the sibling rule
    buildQueue(o) {
      const shuffle = F.util.shuffle;
      let queue;
      if (o.mode === 'all' || o.mode === 'buried') {
        queue = o.base.slice();
        if (o.shuffled) shuffle(queue);
      } else if (o.mode === 'weak') {
        queue = o.base.filter(o.isWeak);
        queue.sort((a, b) => {
          const x = o.srsOf(a), y = o.srsOf(b);
          return (y.lapses - x.lapses) || (y.d - x.d);
        });
        if (o.shuffled) shuffle(queue);
      } else {
        let due = [], fresh = [];
        for (const c of o.base) {
          const st = o.srsOf(c);
          if (!st) fresh.push(c);
          else if (st.due <= o.now) due.push(c);
        }
        due.sort((a, b) => o.srsOf(a).due - o.srsOf(b).due);
        if (o.shuffled) { shuffle(due); shuffle(fresh); }
        if (o.newOrder === 'newest') {
          const rank = new Map();
          for (const c of fresh) if (!rank.has(c.session)) rank.set(c.session, api.sessionRank(c.session));
          fresh.sort((a, b) => rank.get(a.session) - rank.get(b.session));   // stable: file order within a lesson
        }
        if (o.eligibleNew) fresh = fresh.filter(o.eligibleNew);
        const deferred = Array.isArray(o.deferred) ? o.deferred : [];
        if (o.siblingRule) {
          const taken = new Set();
          const keep = c => {
            const k = api.siblingKey(c);
            if (taken.has(k) || (o.siblingSeenToday && o.siblingSeenToday(c))) { deferred.push(c); return false; }
            taken.add(k);
            return true;
          };
          // Due cards claim their key first; a new twin waits for tomorrow.
          due = due.filter(keep);
          fresh = fresh.filter(keep);
        }
        const allowance = Object.assign({}, o.allowance);
        const introItems = new Set();
        const take = c => {
          if (o.needsIntro && o.needsIntro(c)) {
            if (introItems.has(c.itemId)) return false;
            if (!((allowance.learn === undefined ? Infinity : allowance.learn) > 0)) return false;
            introItems.add(c.itemId);
            if (allowance.learn !== undefined) allowance.learn--;
            return true;
          }
          return allowance[api.newBucket(c)]-- > 0;
        };
        queue = api.interleave(due, fresh.filter(take));
      }
      if (o.direction === 'both') queue = api.spaceSiblings(queue, api.SIBLING_GAP);
      return queue;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
