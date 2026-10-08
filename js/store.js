// store.js: persistence. Owns the localStorage store (farsi-v2), the one-time
// migration from the v1 store, the review log (IndexedDB), and the data side
// of backup/restore. No rendering here; js/ui/backup.js is the UI.
//
// Shapes (see ARCHITECTURE.md):
//   store  = { version: 2, srs: {cardId: SrsState}, buried: {cardId: ts},
//              drill: {'verbId|tense|pi': {r, w}}, newLog: {day: {fa, en}},
//              revLog: {day: n}, prefs: {...}, meta: {...} }
//   review = { cardId, ts, rating, elapsedDays, durationMs,
//              stateBefore, sBefore, dBefore, stateAfter, sAfter, dAfter, dueAfter }
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  const V1_KEY = 'farsi-flashcards-v1';
  const V2_KEY = 'farsi-v2';
  const PRE_IMPORT_KEY = 'farsi-v2-before-import';
  const LOG_FALLBACK_KEY = 'farsi-reviews-v1';
  const IDB_NAME = 'farsi-flashcards';
  const IDB_STORE = 'reviews';
  const SAVE_DELAY = 400;

  const ls = () => { try { return root.localStorage || null; } catch (e) { return null; } };
  const clone = o => JSON.parse(JSON.stringify(o));

  function emptyStore(now) {
    return {
      version: 2,
      srs: {}, buried: {}, drill: {}, newLog: {}, revLog: {}, prefs: {},
      meta: { createdAt: now || Date.now(), lastBackupAt: null, backupSnoozedAt: null },
    };
  }

  // FNV-1a over the whole string: cheap fingerprint of the v1 blob, so a v1
  // store that changed after migration (an old cached page) can be noticed.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16) + ':' + s.length;
  }

  // ---------- v1 -> v2 migration (pure) ----------

  // The v1 app's own one-time conversion of its pre-SRS streak map. Applied
  // first, in old-key space, if the v1 store never ran it.
  function legacyMastery(v1, now) {
    const { clampS, clampD, DAY_MS } = F.fsrs;
    if (v1.migratedV2 || !v1.mastery) return;
    for (const k of Object.keys(v1.mastery)) {
      if (v1.srs[k]) continue;
      const m = v1.mastery[k] || {};
      const streak = Math.max(0, m.s || 0);
      if (!streak && !m.a) continue;
      const s = clampS(1 + 3 * streak);
      v1.srs[k] = {
        d: clampD(6 - streak + 0.5 * (m.a || 0)), s, last: now,
        due: now + (0.25 + Math.random() * 0.6) * s * DAY_MS,
        state: streak > 0 ? 'review' : 'learning', step: 0,
        reps: streak + (m.a || 0), lapses: m.a || 0,
      };
    }
    v1.migratedV2 = true;
  }

  function looksLikeV1(o) {
    return !!o && typeof o === 'object' && o.version !== 2 && typeof o.srs === 'object' && o.srs !== null
      && Object.keys(o.srs).every(k => k.includes('|'));
  }

  // v1raw: the parsed farsi-flashcards-v1 object. map: F.LEGACY_KEYS.
  // Returns {store, report}. Never mutates v1raw.
  function migrateV1(v1raw, map, now) {
    now = now || Date.now();
    const v1 = clone(v1raw);
    v1.srs = v1.srs || {};
    v1.buried = v1.buried || {};
    legacyMastery(v1, now);
    const store = emptyStore(now);
    const orphans = { srs: {}, buried: {} };
    const report = { srs: 0, cards: 0, buried: 0, orphaned: 0, shared: 0 };
    for (const [k, rec] of Object.entries(v1.srs)) {
      const ids = map[k];
      if (!ids) { orphans.srs[k] = rec; report.orphaned++; continue; }
      report.srs++;
      if (ids.length > 1) report.shared++;
      for (const id of ids) { store.srs[id] = clone(rec); report.cards++; }
    }
    for (const [k, ts] of Object.entries(v1.buried)) {
      const ids = map[k];
      if (!ids) { orphans.buried[k] = ts; report.orphaned++; continue; }
      for (const id of ids) { store.buried[id] = ts; report.buried++; }
    }
    store.drill = clone(v1.drill || {});
    store.newLog = clone(v1.newLog || {});
    store.revLog = clone(v1.revLog || {});
    store.prefs = clone(v1.prefs || {});
    store.meta.migratedFrom = V1_KEY;
    store.meta.migratedAt = now;
    if (Object.keys(orphans.srs).length || Object.keys(orphans.buried).length) {
      // Records whose cards no longer exist (text edited before the split).
      // Kept so nothing is ever thrown away.
      store.meta.legacyOrphans = orphans;
    }
    return { store, report };
  }

  // After migration, an old cached copy of the v1 page may still write to the
  // v1 store. Fold in anything newer: a review with a later `last`, a bury
  // made after migration, and higher day counts.
  function mergeNewerV1(store, v1raw, map) {
    const v1 = v1raw || {};
    const since = (store.meta && store.meta.migratedAt) || 0;
    let changed = 0;
    for (const [k, rec] of Object.entries(v1.srs || {})) {
      for (const id of map[k] || []) {
        const cur = store.srs[id];
        if (!cur || (rec && rec.last > cur.last)) { store.srs[id] = clone(rec); changed++; }
      }
    }
    for (const [k, ts] of Object.entries(v1.buried || {})) {
      if (!(ts > since)) continue;
      for (const id of map[k] || []) {
        const cur = store.srs[id];
        if (!store.buried[id] && !(cur && cur.last > ts)) { store.buried[id] = ts; changed++; }
      }
    }
    for (const day of Object.keys(v1.revLog || {})) {
      if ((v1.revLog[day] || 0) > (store.revLog[day] || 0)) { store.revLog[day] = v1.revLog[day]; changed++; }
    }
    for (const day of Object.keys(v1.newLog || {})) {
      const a = v1.newLog[day], b = store.newLog[day];
      const norm = x => (typeof x === 'number' ? { fa: x } : Object.assign({}, x));
      const na = norm(a), nb = norm(b || {});
      for (const bk of ['fa', 'en']) if ((na[bk] || 0) > (nb[bk] || 0)) { nb[bk] = na[bk]; changed++; }
      store.newLog[day] = nb;
    }
    for (const [k, v] of Object.entries(v1.drill || {})) {
      const cur = store.drill[k];
      if (!cur || (v.r + v.w) > (cur.r + cur.w)) { store.drill[k] = clone(v); changed++; }
    }
    return changed;
  }

  function loadLegacyMap() {
    if (F.LEGACY_KEYS) return Promise.resolve(F.LEGACY_KEYS);
    if (typeof document === 'undefined') return Promise.reject(new Error('legacy map not loaded'));
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/legacy-keys.js';
      s.onload = () => (F.LEGACY_KEYS ? resolve(F.LEGACY_KEYS) : reject(new Error('legacy map empty')));
      s.onerror = () => reject(new Error('could not load js/legacy-keys.js'));
      document.head.appendChild(s);
    });
  }

  // ---------- The live store ----------

  const prefProviders = [];
  let saveTimer = null;
  let lastPrefsJson = null;

  const api = F.store = {
    V1_KEY, V2_KEY, PRE_IMPORT_KEY,
    data: emptyStore(),
    status: { migrated: null, mergedFromV1: 0, saveError: null },
    migrateV1, mergeNewerV1, looksLikeV1, emptyStore, hash,

    // Loads farsi-v2, migrating farsi-flashcards-v1 into it the first time.
    // Resolves once the store is ready. v1 is never modified or removed.
    init() {
      const storage = ls();
      let v2 = null, v1str = null;
      try { v2 = JSON.parse(storage.getItem(V2_KEY)); } catch (e) { v2 = null; }
      try { v1str = storage.getItem(V1_KEY); } catch (e) { v1str = null; }
      let v1 = null;
      try { v1 = v1str ? JSON.parse(v1str) : null; } catch (e) { v1 = null; }
      const hasV1 = !!(v1 && typeof v1 === 'object');

      if (v2 && v2.version === 2) {
        api.data = Object.assign(emptyStore(), v2);
        api.data.meta = Object.assign(emptyStore().meta, v2.meta || {});
        if (hasV1 && api.data.meta.migratedFrom === V1_KEY && api.data.meta.v1Hash !== hash(v1str)) {
          return loadLegacyMap().then(map => {
            api.status.mergedFromV1 = mergeNewerV1(api.data, v1, map);
            api.data.meta.v1Hash = hash(v1str);
            api.save();
          }).catch(e => console.warn('v1 re-merge skipped', e));
        }
        return Promise.resolve();
      }
      if (hasV1) {
        return loadLegacyMap().then(map => {
          const { store, report } = migrateV1(v1, map);
          store.meta.v1Hash = hash(v1str);
          api.data = store;
          api.status.migrated = report;
          api.save();
        }).catch(e => {
          // Without the map we cannot migrate. Start empty but do NOT write,
          // so the next load tries again and v1 stays the source of truth.
          console.error('migration failed', e);
          api.status.migrationError = String(e && e.message || e);
          api.data = emptyStore();
          api.readOnly = true;
        });
      }
      api.data = emptyStore();
      return Promise.resolve();
    },

    // ---------- Accessors ----------
    srs(id) { return api.data.srs[id]; },
    setSrs(id, st) { api.data.srs[id] = st; api.saveSoon(); },
    deleteSrs(id) { delete api.data.srs[id]; api.saveSoon(); },
    isBuried(id) { return !!api.data.buried[id]; },
    bury(id, ts) { api.data.buried[id] = ts || Date.now(); api.saveSoon(); },
    unbury(id) { delete api.data.buried[id]; api.saveSoon(); },

    // ---------- Day counters ----------
    newToday(bucket) {
      const day = api.data.newLog[F.util.todayKey()];
      if (typeof day === 'number') return bucket === 'fa' ? day : 0;   // log from before the split
      return (day && day[bucket]) || 0;
    },
    bumpNewToday(bucket) {
      const k = F.util.todayKey();
      const day = api.data.newLog[k];
      const next = typeof day === 'number' ? { fa: day } : Object.assign({}, day);
      next[bucket] = (next[bucket] || 0) + 1;
      api.data.newLog[k] = next;
      api.saveSoon();
    },
    revToday() { return api.data.revLog[F.util.todayKey()] || 0; },
    bumpRevToday() {
      api.data.revLog[F.util.todayKey()] = api.revToday() + 1;
      api.saveSoon();
    },
    // Counts back from today. A day with no reviews yet does not break the
    // streak until it is over.
    studyStreak() {
      const log = api.data.revLog;
      let n = 0;
      let i = log[F.util.dayKeyOffset(0)] ? 0 : 1;
      while (log[F.util.dayKeyOffset(i)]) { n++; i++; }
      return n;
    },
    pruneLogs() {
      const keep = new Set();
      for (let i = 0; i < 400; i++) keep.add(F.util.dayKeyOffset(i));
      for (const which of ['newLog', 'revLog']) {
        const log = api.data[which];
        for (const k of Object.keys(log)) if (!keep.has(k)) delete log[k];
      }
    },

    // ---------- Prefs ----------
    // Modules register {save(prefs), load(prefs)}: save writes the module's
    // fields into the shared prefs object, load reads them back at boot.
    registerPrefs(provider) { prefProviders.push(provider); },
    collectPrefs() {
      const p = {};
      for (const pr of prefProviders) pr.save(p);
      return p;
    },
    applyPrefs() {
      for (const pr of prefProviders) pr.load(api.data.prefs || {});
      lastPrefsJson = JSON.stringify(api.collectPrefs());
    },
    // Called after each render: schedules a save only if a pref changed.
    syncPrefs() {
      const p = api.collectPrefs();
      const j = JSON.stringify(p);
      if (j !== lastPrefsJson) { lastPrefsJson = j; api.data.prefs = p; api.saveSoon(); }
    },

    // ---------- Saving ----------
    saveSoon() {
      if (saveTimer) return;
      saveTimer = setTimeout(api.save, SAVE_DELAY);
    },
    save() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (api.readOnly) return false;
      try {
        ls().setItem(V2_KEY, JSON.stringify(api.data));
        api.status.saveError = null;
        return true;
      } catch (e) {
        api.status.saveError = String(e && e.message || e);
        console.error('save failed', e);
        return false;
      }
    },
    flush() { if (saveTimer) api.save(); },
  };

  // ---------- Review log ----------
  // Append-only. IndexedDB when available, else a localStorage array.
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      let req;
      try { req = root.indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(IDB_STORE)) {
          const os = d.createObjectStore(IDB_STORE, { keyPath: 'seq', autoIncrement: true });
          os.createIndex('cardId', 'cardId');
          os.createIndex('ts', 'ts');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    }).catch(e => { console.warn('review log: using localStorage (' + (e && e.message || e) + ')'); return null; });
    return dbp;
  }
  function fallbackRead() {
    try { return JSON.parse(ls().getItem(LOG_FALLBACK_KEY)) || []; } catch (e) { return []; }
  }
  function fallbackWrite(arr) {
    try { ls().setItem(LOG_FALLBACK_KEY, JSON.stringify(arr)); } catch (e) { console.error('review log write failed', e); }
  }
  function idbAll(d) {
    return new Promise((resolve, reject) => {
      const req = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result.map(r => { const o = Object.assign({}, r); delete o.seq; return o; }));
      req.onerror = () => reject(req.error);
    });
  }
  function idbAdd(d, entries) {
    return new Promise((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, 'readwrite');
      const os = tx.objectStore(IDB_STORE);
      for (const e of entries) os.add(Object.assign({}, e));
      tx.oncomplete = () => resolve(entries.length);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  api.reviews = {
    append(entry) {
      return db().then(d => {
        if (d) return idbAdd(d, [entry]);
        const arr = fallbackRead(); arr.push(entry); fallbackWrite(arr); return 1;
      }).catch(e => console.error('review log append failed', e));
    },
    all() {
      return db().then(d => (d ? idbAll(d).then(arr => arr.concat(fallbackLeftovers(arr))) : fallbackRead()))
        .catch(e => { console.error('review log read failed', e); return fallbackRead(); });
    },
    // Adds entries not already present (same cardId + ts + rating).
    merge(entries) {
      return api.reviews.all().then(existing => {
        const seen = new Set(existing.map(r => `${r.cardId}|${r.ts}|${r.rating}`));
        const add = entries.filter(r => !seen.has(`${r.cardId}|${r.ts}|${r.rating}`));
        if (!add.length) return 0;
        return db().then(d => {
          if (d) return idbAdd(d, add);
          fallbackWrite(fallbackRead().concat(add)); return add.length;
        });
      });
    },
  };
  // Entries written to the localStorage fallback while IndexedDB was not
  // available (e.g. an earlier private window) still count.
  function fallbackLeftovers(fromIdb) {
    const fb = fallbackRead();
    if (!fb.length) return [];
    const seen = new Set(fromIdb.map(r => `${r.cardId}|${r.ts}|${r.rating}`));
    return fb.filter(r => !seen.has(`${r.cardId}|${r.ts}|${r.rating}`));
  }

  // ---------- Backup ----------
  const BACKUP_APP = 'farsi-flashcards';
  const BACKUP_FORMAT = 1;

  api.backup = {
    build() {
      api.data.prefs = api.collectPrefs();
      return api.reviews.all().then(reviews => ({
        app: BACKUP_APP, kind: 'backup', format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        store: clone(api.data),
        reviews,
      }));
    },
    fileName(d) {
      d = d || new Date();
      const p = n => String(n).padStart(2, '0');
      return `farsi-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    },
    markBackedUp(ts) {
      api.data.meta.lastBackupAt = ts || Date.now();
      api.save();
    },

    // Checks a parsed file. Accepts a backup from this app, or a raw v1 store
    // (the old app's localStorage blob), which is migrated on apply.
    // Returns {ok, error?, summary?, kind}.
    inspect(obj) {
      const fail = error => ({ ok: false, error });
      if (!obj || typeof obj !== 'object') return fail('This file is not a backup.');
      let store, reviews = [], kind = 'backup', exportedAt = null;
      if (obj.app === BACKUP_APP && obj.kind === 'backup') {
        if (obj.format > BACKUP_FORMAT) return fail('This backup was made by a newer version of the app.');
        store = obj.store;
        reviews = Array.isArray(obj.reviews) ? obj.reviews : null;
        exportedAt = obj.exportedAt || null;
        if (!reviews) return fail('The review log in this backup is damaged.');
        if (!store || store.version !== 2) return fail('The progress in this backup is damaged.');
      } else if (looksLikeV1(obj)) {
        kind = 'v1';
        store = obj;
      } else {
        return fail('This file is not a backup from this app.');
      }
      const srs = store.srs && typeof store.srs === 'object' ? store.srs : null;
      if (!srs) return fail('The progress in this backup is damaged.');
      for (const [k, st] of Object.entries(srs)) {
        if (!st || typeof st !== 'object' || !isFinite(st.due) || !isFinite(st.last) || !isFinite(st.s) || !isFinite(st.d)) {
          return fail(`The progress for ${k} is damaged.`);
        }
      }
      for (const r of reviews) {
        if (!r || typeof r.cardId !== 'string' || !isFinite(r.ts) || !(r.rating >= 1 && r.rating <= 4)) {
          return fail('The review log in this backup is damaged.');
        }
      }
      const ids = Object.keys(srs);
      let lastReview = 0;
      for (const st of Object.values(srs)) if (st.last > lastReview) lastReview = st.last;
      const known = kind === 'v1' ? null : ids.filter(id => F.cards && F.cards.byId.has(id)).length;
      return {
        ok: true, kind,
        summary: {
          exportedAt, cards: ids.length, knownCards: known,
          buried: Object.keys(store.buried || {}).length,
          reviews: reviews.length, lastReviewAt: lastReview || null,
          drill: Object.keys(store.drill || {}).length,
        },
        store, reviews,
      };
    },

    // Replaces the current progress with the inspected backup. The previous
    // store is kept under farsi-v2-before-import. Review logs are merged.
    apply(inspected) {
      const prevJson = JSON.stringify(api.data);
      try { ls().setItem(PRE_IMPORT_KEY, prevJson); } catch (e) { /* quota: carry on */ }
      const done = next => {
        // The file just restored is itself a backup, so count it as one.
        const fileTs = inspected.summary && Date.parse(inspected.summary.exportedAt);
        const lastBackupAt = Math.max(api.data.meta.lastBackupAt || 0,
          (next.meta && next.meta.lastBackupAt) || 0, fileTs || 0) || null;
        next.meta = Object.assign(emptyStore().meta, next.meta || {}, { importedAt: Date.now(), lastBackupAt });
        api.data = Object.assign(emptyStore(), next);
        api.readOnly = false;
        api.save();
        return api.reviews.merge(inspected.reviews || []);
      };
      if (inspected.kind === 'v1') {
        return loadLegacyMap().then(map => done(migrateV1(inspected.store, map).store));
      }
      return done(clone(inspected.store));
    },
  };

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', () => api.flush());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') api.flush(); });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
