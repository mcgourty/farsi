// Builds a realistic v1 store (the farsi-flashcards-v1 localStorage blob) by
// running reviews through the legacy app's own code: its cardKey(), its
// fsrsReview(), its day counters and its persistStore(). Used by the
// migration test, and run directly it writes tools/fixtures/v1-store.json for
// seeding a browser.
'use strict';

const fs = require('fs');
const path = require('path');
const { loadOldApp } = require('./old-app');

const DAY = 86400000;

// Returns {app, json, store, reviewedIdx, buriedIdx} or null without git.
function simulateV1({ seed = 7, start = Date.UTC(2026, 7, 1, 9) } = {}) {
  const app = loadOldApp({ now: start, seed });
  if (!app) return null;
  const run = app.run;
  const n = run('CARDS.length');

  // Pick cards: a spread from every session, every alphabet letter, and every
  // verb card whose key is shared with another card.
  const meta = JSON.parse(run('JSON.stringify(CARDS.map(c => [c.session, cardKey(c)]))'));
  const keyCount = {};
  for (const [, k] of meta) keyCount[k] = (keyCount[k] || 0) + 1;
  const bySession = {};
  meta.forEach(([s], i) => (bySession[s] = bySession[s] || []).push(i));
  const picked = new Set();
  for (const [s, idxs] of Object.entries(bySession)) {
    const step = Math.max(1, Math.floor(idxs.length / (s === 'verbs' ? 60 : 14)));
    for (let j = 0; j < idxs.length; j += step) picked.add(idxs[j]);
    if (s === 'alphabet') idxs.forEach(i => picked.add(i));
  }
  meta.forEach(([, k], i) => { if (keyCount[k] > 1) picked.add(i); });
  const reviewedIdx = [...picked].sort((a, b) => a - b);

  // Ten simulated days of study. Each day every picked card that is due (or
  // new) gets a grade from the seeded RNG, via the legacy scheduler.
  let t = start;
  for (let day = 0; day < 10; day++) {
    t = start + day * DAY + 3600000;
    app.setNow(t);
    for (const i of reviewedIdx) {
      t += 7000;
      app.setNow(t);
      run(`(() => {
        const c = CARDS[${i}];
        const k = cardKey(c);
        const prev = store.srs[k];
        if (prev && prev.due > Date.now() && ${day} > 0) return;
        const g = 1 + Math.floor(Math.random() * 4);
        if (!prev) bumpNewToday(newBucket(c));
        bumpRevToday();
        store.srs[k] = fsrsReview(prev, g, Date.now());
        delete store.buried[k];
      })()`);
    }
  }

  // Bury a few: some reviewed, some never seen, including a shared verb key.
  const sharedIdx = reviewedIdx.filter(i => keyCount[meta[i][1]] > 1);
  const buriedIdx = [reviewedIdx[3], reviewedIdx[40], sharedIdx[0], 5, 200, n - 3];
  for (const i of buriedIdx) run(`store.buried[cardKey(CARDS[${i}])] = Date.now() - ${i}`);

  // Non-default prefs and drill scores, then let the old app save.
  run(`activeSessions.delete('verbs'); activeDirection = 'both'; newPerDay = 40; frontMode = 'pinglish';
       hideMastered = true; typedMode = true; shuffled = false; studyMode = 'due'; tab = 'cards';
       activeTenses.delete('impneg'); activePersons.delete(5); activeVerbs.delete('kardan');
       store.drill['raftan|past|2'] = { r: 3, w: 1 }; store.drill['boodan|present|0'] = { r: 0, w: 2 };`);
  // A record whose card no longer exists (text edited before the split).
  run(`store.srs['22|vocabulary|farsi-to-english|OLD-SPELLING'] = { d: 5, s: 3, due: 1, last: 1, state: 'review', step: 0, reps: 2, lapses: 0 }`);
  run('persistStore()');
  const json = app.storage['farsi-flashcards-v1'];
  return { app, json, store: JSON.parse(json), reviewedIdx, buriedIdx, sharedIdx };
}

if (require.main === module) {
  const sim = simulateV1();
  if (!sim) { console.error('git unavailable'); process.exit(1); }
  const out = path.join(__dirname, '..', 'fixtures', 'v1-store.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sim.json);
  console.log(`wrote ${out}: ${Object.keys(sim.store.srs).length} srs, ${Object.keys(sim.store.buried).length} buried`);
}

module.exports = { simulateV1 };
