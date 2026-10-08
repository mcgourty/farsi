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
  F.verbs.config.allForms = true;
  F.cards.build();
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
test('card counts per session/type match the legacy app (all verb forms on)', () => {
  const { F } = loadApp();
  F.verbs.config.allForms = true;
  F.cards.build();
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
  app.F.verbs.config.allForms = true;   // the full verb deck; trimmed forms are opt-in
  app.F.cards.build();
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

// ---------------------------------------------------------------- verbs
// The verb meaning deck is trimmed on purpose: by default it holds each
// verb's infinitive, every form the lessons use (conj() output matched
// against lesson text), and present + simple past for man/to/oon of verbs
// the lessons use. All 5,644 legacy verb cards stay reachable with the
// "All verb forms" setting (F.verbs.config.allForms), and the legacy checks
// above run with it on. These pins move when a lesson uses new verb forms:
// update them deliberately (node -e to print the new numbers) after adding
// a lesson.
const VERB_CARDS_DEFAULT = 1320;   // was 5,644 (all forms); deck 8,254 -> 3,930
const VERB_CARDS_ALL = 5644;

test('verb deck: trimmed to the forms the lessons use, all forms opt-in', () => {
  const { F } = loadApp();
  const V = F.verbs;
  const verbCards = () => F.cards.all.filter(c => c.type === 'verbs');
  eq(verbCards().length, VERB_CARDS_DEFAULT, 'default verb cards (see VERB_CARDS_DEFAULT)');
  const def = new Set(verbCards().map(c => c.id));
  for (const v of V.VERBS) ok(def.has(`verb.${v.id}.inf:fa-en`) && def.has(`verb.${v.id}.inf:en-fa`), `infinitive of ${v.id}`);
  const u = V.lessonUsage();
  for (const v of V.VERBS) {
    if (!u.byVerb.get(v.id).lessons.length) continue;
    for (const t of ['present', 'past']) for (const p of ['1sg', '2sg', '3sg']) ok(def.has(`verb.${v.id}.${t}.${p}:fa-en`), `${v.id} ${t} ${p}`);
  }
  // forms met in lessons: s35 uses برمی‌دارم and برنداشتم; nobody uses nooshidan
  ok(def.has('verb.bardashtan.present.1sg:fa-en') && def.has('verb.bardashtan.pastneg.1sg:en-fa'), 'lesson forms kept');
  ok(def.has('verb.oomadan.continuous.1sg:fa-en'), 'continuous from lessons kept');
  ok(!def.has('verb.nooshidan.continuous.3pl:fa-en') && !def.has('verb.nooshidan.present.1sg:fa-en'), 'unused verb trimmed to its infinitive');
  ok(!def.has('verb.boodan.past.3pl:fa-en'), 'infinitive homograph is not counted as a lesson use');
  // card text of the kept cards is the full deck's text, unchanged
  F.verbs.config.allForms = true;
  F.cards.build();
  eq(verbCards().length, VERB_CARDS_ALL, 'all verb forms');
  for (const id of def) ok(F.cards.byId.has(id), `default card ${id} missing from the full deck`);
});

test('verb deck: trimmed cards with review history or a bury stay in the deck', async () => {
  const srsRec = { d: 5, s: 3, due: Date.UTC(2026, 9, 1), last: Date.UTC(2026, 8, 28), state: 'review', step: 0, reps: 2, lapses: 0 };
  const store = {
    version: 2,
    srs: { 'verb.nooshidan.continuous.3pl:en-fa': srsRec, '35.v.bala:fa-en': srsRec },
    buried: { 'verb.tarsidan.past.2pl:fa-en': 1 },
    drill: {}, newLog: {}, revLog: {}, prefs: {}, meta: { createdAt: 1 },
  };
  const app = loadApp({ storage: { 'farsi-v2': JSON.stringify(store) } });
  await app.F.store.init();
  app.F.cards.build();
  const has = id => app.F.cards.byId.has(id);
  // reviewed in one direction: both directions of the item stay
  ok(has('verb.nooshidan.continuous.3pl:en-fa') && has('verb.nooshidan.continuous.3pl:fa-en'), 'reviewed trimmed card kept');
  ok(has('verb.tarsidan.past.2pl:fa-en') && has('verb.tarsidan.past.2pl:en-fa'), 'buried trimmed card kept');
  ok(!has('verb.nooshidan.continuous.2pl:fa-en'), 'unreviewed neighbours still trimmed');
  eq(app.F.cards.all.filter(c => c.type === 'verbs').length, VERB_CARDS_DEFAULT + 4);
});

test('prefixed verbs: every form matches the legacy engine; bardāshtan gets a real breakdown', () => {
  const { F } = loadApp();
  const V = F.verbs;
  const o = legacy();
  if (o) {
    const oldForms = JSON.parse(o.run(`JSON.stringify((() => { const m = {};
      for (const v of VERBS) for (const t of ['present','negative','past','pastneg','continuous','imperative','impneg'])
        for (const pi of [0,1,2,3,4,5]) {
          if ((t === 'imperative' || t === 'impneg') && (!v.imp || (pi !== 1 && pi !== 4))) continue;
          if (t === 'continuous' && v.noCont) continue;
          const d = { v, tense: t, pi };
          m[v.id + '|' + t + '|' + pi] = { f: drillAnswer(d), b: drillBreakdown(d) };
        }
      return m; })())`));
    let n = 0;
    for (const [k, was] of Object.entries(oldForms)) {
      const [id, tense, pi] = k.split('|');
      const d = { v: V.byId(id), tense, pi: +pi };
      eq(V.drillAnswer(d), was.f, `form ${k}`);
      if (id !== 'bardashtan') eq(V.drillBreakdown(d), was.b, `breakdown ${k}`);
      n++;
    }
    ok(n >= 2740, `only ${n} forms compared`);
  } else warnings.push('git unavailable: verb forms checked for bardāshtan only');
  const b = V.byId('bardashtan');
  const form = (tense, pi) => V.drillAnswer({ v: b, tense, pi });
  const bd = (tense, pi) => V.drillBreakdown({ v: b, tense, pi });
  eq(form('present', 0), { pin: 'barmidāram', fa: 'برمی‌دارم' });
  eq(form('negative', 2), { pin: 'barnemidāreh', fa: 'برنمی‌داره' });
  eq(form('past', 0), { pin: 'bardāshtam', fa: 'برداشتم' });
  eq(form('pastneg', 0), { pin: 'barnadāshtam', fa: 'برنداشتم' });
  eq(form('continuous', 0), { pin: 'dāram barmidāram', fa: 'دارم برمی‌دارم' });
  eq(form('imperative', 1), { pin: 'bardār', fa: 'بردار' });
  eq(form('impneg', 4), { pin: 'barnadārid', fa: 'برندارید' });
  eq(bd('present', 0), 'bar + mi + dār + am');
  eq(bd('negative', 0), 'bar + nemi + dār + am');
  ok(bd('pastneg', 0).startsWith('bar + na + dāsht + am'), bd('pastneg', 0));
  ok(bd('imperative', 1).startsWith('bar + dār  '), bd('imperative', 1));
  for (const t of V.TENSES) ok(!/irregular/.test(bd(t.id, 1)), `${t.id} still says irregular`);
  eq(V.pastStem(b), { pin: 'dāsht', fa: 'داشت' });
});

function setPool(V, ids, tenses) {
  const out = [];
  for (const id of ids) out.push(...V.formsOf(V.byId(id), tenses && new Set(tenses)));
  return out;
}

test('drill sets: 10 prompts, no repeats, never the same verb twice in a row', () => {
  const { F } = loadApp();
  const V = F.verbs;
  const rng = seeded(7);
  const pools = [
    setPool(V, V.VERBS.map(v => v.id)),
    setPool(V, ['raftan', 'khordan', 'kardan']),
    setPool(V, ['raftan', 'boodan'], ['present', 'past']),
  ];
  for (const combos of pools) {
    for (let i = 0; i < 200; i++) {
      const set = V.buildSet({ combos, scores: {}, recent: new Set(), size: 10, rng });
      eq(set.length, 10, 'set size');
      eq(new Set(set.map(V.drillKey)).size, 10, 'no repeated prompt');
      for (let j = 1; j < set.length; j++) ok(set[j].v.id !== set[j - 1].v.id, `same verb twice: ${set.map(d => d.v.id).join(',')}`);
    }
  }
  // a wide pool mixes tenses and verbs within one set
  const set = V.buildSet({ combos: pools[0], scores: {}, recent: new Set(), size: 10, rng });
  ok(new Set(set.map(d => d.tense)).size >= 3, 'tenses mixed');
  ok(new Set(set.map(d => d.v.id)).size >= 5, 'verbs mixed');
  // a pool smaller than the set gives what there is
  eq(V.buildSet({ combos: setPool(V, ['raftan'], ['past']), scores: {}, size: 10, rng }).length, 6);
});

test('drill sets: weighted toward missed forms and recent verbs', () => {
  const { F } = loadApp();
  const V = F.verbs;
  const rng = seeded(11);
  const ids = V.VERBS.slice(0, 20).map(v => v.id);
  const combos = setPool(V, ids, ['present']);   // 120 prompts
  const scores = {};
  const missed = new Set(), known = new Set();
  combos.forEach((d, i) => {
    if (i % 6 === 0) { scores[V.drillKey(d)] = { r: 0, w: 3 }; missed.add(V.drillKey(d)); }
    if (i % 6 === 1) { scores[V.drillKey(d)] = { r: 6, w: 0 }; known.add(V.drillKey(d)); }
  });
  let m = 0, k = 0;
  for (let i = 0; i < 400; i++) {
    for (const d of V.buildSet({ combos, scores, recent: new Set(), rng })) {
      if (missed.has(V.drillKey(d))) m++;
      if (known.has(V.drillKey(d))) k++;
    }
  }
  ok(m > 4 * k, `missed ${m} vs known ${k}`);
  const recent = new Set(ids.slice(0, 4));   // 20% of the pool
  let r = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    for (const d of V.buildSet({ combos, scores: {}, recent, rng })) { total++; if (recent.has(d.v.id)) r++; }
  }
  ok(r / total > 0.3, `recent share ${(r / total).toFixed(2)}`);
});

test('verb list: grouped by lesson, newest first; recent verbs come from the newest 3 lessons', () => {
  const { F } = loadApp();
  const V = F.verbs;
  const groups = V.verbsByLesson();
  eq(groups[0].lessonId, '35');
  eq(groups[groups.length - 1].lessonId, null, 'verbs not in any lesson last');
  const all = groups.flatMap(g => g.verbs.map(v => v.id));
  eq(all.length, V.VERBS.length, 'each verb listed once');
  eq(new Set(all).size, V.VERBS.length);
  const recent = V.recentVerbIds(3);
  ok(recent.includes('bardashtan') && recent.includes('gozashtan') && recent.includes('zadan'), recent.join(','));
  ok(!recent.includes('nooshidan'));
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
  app.F.verbs.config.allForms = true;   // compare like for like with the legacy deck
  app.F.cards.build();
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

// ---------------------------------------------------------------- offline shell
test('sw.js VERSION matches the shell files (run node tools/bump-sw-version.js)', () => {
  const sw = require('./bump-sw-version');
  const files = sw.shellFiles();
  for (const f of ['index.html', 'js/legacy-keys.js', 'manifest.webmanifest', 'css/fonts.css']) ok(files.includes(f), `${f} not precached`);
  ok(files.some((f) => f.startsWith('fonts/')), 'font files not precached');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  eq([manifest.start_url, manifest.scope], ['./', './'], 'manifest start_url/scope must be relative');
  for (const i of manifest.icons) ok(files.includes(i.src), `manifest icon ${i.src} not precached`);
  eq(sw.currentVersion(), sw.computeVersion(), 'sw.js VERSION is stale: run node tools/bump-sw-version.js');
});

test('notes: every lesson notes file exists and renders; markdown is escaped and Persian isolated', () => {
  const { F } = loadApp();
  ok(F.md, 'js/md.js loaded');
  for (const l of F.lessons) {
    for (const f of l.notesFiles) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const r = F.md.render(src);
      ok(r.headings.some(h => h.level === 2), `${f}: has ## headings`);
      ok(!/<script|<img|on\w+=/i.test(r.html), `${f}: no raw HTML`);
      ok(!/\*\*/.test(r.html.replace(/<[^>]+>/g, '')), `${f}: no stray ** after rendering`);
    }
  }
  const r = F.md.render([
    '# T', '', '## Part 1 — تو', '', '| Farsi | Pinglish |', '|:-----:|---|', '| بالا | bālā |', '| <b>x</b> | `a|b` |', '',
    '> **پارسی** — *Pārsi*', '', '- one', '- two', '', '1. a', '2. b', '', '```', 'بزرگ → بزرگ‌تر', '```', '', '---',
    'line one  ', 'line **two** <script>alert(1)</script>', '', 'زندگی بالا و پایین داره.',
  ].join('\n'));
  ok(r.html.includes('&lt;script&gt;') && !r.html.includes('<script'), 'html escaped');
  ok(r.html.includes('&lt;b&gt;x&lt;/b&gt;'), 'html in table cells escaped');
  ok(/<td style="text-align:center" dir="rtl" lang="fa" class="fa-cell"><span class="fa-line" dir="rtl" lang="fa"><span class="fa" lang="fa" dir="rtl">بالا<\/span>/.test(r.html), 'persian cell');
  ok(r.html.includes('<code>a|b</code>'), 'pipe inside code stays in its cell');
  ok(r.html.includes('<blockquote><p'), 'blockquote');
  ok(r.html.includes('<ul><li') && r.html.includes('<ol><li'), 'lists');
  ok(r.html.includes('<pre class="md-pre"'), 'fence');
  ok(r.html.includes('<hr>'), 'hr');
  ok(r.html.includes('line one<br>line <strong>two</strong>'), 'line breaks kept');
  ok(r.html.includes('<p data-u="') && /dir="rtl" lang="fa">.*زندگی/.test(r.html), 'persian-only paragraph is rtl');
  eq(r.headings.map(h => h.level), [1, 2]);
  ok(r.units.some(u => u.cells && u.cells[0] === 'بالا'), 'table rows are units with cells');
  // normalisation for search
  eq(F.md.norm('Bālā  KHOOB'), 'bala khoob');
  eq(F.md.norm('می‌ذارم'), F.md.norm('میذارم'));
  eq(F.md.norm('كتاب ي'), 'کتاب ی');
  eq(F.md.norm('خُوشمَزه'), 'خوشمزه');
  const m = F.md.normMap('a  **Bā**');
  eq(m.n, 'a ba');
  eq(m.map, [0, 1, 5, 6]);
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
require('./test-stories')(test, { eq, ok, loadApp });
// ---------------------------------------------------------------- study: queue, siblings, learn, typed, cloze
// Loads the data modules plus the DOM-free UI modules of the study feature.
const STUDY_UI = ['js/ui/typed.js', 'js/ui/learn.js', 'js/ui/cloze.js'];
function loadStudy(opts = {}) {
  return loadApp(Object.assign({
    filter: src => !/^js\/(app\.js|audio\.js)/.test(src) && (!/^js\/ui\//.test(src) || STUDY_UI.includes(src)),
  }, opts));
}
const DAY = 86400000;

test('queue: new cards come newest lesson first, then older lessons, alphabet, verbs; budgets hold', () => {
  const { F } = loadApp();
  const now = Date.UTC(2026, 9, 8, 12);
  const base = F.cards.all;
  const q = F.cards.buildQueue({
    base, mode: 'due', shuffled: false, direction: 'both', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 30, en: 30 }, newOrder: 'newest',
  });
  eq(q.length, 60, 'per-direction budgets');
  eq(q.filter(c => F.cards.newBucket(c) === 'fa').length, 30);
  ok(q.every(c => c.session === '35'), 'all of the first 60 new cards are from session 35');
  // rank order over the whole deck
  const faBase = base.filter(c => !F.cards.directionExcluded(c, 'farsi-to-english'));
  const all = F.cards.buildQueue({
    base: faBase, mode: 'due', shuffled: false, direction: 'farsi-to-english', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 1e6, en: 1e6 }, newOrder: 'newest',
  });
  const order = [...new Set(all.map(c => c.session))];
  eq(order, ['35', '34', '33', '32', '31', '30', '29', '28', '27', '26', '24-25', '23', '22', 'alphabet', 'verbs']);
  // file order inside a lesson
  const s35 = all.filter(c => c.session === '35').map(c => c.id);
  const file = F.cards.all.filter(c => c.session === '35' && c.direction !== 'english-to-farsi').map(c => c.id);
  eq(s35, file, 'session 35 in file order');
  // shuffled: still newest lesson first
  const sh = F.cards.buildQueue({
    base: faBase, mode: 'due', shuffled: true, direction: 'farsi-to-english', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 50, en: 50 }, newOrder: 'newest',
  });
  ok(sh.every(c => c.session === '35'), 'shuffle stays inside the newest lesson');
  // default (no newOrder) keeps the legacy deck order
  const legacyQ = F.cards.buildQueue({
    base: faBase, mode: 'due', shuffled: false, direction: 'farsi-to-english', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 5, en: 5 },
  });
  ok(legacyQ.every(c => c.session === '22'), 'legacy order unchanged');
});

test('queue: sibling rule keeps one direction of an item per day', () => {
  const { F } = loadApp();
  const now = Date.UTC(2026, 9, 8, 12);
  const a = F.cards.byId.get('35.v.miz:fa-en'), b = F.cards.byId.get('35.v.miz:en-fa');
  const c = F.cards.byId.get('35.v.kif:fa-en'), d = F.cards.byId.get('35.v.kif:en-fa');
  const srs = {
    [a.id]: { due: now - 5000, last: now - 3 * DAY, s: 3, d: 5, state: 'review', reps: 2, lapses: 0 },
    [b.id]: { due: now - 9000, last: now - 3 * DAY, s: 3, d: 5, state: 'review', reps: 2, lapses: 0 },
    [c.id]: { due: now - 1000, last: now - 3 * DAY, s: 3, d: 5, state: 'review', reps: 2, lapses: 0 },
  };
  const opts = extra => Object.assign({
    base: [a, b, c, d], mode: 'due', shuffled: false, direction: 'both', now,
    srsOf: x => srs[x.id], isWeak: () => false, allowance: { fa: 20, en: 20 },
  }, extra);
  // legacy: everything, siblings spaced
  eq(F.cards.buildQueue(opts()).length, 4, 'no rule: all four');
  const deferred = [];
  const q = F.cards.buildQueue(opts({ siblingRule: true, siblingSeenToday: () => false, deferred }));
  eq(q.map(x => x.id), [b.id, c.id], 'most overdue direction wins; new twin of a due card waits');
  eq(deferred.map(x => x.id).sort(), [a.id, d.id].sort());
  // a sibling reviewed today keeps the other direction out
  const seen = x => x.itemId === '35.v.kif';
  const q2 = F.cards.buildQueue(opts({ siblingRule: true, siblingSeenToday: seen }));
  eq(q2.map(x => x.id), [b.id]);
  // cloze cards are siblings of their phrase
  eq(F.cards.siblingKey({ itemId: 'cloze.35.p.x.1', clozeOf: '35.p.x' }), '35.p.x');
});

test('queue: a new lesson item enters once, on the learn budget and its direction budget', () => {
  const { F } = loadApp();
  const now = Date.UTC(2026, 9, 8, 12);
  const base = F.cards.all.filter(c => c.session === '35');
  const q = F.cards.buildQueue({
    base, mode: 'due', shuffled: false, direction: 'both', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 20, en: 20, learn: 7 }, newOrder: 'newest', siblingRule: true, siblingSeenToday: () => false,
    needsIntro: () => true,
  });
  eq(q.length, 7, 'learn budget: 7 items');
  eq(new Set(q.map(c => c.itemId)).size, 7, 'one card per item');
  const q2 = F.cards.buildQueue({
    base: base.filter(c => c.direction === 'farsi-to-english'), mode: 'due', shuffled: false, direction: 'farsi-to-english', now, srsOf: () => undefined, isWeak: () => false,
    allowance: { fa: 3, en: 20, learn: 20 }, newOrder: 'newest', needsIntro: () => true,
  });
  eq(q2.length, 3, 'direction budget still applies');
});

test('typed: Persian normaliser, diff and suggested grade', () => {
  const { F } = loadStudy();
  const T = F.typed;
  const g = (typed, fa, pin) => { const r = T.checkFarsi(typed, fa, pin || ''); return r && [r.kind, r.grade]; };
  // Arabic vs Persian letters, harakat, tatweel, punctuation
  eq(T.canonFa('كتاب'), 'کتاب');
  eq(T.canonFa('علي'), 'علی');
  eq(T.canonFa('بَرداشتَن'), 'برداشتن');
  eq(T.canonFa('کـــتاب'), 'کتاب');
  eq(T.canonFa('  یخچال؟ '), 'یخچال');
  eq(T.canonFa('ماهی ‌ تابه'), 'ماهی‌تابه', 'spaces around a half-space collapse');
  eq(g('كليد', 'کلید'), ['exact', 3], 'ي/ك typed on an Arabic keyboard');
  eq(g('یخچال.', 'یخچال'), ['exact', 3]);
  eq(g('مُبل', 'مبل'), ['exact', 3], 'harakat ignored');
  // ZWNJ: missing or a space instead -> Hard
  eq(g('ماهیتابه', 'ماهی‌تابه'), ['spacing', 2]);
  eq(g('ماهی تابه', 'ماهی‌تابه'), ['spacing', 2]);
  eq(g('ماهي‌تابه', 'ماهی‌تابه'), ['exact', 3], 'ي with the right half-space');
  // one letter off -> Hard; more -> Again
  eq(g('کلیذ', 'کلید'), ['letter', 2]);
  eq(g('قلیذ', 'کلید'), ['wrong', 1]);
  eq(g('سگ', 'کلید'), ['wrong', 1]);
  // alternatives
  eq(g('توی', 'تو / توی'), ['exact', 3]);
  eq(g('می‌ذارم', 'می‌گذارم / می‌ذارم'), ['exact', 3]);
  // pinglish typed for an English -> Farsi card: Hard at best
  eq(g('kelid', 'کلید', 'kelid / kilid'), ['pinglish', 2]);
  eq(g('mahi tabeh', 'ماهی‌تابه', 'māhi-tābeh'), ['pinglish', 2]);
  eq(g('ketab', 'کلید', 'kelid'), ['wrong', 1]);
  eq(T.checkFarsi('   ', 'کلید', 'kelid'), null);
  // diff marks
  eq(T.diff('ماهیتابه', 'ماهی‌تابه'), [{ t: 'ok', s: 'ماهی' }, { t: 'miss', s: '‌' }, { t: 'ok', s: 'تابه' }]);
  eq(T.diff('کلیذ', 'کلید'), [{ t: 'ok', s: 'کلی' }, { t: 'extra', s: 'ذ' }, { t: 'miss', s: 'د' }]);
  ok(/d-gap/.test(T.diffHTML(T.diff('ماهیتابه', 'ماهی‌تابه'))), 'missing half-space is drawn');
  // pinglish recall (Farsi -> English cards)
  eq(T.checkPinglish('mahi taabe', 'māhi-tābeh').grade, 1);
  eq(T.checkPinglish('mahitabeh', 'māhi-tābeh').grade, 3);
});

test('cloze: deterministic, stable ids, conservative, session 35 prepositions', () => {
  const a = loadStudy().F, b = loadStudy().F;
  const za = a.cards.all.filter(c => c.type === 'cloze');
  const zb = b.cards.all.filter(c => c.type === 'cloze');
  ok(za.length > 100, `cloze cards: ${za.length}`);
  eq(za.map(c => [c.id, c.cloze.options, c.cloze.answerIndex]), zb.map(c => [c.id, c.cloze.options, c.cloze.answerIndex]), 'same ids and options every build');
  const perPhrase = {};
  for (const c of za) {
    ok(/^cloze\.[a-z0-9.-]+\.\d+:cloze$/.test(c.id), `cloze id ${c.id}`);
    eq(c.id, `cloze.${c.clozeOf}.${c.cloze.k}:cloze`);
    const src = a.cards.item(c.clozeOf);
    ok(src && (src.type === 'phrases' || src.type === 'story'), `source of ${c.id}`);
    eq(c.session, a.cards.cardsOf(c.clozeOf)[0].session, 'session of the phrase');
    eq(c.direction, 'cloze');
    ok(src.fa.trim().split(/\s+/).length >= 3, `short sentence ${src.fa}`);
    eq(c.cloze.options.length, 4);
    eq(new Set(c.cloze.options).size, 4, `distinct options ${c.id}`);
    perPhrase[c.clozeOf] = (perPhrase[c.clozeOf] || 0) + 1;
  }
  ok(Object.values(perPhrase).every(n => n <= 2), 'at most two per phrase');
  // ids are the token index: stable while the sentence keeps its words
  const z = a.cards.byId.get('cloze.35.p.ghaza-tuye-yakhchal-eh.1:cloze');
  ok(z, 'غذا توی یخچاله: توی is blanked');
  eq(z.cloze.options[z.cloze.answerIndex], 'توی');
  const place = ['توی', 'روی', 'زیرِ', 'کنارِ', 'جلوی', 'پشتِ'];
  ok(z.cloze.options.every(o => place.includes(o)), 'distractors are other place prepositions');
  const zir = a.cards.byId.get('cloze.35.p.gorbeh-zir-e-sandali-bood.1:cloze');
  eq(zir.cloze.options[zir.cloze.answerIndex], 'زیرِ', 'shown with its ezāfe');
  ok(!a.cards.byId.has('cloze.35.p.zendegi-bala-o-payin-dareh.3:cloze'), '"bālā-o pāyin" is not a preposition');
  const verb = a.cards.byId.get('cloze.35.p.man-kenar-e-to-mishinam.1:cloze');
  ok(verb, 'preposition preferred over the verb ending');
  // the generator adds only cloze cards: every legacy card is still there, in order
  eq(a.cards.all.filter(c => c.type !== 'cloze').map(c => c.id), loadApp().F.cards.all.map(c => c.id));
  ok(a.cards.TYPES.some(t => t.id === 'cloze'), 'type filter');
  ok(!a.cards.sessions.some(s => s.id === 'cloze'), 'no extra session');
  eq(a.cards.directionExcluded(z, 'english-to-farsi'), false, 'cloze shows in either direction');
});

test('learn: presentation -> check -> first FSRS review; undo', async () => {
  const { F } = loadStudy();
  await F.store.init();
  const id = '35.v.miz';
  const fa = F.cards.byId.get(id + ':fa-en'), en = F.cards.byId.get(id + ':en-fa');
  ok(F.learn.isLearnableItem(id));
  ok(!F.learn.isLearnableItem('alpha.alef'), 'letters are tested directly');
  ok(!F.learn.isLearnableItem('verb.boodan.inf'), 'generated verb forms are tested directly');
  ok(F.learn.needsIntro(fa) && F.learn.needsIntro(en));
  const pending0 = F.learn.pending('35');
  ok(pending0 > 100, `pending ${pending0}`);
  eq(F.learn.nextSession(), '35', 'newest lesson first');
  eq(F.learn.checkCard(id).id, en.id, 'check is English -> Farsi by default');
  const now = Date.now();
  const rec = F.learn.complete(id, 3, now);
  const s = F.store.srs(en.id);
  eq([s.state, s.step, s.reps], ['learning', 1, 1], 'Good: first learning step');
  eq(s.due - now, 10 * 60000, 'back in 10 minutes');
  ok(!F.store.srs(fa.id), 'the other direction stays new');
  ok(F.learn.isIntroduced(id) && F.learn.introducedToday(id));
  ok(!F.learn.needsIntro(fa), 'introduced: the other direction is tested, not presented');
  eq(F.learn.pending('35'), pending0 - 1);
  eq(F.store.newToday('learn'), 1);
  eq(F.store.newToday('en'), 1);
  ok(!F.learn.introducedBefore(id, F.learn.startOfToday(now)), 'cloze of a phrase learnt today waits');
  eq(F.learn.budget().left, 19);
  // Not yet -> Again
  F.learn.complete('35.v.kif', 1, now);
  eq(F.store.srs('35.v.kif:en-fa').state, 'learning');
  eq(F.store.srs('35.v.kif:en-fa').due - now, 60000);
  // undo
  F.learn.undo(rec);
  ok(!F.store.srs(en.id) && !F.learn.isIntroduced(id), 'undo restores new');
  eq(F.store.newToday('learn'), 1);
  eq(F.store.newToday('en'), 1);
  await new Promise(r => setTimeout(r, 10));
  const log = await F.store.reviews.all();
  eq(log.map(r => r.cardId), ['35.v.kif:en-fa'], 'review log entry removed');
  // items reviewed before learn mode count as introduced
  const old = F.lessons.find(l => l.id === '34').items[0];
  F.store.setSrs(F.cards.cardsOf(old.id)[0].id, { d: 5, s: 3, due: now, last: now - DAY, state: 'review', step: 0, reps: 1, lapses: 0 });
  ok(F.learn.isIntroduced(old.id) && F.learn.introducedBefore(old.id, F.learn.startOfToday(now)));
});

test('examples: rotate by review count, tolerate missing or broken data', () => {
  const { F } = loadStudy();
  ok(F.cards.examplesFor('35.v.miz').length >= 2, 'lesson data carries examples');
  delete F.cards.item('35.v.miz').examples;   // the rest of this test drives F.examples
  eq(F.cards.examplesFor('35.v.miz'), [], 'no data');
  eq(F.cards.exampleFor('35.v.miz', 3), null);
  F.examples = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'examples-sample.json'), 'utf8'));
  const seen = [0, 1, 2, 3].map(n => F.cards.exampleFor('35.v.miz', n).en);
  eq(seen[0] === seen[3], true, 'wraps around');
  eq(new Set(seen.slice(0, 3)).size, 3, 'a different sentence each review');
  eq(F.cards.examplesFor('35.v.broken'), [], 'entries without fa dropped');
  eq(F.cards.exampleFor('nope', 1), null);
  // examples written on the item itself win
  F.cards.item('35.v.kif').examples = [{ fa: 'کیفم کجاست؟', en: 'Where is my bag?' }];
  eq(F.cards.exampleFor('35.v.kif', 7).en, 'Where is my bag?');
  ok(/<mark>میز<\/mark>/.test(F.learn.exampleHTML(F.cards.exampleFor('35.v.miz', 0), F.cards.item('35.v.miz'))), 'target word marked');
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
