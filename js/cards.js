// cards.js: lesson registry + generated decks -> the flat card list, plus the
// pure filter and queue-building helpers the study view uses.
// No DOM and no store writes, so tools/ can load it in node.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  // Direction codes used in card ids: `${itemId}:${code}`
  const DIR_CODE = { 'farsi-to-english': 'fa-en', 'english-to-farsi': 'en-fa', letter: 'letter' };
  const BOTH = ['farsi-to-english', 'english-to-farsi'];

  const TYPES = [
    { id: 'vocabulary', label: 'Vocabulary' },
    { id: 'grammar', label: 'Grammar' },
    { id: 'phrases', label: 'Phrases' },
    { id: 'story', label: 'Story' },
    { id: 'alphabet', label: 'Alphabet' },
    { id: 'verbs', label: 'Verbs' },
  ];

  // Decks generated from code rather than written in lessons/*.js. Each one
  // becomes a session after all the lessons. items() returns objects with
  // {id, fa, pin, en, notes, ...extra}; every item becomes a fa-en and an en-fa card.
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
      for (const g of generators) {
        sessions.push(Object.assign({}, g.session));
        for (const it of g.items()) {
          for (const direction of BOTH) {
            all.push(Object.assign({
              id: cardId(it.id, direction), itemId: it.id, session: g.session.id, type: g.type, direction,
              farsi: it.fa, pinglish: it.pin, english: it.en, breakdown: it.notes || '',
            }, g.extra ? g.extra(it) : {}));
          }
        }
      }
      const byId = new Map();
      for (const c of all) {
        if (byId.has(c.id)) throw new Error(`duplicate card id ${c.id}`);
        byId.set(c.id, c);
      }
      api.all = all;
      api.byId = byId;
      api.sessions = sessions;
      return all;
    },

    // The newest numbered lesson: the last one registered with kind 'lesson'.
    newestLesson() {
      const numbered = api.sessions.filter(s => s.kind === 'lesson');
      return numbered[numbered.length - 1] || null;
    },

    // ---------- Filters ----------
    // Alphabet is a letter drill, not a translation, so direction does not apply.
    directionExcluded(c, direction) {
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
    newBucket(c) { return c.direction === 'english-to-farsi' ? 'en' : 'fa'; },

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
    siblingKey(c) { return c.itemId; },
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

    // o = {base, mode, shuffled, direction, now, srsOf(c), isWeak(c), allowance: {fa, en}}
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
        const due = [], fresh = [];
        for (const c of o.base) {
          const st = o.srsOf(c);
          if (!st) fresh.push(c);
          else if (st.due <= o.now) due.push(c);
        }
        due.sort((a, b) => o.srsOf(a).due - o.srsOf(b).due);
        if (o.shuffled) { shuffle(due); shuffle(fresh); }
        const allowance = Object.assign({}, o.allowance);
        queue = api.interleave(due, fresh.filter(c => allowance[api.newBucket(c)]-- > 0));
      }
      if (o.direction === 'both') queue = api.spaceSiblings(queue, api.SIBLING_GAP);
      return queue;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
