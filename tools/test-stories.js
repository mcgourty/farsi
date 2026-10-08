// Tests for practice stories, example sentences and the shared lemmatiser.
// Registered from tools/test.js: require('./test-stories')(test, { eq, ok, loadApp }).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = function register(test, { eq, ok, loadApp }) {
  const ROOT = path.resolve(__dirname, '..');
  const lemma = require('../js/lemma.js');
  const stripPunct = s => lemma.key(s).replace(/[.!?؟،]/g, '').trim();

  test('examples: only on vocabulary, non-empty sentences, never the item itself, shipped sources', () => {
    const { F } = loadApp();
    const storyIds = new Set((F.stories || []).map(s => s.id));
    let n = 0;
    for (const l of F.lessons) {
      for (const it of l.items) {
        if (it.examples === undefined) continue;
        eq(it.type, 'vocabulary', `${it.id}: examples on a ${it.type} item`);
        ok(Array.isArray(it.examples) && it.examples.length > 0 && it.examples.length <= 4, `${it.id}: 1-4 examples`);
        for (const ex of it.examples) {
          n++;
          ok(typeof ex.fa === 'string' && ex.fa.trim(), `${it.id}: example without Persian`);
          ok(typeof ex.en === 'string' && ex.en.trim(), `${it.id}: example without English`);
          ok(typeof ex.pin === 'string', `${it.id}: example pin must be a string`);
          ok(stripPunct(ex.fa) !== stripPunct(it.fa), `${it.id}: lists itself as an example`);
          const m = /^story:(st-.+)$/.exec(ex.source || '');
          ok(!m || storyIds.has(m[1]), `${it.id}: example from unshipped story ${ex.source}`);
        }
      }
    }
    ok(n > 500, `expected many example sentences, got ${n}`);
  });

  test('examples: lesson files are in sync with tools/stories-src/examples.json', () => {
    execFileSync(process.execPath, [path.join(__dirname, 'apply-examples.js'), '--check'], { cwd: ROOT, stdio: 'pipe' });
  });

  test('stories: well formed, generated, one per known lesson, coverage >= 95% at their session', () => {
    const cov = require('./coverage.js');
    const { F } = loadApp();
    const stories = F.stories || [];
    ok(stories.length > 0, 'no stories');
    const ids = new Set();
    const lessonIds = new Set(F.lessons.map(l => l.id));
    const deck = cov.loadDeck({ repo: ROOT });
    const notesFiles = cov.findNotes(ROOT);
    for (const st of stories) {
      ok(/^st-[0-9-]+-\d+$/.test(st.id), `bad story id ${st.id}`);
      ok(!ids.has(st.id), `duplicate story id ${st.id}`); ids.add(st.id);
      eq(st.generated, true, `${st.id}: generated flag`);
      ok(lessonIds.has(st.session), `${st.id}: unknown session ${st.session}`);
      ok(st.title_en && st.title_fa, `${st.id}: titles`);
      ok(st.lines.length > 0, `${st.id}: no lines`);
      for (const l of st.lines) ok(l.fa && l.fa.trim() && l.en && l.en.trim() && typeof l.pin === 'string', `${st.id}: empty line`);
      const text = st.lines.map(l => l.fa).join(' ');
      const res = cov.analyse(text, cov.buildLexicon(deck, st.session, { notesFiles }));
      ok(res.coverage >= 0.95, `${st.id}: coverage ${(res.coverage * 100).toFixed(1)}% < 95%`);
      const glossed = new Set(st.unknown.map(u => lemma.key(u.fa)));
      for (const u of res.unknown) ok(glossed.has(lemma.key(u.token)), `${st.id}: unknown word ${u.token} has no gloss`);
    }
  });

  test('lemma: segments keep every character; suffixes and verb forms resolve', () => {
    const { F } = loadApp();
    for (const st of F.stories || []) {
      for (const l of st.lines) eq(lemma.segments(l.fa).map(s => s.text).join(''), l.fa, `${st.id}: segments`);
    }
    const lex = lemma.buildLexicon(lemma.deckFromF(F), '35');
    ok(lemma.lemmas('کیفش', lex).has('کیف'), 'کیفش -> کیف');
    ok(lemma.lemmas('کتاب‌هامون', lex).has('کتاب'), 'کتاب‌هامون -> کتاب');
    ok([...lemma.lemmas('نمی‌خورم', lex)].some(x => x === 'V:khordan'), 'نمی‌خورم -> khordan');
    ok(lemma.classify('علی', lex).known, 'names are known');
    ok(!lemma.classify('کابینت', lex).known, 'کابینت is not taught');
  });

  test('reader: word status follows the store (new -> mastered), coverage counts known words', () => {
    const app = loadApp({ filter: src => !/^js\/(app\.js|audio\.js|ui\/(?!reader\.js))/.test(src) });
    const { F } = app;
    F.cards.build();
    const story = F.stories.find(s => s.id === 'st-35-2') || F.stories[F.stories.length - 1];
    const before = F.reader.analyse(story);
    ok(before.total > 50, 'story has tokens');
    ok(before.known === 0, 'nothing is mastered in an empty store');
    ok(before.new > 0, 'deck words start as new');
    const now = Date.now();
    for (const c of F.cards.all) F.store.data.srs[c.id] = { d: 5, s: 30, due: now + 864e5, last: now, state: 'review', step: 0, reps: 3, lapses: 0 };
    const after = F.reader.analyse(story);
    eq(after.new, 0, 'no new words once every card is mastered');
    ok(after.knownPct >= 90, `known ${after.knownPct}% with every card mastered`);
    eq(after.glossed, story.unknown.length ? after.glossed : 0);
  });
};
