// core.js: the F namespace and the small registries every other file hooks into.
// Loaded first. No DOM work here, so node tools can load it too.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  // ---------- Utilities ----------
  F.util = {
    // Text going into innerHTML. Card data is trusted and may contain <br>,
    // so card fields are NOT escaped; use this for user input and file names.
    esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    escAttr(s) {
      return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    toggleSet(set, val) {
      if (set.has(val)) set.delete(val); else set.add(val);
    },
    // Day keys are local-calendar "Y-M-D" with no zero padding (the format the
    // v1 store used, so old newLog/revLog entries keep counting).
    dayKey(d) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
    todayKey() { return F.util.dayKey(new Date()); },
    dayKeyOffset(n) {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return F.util.dayKey(d);
    },
    plural(n, one, many) { return n === 1 ? one : (many || one + 's'); },
  };

  // ---------- Shared UI state ----------
  // Cross-view state. Each view keeps its own state on its own namespace
  // (F.study.state, F.drill.state).
  F.state = {
    tab: 'cards',          // name of the active view
    flipped: false,        // current card shows its back
    typedMode: false,      // typed recall on
    typedResult: null,     // 'right' | 'wrong' | null
    typedValue: '',
    shuffled: false,
    filtersExpanded: false,
  };

  // ---------- Hooks: a tiny event bus ----------
  // F.hooks.on('card:rendered', fn) / F.hooks.emit('card:rendered', payload).
  // Events in use are listed in ARCHITECTURE.md.
  const handlers = {};
  F.hooks = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return fn; },
    off(name, fn) { handlers[name] = (handlers[name] || []).filter(f => f !== fn); },
    emit(name, payload) {
      for (const fn of handlers[name] || []) {
        try { fn(payload); } catch (e) { console.error(`hook ${name}`, e); }
      }
    },
  };

  // ---------- Lesson registry ----------
  // Each lessons/*.js file calls F.lesson({...}). Order of registration is
  // the order of sessions in the filter list and of cards in the deck.
  F.lessons = [];
  const ITEM_TYPES = ['vocabulary', 'grammar', 'phrases', 'story', 'letter'];
  F.lesson = function lesson(def) {
    if (!def || typeof def.id !== 'string') throw new Error('F.lesson: id (string) required');
    if (F.lessons.some(l => l.id === def.id)) throw new Error(`F.lesson: duplicate lesson id ${def.id}`);
    const items = def.items || [];
    for (const it of items) {
      if (!it.id) throw new Error(`F.lesson ${def.id}: item without id`);
      if (!ITEM_TYPES.includes(it.type)) throw new Error(`F.lesson ${def.id}: item ${it.id} has unknown type ${it.type}`);
    }
    const notes = def.notes == null ? [] : [].concat(def.notes);
    const entry = Object.assign({ kind: 'lesson' }, def, { items, notesFiles: notes });
    F.lessons.push(entry);
    return entry;
  };

  // ---------- Views ----------
  // A view owns the main study area while it is active. See ARCHITECTURE.md
  // for the full interface; everything except render() is optional.
  const views = [];
  F.views = {
    register(name, def) {
      if (views.some(v => v.name === name)) throw new Error(`view ${name} already registered`);
      const v = Object.assign({ name, order: 100 }, def);
      views.push(v);
      views.sort((a, b) => a.order - b.order);
      return v;
    },
    get(name) { return views.find(v => v.name === name) || null; },
    list() { return views.slice(); },
  };

  // ---------- Click actions (event delegation) ----------
  // Markup uses data-action="name" (plus optional data-arg="..."); app.js
  // has one click listener that runs F.actions.run(name, el, event).
  const actions = {};
  F.actions = {
    register(name, fn) {
      if (actions[name]) throw new Error(`action ${name} already registered`);
      actions[name] = fn;
    },
    has(name) { return !!actions[name]; },
    run(name, el, ev) {
      const fn = actions[name];
      if (!fn) { console.warn('unknown action', name); return; }
      fn(el, ev);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
