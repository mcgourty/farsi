#!/usr/bin/env node
// node tools/test.js  - no npm dependencies.
// Loads the app's data modules in a vm (tools/load.js) and checks ids, card
// counts against the legacy single-file app, the v1 -> v2 migration, the
// FSRS maths, queue building, and backup validation.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadApp, memoryStorage, ROOT } = require('./load');
const { loadOldApp, makeContext } = require('./legacy/old-app');
const { simulateV1 } = require('./legacy/simulate-v1');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg || 'not equal'}\n  got:      ${ja && ja.slice(0, 400)}\n  expected: ${jb && jb.slice(0, 400)}`);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || 'assertion failed'); };
let warnings = [];

function withLegacyKeys(app) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'legacy-keys.js'), 'utf8'), app.ctx);
  return app.F.LEGACY_KEYS;
}

// Expected per-session/type counts from the legacy app, frozen in a fixture
// so the test still runs without git. Sessions added later are not checked.
const COUNTS_FIXTURE = path.join(__dirname, 'fixtures', 'legacy-counts.json');
let old = null;   // legacy app vm, if git is available
function legacy() { if (old === null) old = loadOldApp() || false; return old || null; }

function countBy(cards) {
  const m = {};
  for (const c of cards) { const k = `${c.session}/${c.type}`; m[k] = (m[k] || 0) + 1; }
  return m;
}

// ---------------------------------------------------------------- ids
test('lesson files register lessons with unique, well-formed item ids', () => {
  const { F } = loadApp();
  ok(F.lessons.length >= 14, 'expected at least 14 lessons');
  const seen = new Set();
  for (const l of F.lessons) {
    for (const it of l.items) {
      ok(!seen.has(it.id), `duplicate item id ${it.id}`);
      seen.add(it.id);
      ok(/^[a-z0-9][a-z0-9.-]*$/.test(it.id), `bad item id ${it.id}`);
      if (l.kind === 'alphabet') ok(it.id.startsWith('alpha.'), `alphabet id ${it.id}`);
      else ok(it.id.startsWith(l.id + '.'), `item ${it.id} does not start with its lesson id ${l.id}`);
      if (it.type === 'letter') {
        for (const f of ['name', 'sound', 'isolated', 'initial', 'medial', 'final']) ok(it[f], `${it.id} missing ${f}`);
      } else {
        for (const f of ['fa', 'pin', 'en']) ok(typeof it[f] === 'string' && it[f], `${it.id} missing ${f}`);
      }
    }
  }
});

test('no duplicate card ids; card id = itemId:direction', () => {
  const { F } = loadApp();
  const ids = new Set();
  for (const c of F.cards.all) {
    ok(!ids.has(c.id), `duplicate card id ${c.id}`);
    ids.add(c.id);
    ok(c.id === `${c.itemId}:${F.cards.DIR_CODE[c.direction]}`, `card id ${c.id}`);
  }
  ok(F.cards.byId.size === F.cards.all.length);
});

test('verb card ids are verb id + form', () => {
  const { F } = loadApp();
  ok(F.cards.byId.has('verb.boodan.inf:fa-en'));
  ok(F.cards.byId.has('verb.boodan.past.3pl:en-fa'));
  ok(F.cards.byId.get('verb.boodan.past.3pl:fa-en').farsi === F.cards.byId.get('verb.boodan.inf:fa-en').farsi,
    'infinitive and 3pl past are homographs but now separate cards');
});

test('sessions and default selection come from the registry', () => {
  const { F } = loadApp();
  eq(F.cards.sessions.map(s => s.id),
    ['22', '23', '24-25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', 'alphabet', 'verbs']);
  eq(F.cards.newestLesson().id, '35');
  eq(F.cards.sessions.find(s => s.id === '24-25').label, 'Sessions 24-25');
});

// ---------------------------------------------------------------- counts
test('card counts per session/type match the legacy app', () => {
  const { F } = loadApp();
  const now = countBy(F.cards.all);
  let expected;
  const o = legacy();
  if (o) {
    expected = JSON.parse(o.run('JSON.stringify((() => { const m = {}; for (const c of CARDS) { const k = c.session + "/" + c.type; m[k] = (m[k] || 0) + 1; } return m; })())'));
    if (!fs.existsSync(COUNTS_FIXTURE)) fs.writeFileSync(COUNTS_FIXTURE, JSON.stringify(expected, null, 2) + '\n');
  } else {
    expected = JSON.parse(fs.readFileSync(COUNTS_FIXTURE, 'utf8'));
    warnings.push('git unavailable: counts checked against tools/fixtures/legacy-counts.json');
  }
  for (const [k, n] of Object.entries(expected)) eq(now[k], n, `count for ${k}`);
  eq(Object.values(expected).reduce((a, b) => a + b, 0), 8254, 'legacy total');
});

test('every card the legacy app had still exists with identical text (pairing)', () => {
  if (!legacy()) { warnings.push('git unavailable: skipped text pairing'); return; }
  const { pairDecks } = require('./legacy/build-legacy-keys');
  pairDecks();   // throws on any difference
});

test('legacy key map points only at existing cards and covers every old key', () => {
  const app = loadApp();
  const map = withLegacyKeys(app);
  const missing = [];
  for (const ids of Object.values(map)) for (const id of ids) if (!app.F.cards.byId.has(id)) missing.push(id);
  const lessonMissing = missing.filter(id => !id.startsWith('verb.'));
  ok(!lessonMissing.length, `legacy map ids missing from the deck: ${lessonMissing.slice(0, 5).join(', ')}`);
  if (missing.length) warnings.push(`${missing.length} legacy verb card ids are no longer in the deck; their v1 progress migrates but is unused`);
  const o = legacy();
  if (o) {
    const keys = JSON.parse(o.run('JSON.stringify([...new Set(CARDS.map(cardKey))])'));
    for (const k of keys) ok(map[k], `old key not mapped: ${k}`);
    eq(Object.keys(map).length, keys.length, 'map size');
  }
});

// ---------------------------------------------------------------- FSRS
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

test('FSRS outputs match the legacy scheduler (with and without fuzz)', () => {
  const ctxOld = makeContext();
  const html = require('./legacy/old-app').legacyHtml();
  if (!html) { warnings.push('git unavailable: skipped FSRS comparison'); return; }
  const src = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
  const fsrsSrc = src.slice(src.indexOf('// ===== FSRS-6 scheduler'), src.indexOf('function srsOf('));
  const rOld = seeded(42), rNew = seeded(42);
  ctxOld.ctx.Math.random = rOld;
  ctxOld.run(fsrsSrc);
  const math = Object.create(Math); math.random = rNew;
  const { F } = loadApp({ Math: math });
  const drive = seeded(9);
  let n = 0;
  for (let seq = 0; seq < 300; seq++) {
    let a = null, b = null;
    let t = Date.UTC(2026, 0, 1) + seq * 1000;
    const noFuzz = seq % 3 === 0;
    for (let step = 0; step < 14; step++) {
      const g = 1 + Math.floor(drive() * 4);
      const gap = [0, 60e3, 600e3, 3600e3, 86400e3, 3 * 86400e3, 20 * 86400e3, 90 * 86400e3][Math.floor(drive() * 8)];
      t += gap;
      a = JSON.parse(ctxOld.run(`JSON.stringify(fsrsReview(${JSON.stringify(a)}, ${g}, ${t}, ${noFuzz}))`));
      b = F.fsrs.review(b, g, t, noFuzz);
      eq(b, a, `seq ${seq} step ${step} grade ${g}`);
      t = Math.max(t, a.due - (drive() < 0.5 ? 0 : 3600e3));
      n++;
    }
  }
  for (const ms of [1, 59e3, 61e3, 3599e3, 7200e3, 86400e3 * 3, 86400e3 * 45, 86400e3 * 400]) {
    eq(F.fsrs.fmtIvl(ms), ctxOld.run(`fmtIvl(${ms})`), `fmtIvl ${ms}`);
  }
  ok(n === 4200);
});

// ---------------------------------------------------------------- migration
let simCache;
function sim() { if (simCache === undefined) simCache = simulateV1() || null; return simCache; }

test('migration: every reviewed card keeps its exact FSRS state under its new id', () => {
  const s = sim();
  if (!s) { warnings.push('git unavailable: skipped migration simulation'); return; }
  const app = loadApp();
  const map = withLegacyKeys(app);
  const { pairDecks } = require('./legacy/build-legacy-keys');
  const { oldCards, cards } = pairDecks();
  const { store, report } = app.F.store.migrateV1(s.store, map, Date.UTC(2026, 8, 1));
  let checked = 0;
  oldCards.forEach((o, i) => {
    const before = s.store.srs[o.key];
    const after = store.srs[cards[i].id];
    if (!before) { ok(!after, `card ${cards[i].id} gained progress`); return; }
    eq(after, before, `srs for ${cards[i].id} (old key ${o.key})`);
    checked++;
    const wasBuried = s.store.buried[o.key];
    eq(store.buried[cards[i].id], wasBuried, `buried for ${cards[i].id}`);
  });
  ok(checked >= 450, `only ${checked} reviewed cards checked`);
  // every session, alphabet and verbs are represented
  const sessions = new Set(cards.filter(c => store.srs[c.id]).map(c => c.session));
  eq([...sessions].sort(), ['22', '23', '24-25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', 'alphabet', 'verbs'].sort(), 'sessions covered');
  // collisions: shared keys copied to every card that shared them
  ok(report.shared > 0, 'simulation covered shared keys');
  for (const i of s.sharedIdx) {
    const k = oldCards[i].key;
    for (const id of map[k]) eq(store.srs[id], s.store.srs[k], `shared key ${k} -> ${id}`);
  }
  // buried-but-never-reviewed cards come across too
  for (const i of s.buriedIdx) eq(store.buried[cards[i].id], s.store.buried[oldCards[i].key], `buried ${cards[i].id}`);
  // everything else carried over
  eq(store.prefs, s.store.prefs, 'prefs');
  eq(store.newLog, s.store.newLog, 'newLog');
  eq(store.revLog, s.store.revLog, 'revLog');
  eq(store.drill, s.store.drill, 'drill');
  ok(store.meta.legacyOrphans.srs['22|vocabulary|farsi-to-english|OLD-SPELLING'], 'orphan kept');
  eq(report.orphaned, 1, 'orphans');
  // pure: input untouched
  ok(!s.store.version && s.store.srs[oldCards[s.reviewedIdx[0]].key], 'v1 input not mutated');
});

test('migration: legacy mastery map converts like the old app did', () => {
  const o = legacy();
  if (!o) { warnings.push('git unavailable: skipped mastery migration'); return; }
  const app = loadApp();
  const map = withLegacyKeys(app);
  const keys = JSON.parse(o.run('JSON.stringify(CARDS.slice(0, 6).map(cardKey))'));
  const mastery = { [keys[0]]: { s: 3, a: 1 }, [keys[1]]: { s: 0, a: 2 }, [keys[2]]: { s: 0, a: 0 } };
  o.run(`store.srs = {}; store.mastery = ${JSON.stringify(mastery)}; store.migratedV2 = false; migrateLegacyMastery();`);
  const expected = JSON.parse(o.run('JSON.stringify(store.srs)'));
  const { store } = app.F.store.migrateV1({ srs: {}, mastery, migratedV2: false }, map, Date.now());
  for (const k of Object.keys(expected)) {
    const got = store.srs[map[k][0]];
    for (const f of ['d', 's', 'state', 'step', 'reps', 'lapses']) eq(got[f], expected[k][f], `${k}.${f}`);
  }
  eq(Object.keys(store.srs).length, 2, 'empty mastery entries skipped');
});

test('store.init: migrates v1 once into farsi-v2, leaves v1 untouched, re-merges newer v1 reviews', async () => {
  const s = sim();
  if (!s) { warnings.push('git unavailable: skipped store.init'); return; }
  const storage = memoryStorage({ 'farsi-flashcards-v1': s.json });
  const app = loadApp({ localStorage: storage });
  withLegacyKeys(app);
  const F = app.F;
  await F.store.init();
  ok(F.store.status.migrated, 'migration ran');
  eq(storage.getItem('farsi-flashcards-v1'), s.json, 'v1 untouched');
  const v2 = JSON.parse(storage.getItem('farsi-v2'));
  eq(v2.version, 2);
  eq(Object.keys(v2.srs).length, F.store.status.migrated.cards);

  // second boot: no migration
  const app2 = loadApp({ localStorage: storage });
  withLegacyKeys(app2);
  await app2.F.store.init();
  ok(!app2.F.store.status.migrated, 'no second migration');
  eq(app2.F.store.data.srs, v2.srs);

  // an old cached page reviews a card in v1 after the migration
  const v1 = JSON.parse(s.json);
  const k = Object.keys(v1.srs).find(x => x.startsWith('35|'));
  v1.srs[k] = Object.assign({}, v1.srs[k], { last: v1.srs[k].last + 5 * 86400000, reps: 99 });
  storage.setItem('farsi-flashcards-v1', JSON.stringify(v1));
  const app3 = loadApp({ localStorage: storage });
  withLegacyKeys(app3);
  await app3.F.store.init();
  ok(app3.F.store.status.mergedFromV1 >= 1, 'merged newer v1 data');
  const id = app3.F.LEGACY_KEYS[k][0];
  eq(app3.F.store.data.srs[id].reps, 99, 'newer v1 review wins');
});

test('prefs from v1 are applied (sessions, direction, verbs off, ...)', async () => {
  const s = sim();
  if (!s) return;
  const app = loadApp({ storage: { 'farsi-flashcards-v1': s.json } });
  withLegacyKeys(app);
  await app.F.store.init();
  eq(app.F.store.data.prefs.direction, 'both');
  eq(app.F.store.data.prefs.newPerDay, 40);
  ok(!app.F.store.data.prefs.sessions.includes('verbs'));
  eq(app.F.store.data.prefs.verbsOff, ['kardan']);
});

// ---------------------------------------------------------------- queues
test('due/new queue matches the legacy app for the same store', () => {
  const s = sim();
  if (!s) { warnings.push('git unavailable: skipped queue comparison'); return; }
  const at = Date.UTC(2026, 7, 14, 9);
  const app = loadApp();
  const map = withLegacyKeys(app);
  const F = app.F;
  const { store } = F.store.migrateV1(s.store, map, at);
  const { pairDecks } = require('./legacy/build-legacy-keys');
  const { oldCards, cards } = pairDecks();
  const idOfOld = new Map(oldCards.map((o, i) => [i, cards[i].id]));
  for (const [direction, sessions] of [
    ['farsi-to-english', null], ['english-to-farsi', null], ['both', ['22', '31', '35', 'alphabet']],
  ]) {
    const o = loadOldApp({ now: at, storage: { 'farsi-flashcards-v1': s.json } });
    const sess = sessions || ['22', '23', '24-25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', 'alphabet', 'verbs'];
    const oldQueue = JSON.parse(o.run(`activeSessions = new Set(${JSON.stringify(sess)}); activeTypes = new Set(types.map(t => t.id));
      activeDirection = ${JSON.stringify(direction)}; hideMastered = false; shuffled = false; studyMode = 'due'; newPerDay = 20;
      applyFilters(); JSON.stringify(queue.map(c => CARDS.indexOf(c)))`));
    const f = { sessions: new Set(sess), types: new Set(F.cards.TYPES.map(t => t.id)), direction };
    const srsOf = c => store.srs[c.id];
    const base = F.cards.all.filter(c => F.cards.matchesFilters(c, f) && !store.buried[c.id]);
    const newToday = b => { const d = store.newLog[`2026-8-14`]; return (d && d[b]) || 0; };
    const q = F.cards.buildQueue({
      base, mode: 'due', shuffled: false, direction, now: at, srsOf,
      isWeak: () => false, allowance: { fa: 20 - newToday('fa'), en: 20 - newToday('en') },
    });
    eq(q.map(c => c.id), oldQueue.map(i => idOfOld.get(i)), `queue for ${direction}`);
    ok(q.length > 20, `queue for ${direction} is non-trivial (${q.length})`);
  }
});

// ---------------------------------------------------------------- backup
test('backup: build -> inspect -> apply round trip; bad files rejected', async () => {
  const s = sim();
  const storage = memoryStorage(s ? { 'farsi-flashcards-v1': s.json } : {});
  const app = loadApp({ localStorage: storage });
  withLegacyKeys(app);
  const F = app.F;
  await F.store.init();
  await F.store.reviews.append({ cardId: '35.v.bala:fa-en', ts: 1, rating: 3, elapsedDays: null });
  const backup = JSON.parse(JSON.stringify(await F.store.backup.build()));
  eq(backup.reviews.length, 1);
  const res = F.store.backup.inspect(backup);
  ok(res.ok, res.error);
  eq(res.summary.cards, Object.keys(F.store.data.srs).length);
  eq(res.summary.reviews, 1);

  for (const bad of [null, 5, {}, { app: 'farsi-flashcards', kind: 'backup', format: 1, store: { version: 2, srs: { x: { d: 'a' } } }, reviews: [] },
    { app: 'farsi-flashcards', kind: 'backup', format: 99, store: {}, reviews: [] },
    { app: 'farsi-flashcards', kind: 'backup', format: 1, store: { version: 2, srs: {} }, reviews: [{ cardId: 'x', ts: 1, rating: 9 }] }]) {
    ok(!F.store.backup.inspect(bad).ok, `accepted bad file ${JSON.stringify(bad)}`);
  }

  // apply onto an empty device
  const storage2 = memoryStorage();
  const app2 = loadApp({ localStorage: storage2 });
  await app2.F.store.init();
  await app2.F.store.backup.apply(app2.F.store.backup.inspect(backup));
  eq(app2.F.store.data.srs, F.store.data.srs, 'srs restored');
  ok(storage2.getItem('farsi-v2-before-import'), 'safety copy kept');
  eq((await app2.F.store.reviews.all()).length, 1, 'reviews restored');
  await app2.F.store.backup.apply(app2.F.store.backup.inspect(backup));
  eq((await app2.F.store.reviews.all()).length, 1, 'reviews merged without duplicates');

  // a raw v1 blob is accepted and migrated
  if (s) {
    const r = app2.F.store.backup.inspect(JSON.parse(s.json));
    ok(r.ok && r.kind === 'v1', 'v1 blob accepted');
    app2.F.LEGACY_KEYS = app.F.LEGACY_KEYS;
    await app2.F.store.backup.apply(r);
    eq(Object.keys(app2.F.store.data.srs).length, Object.keys(F.store.data.srs).length);
  }
});

// ---------------------------------------------------------------- progress (js/ui/progress.js)
test('progress: known words, forecast, streak with rest days, timing', () => {
  const { F } = loadApp({ filter: src => !/^js\/(ui\/(?!progress\.js)|app\.js|audio\.js)/.test(src) });
  const P = F.progress;
  ok(P && P.itemStats, 'F.progress loaded');
  const day = 86400000, now = new Date(2026, 9, 8, 12).getTime();
  const cards = [
    { id: 'a:fa-en', itemId: 'a', session: 's' }, { id: 'a:en-fa', itemId: 'a', session: 's' },
    { id: 'b:fa-en', itemId: 'b', session: 's' }, { id: 'b:en-fa', itemId: 'b', session: 's' },
    { id: 'c:fa-en', itemId: 'c', session: 's' }, { id: 'c:en-fa', itemId: 'c', session: 's' },
    { id: 'l:letter', itemId: 'l', session: 'alphabet' },
  ];
  const srs = {
    'a:fa-en': { state: 'review', s: 30, due: now + 2 * day }, 'a:en-fa': { state: 'review', s: 25, due: now - day },
    'b:fa-en': { state: 'review', s: 40, due: now + 10 * day }, 'b:en-fa': { state: 'learning', s: 1, due: now + 3600e3 },
    'l:letter': { state: 'review', s: 21, due: now + 6 * day },
  };
  const st = P.itemStats(cards, id => srs[id]);
  eq([st.total.known, st.total.learning, st.total.new, st.total.oneWay], [2, 1, 1, 1], 'known only when every card is');
  eq(st.bySession.get('alphabet').known, 1);
  const fc = P.forecast(cards, id => srs[id], () => false, now, 7);
  eq(fc.map(d => d.n), [2, 0, 1, 0, 0, 0, 1], 'forecast per day (overdue in today)');
  eq(fc.overdue, 1);
  const log = {};
  const key = n => F.util.dayKey(new Date(now - n * day));
  for (const n of [1, 2, 4, 5, 6, 8, 9, 13]) log[key(n)] = 5;   // rest on 3, 7, 10, 11, 12
  const sk = P.streak(log, now);
  // walking back: rest 3, 7 ok; 10 and 11 make 3 rest days in a 7-day window with 7 -> stops at 11
  eq([sk.days, sk.studied, sk.today], [9, 7, false], 'streak spans yesterday back to day 9');
  log[key(0)] = 1;
  eq(P.streak(log, now).days, 10, 'today extends it');
  eq(P.streak({}, now).days, 0);
  eq(P.dailyReviews(log, 30, now).length, 30);
  eq(P.dailyReviews(log, 30, now)[29].n, 1, 'last entry is today');
  eq(P.rates().review, P.DEFAULT_REVIEW_SEC, 'defaults without a log');
  for (let i = 0; i < 25; i++) P.addTiming({ durationMs: 6000, stateBefore: 'review' });
  for (let i = 0; i < 12; i++) P.addTiming({ durationMs: 10000, stateBefore: 'new' });
  P.addTiming({ durationMs: 600000, stateBefore: 'review' });   // idle, ignored
  eq([P.rates().review, P.rates().fresh, P.rates().calibrated], [6, 22, true]);
  eq(P.fmtMinutes(P.estimateSec(10, 0)), '1 min');
});

// ---------------------------------------------------------------- run
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${t.name}\n     ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n     ')}`);
    }
  }
  for (const w of [...new Set(warnings)]) console.log(`warn ${w}`);
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
