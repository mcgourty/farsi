# Architecture

A static, no-build web app. `index.html` loads plain classic scripts in order;
everything hangs off one global, `window.F`. It runs the same from GitHub
Pages, from `python3 -m http.server`, and in node (tools load the data
modules into a `vm`).

```
index.html            shell markup + <script> tags (the load order is the module order)
flashcards.html       redirect to ./ (keeps query and hash) for old home-screen icons
css/app.css           tokens (light + dark + html[data-theme]), layout, theme, shell (top bar, sheet, pages)
js/core.js            F namespace: F.util, F.state, F.hooks, F.lesson/F.lessons, F.views, F.actions
js/fsrs.js            F.fsrs: FSRS-6 scheduler, pure functions
js/verbs.js           F.verbs: VERBS, TENSES, PERSONS, conj(), English glosses, meaningItems()
lessons/*.js          one file per session: F.lesson({...}); alphabet.js is the letter drill
js/cards.js           F.cards: lessons + generated decks -> card list; filters; queue building
js/store.js           F.store: localStorage store, v1 migration, review log (IndexedDB), backup data
js/legacy-keys.js     F.LEGACY_KEYS: frozen v1 key -> card id map; loaded only to migrate
js/audio.js           F.audio: Web Speech TTS (only when a Persian voice exists)
js/ui/typed.js        F.typed: typed-recall input, tolerant pinglish matching
js/ui/study.js        F.study + view 'cards': queue, card rendering, grading, bury, scope bar
js/ui/drill.js        F.drill + view 'verbs': verb browse tables and conjugation drill
js/ui/settings.js     F.settings: filter panels (#fc-filters, #vt-filters) in the sheet, quick buttons, theme
js/ui/backup.js       F.backupUI: backup/restore panel (#backup-panel), backup reminder
js/ui/sheet.js        F.sheet: settings sheet (bottom sheet / side panel), two-step reset
js/ui/today.js        F.today + view 'today' (the view the app opens on): sections registry
js/ui/progress.js     F.progress + view 'progress': known words, forecast, history, streak, study meter
js/app.js             F.app: boot, view switching, render pass, click + key dispatch (load last)
tools/                node tooling and tests (no npm dependencies)
```

Only `core.js`, `fsrs.js`, `verbs.js`, `lessons/*`, `cards.js` and `store.js`
are loaded by node tools; keep them free of DOM access at load time.

## Boot and render

1. Scripts load. Lessons call `F.lesson()`; UI modules register views,
   actions, prefs providers and hooks. Nothing renders yet.
2. `app.js` runs `F.store.init()` (may load `js/legacy-keys.js` and migrate),
   then `boot()`: `F.cards.build()` -> `F.store.applyPrefs()` -> build tabs ->
   each view's `init()` -> `F.settings.build()` -> `F.app.render()` ->
   hook `boot`. It also calls `navigator.storage.persist()`.
3. `F.app.render()`: sync chrome (tabs, active panel, page mode,
   shortcuts) -> `view.render()` -> `view.renderScoreRow()` -> hook `render`
   -> `F.store.syncPrefs()`.

Rendering never writes the store. Writes happen on change:
`F.store.setSrs/bury/unbury/bump*` call `saveSoon()` (400 ms debounce), and
`syncPrefs()` saves only when the collected prefs differ from the last save.
Pending writes are flushed on `pagehide` and when the page becomes hidden.

## Extension points

Each feature should be able to add a file plus a `<script>` tag (before
`js/app.js`) without editing other modules.

**Views** (`F.views.register(name, def)`). A view owns `#card-area`, the stats
bar, `#nav-pos`, the prev/next buttons, `#scope-bar` and `#score-row` while it
is active, and must fill or clear them in `render()`.

| Field | Meaning |
|---|---|
| `label`, `order` | tab text and position; `tab: false` hides it from the tab bar |
| `panel` | id of its settings element, shown only while the view is active |
| `init()` | once at boot, after prefs are loaded |
| `enter()` / `leave()` | on switching to / away from the view |
| `render()` | required; draw everything the view owns |
| `renderScoreRow()` | redraw only `#score-row` (called after a flip) |
| `syncChrome()` | show/hide shared buttons (`#mastered-btn`, `#newlimit-btn`, `#score-row`) |
| `shortcutsHTML()` | keyboard hint line |
| `next()`, `prev()`, `keydown(e)` | arrows and other keys (Space and `s` are handled by the app) |
| `onShuffle()`, `reset()` | Shuffle and Reset buttons |
| `typedActive()`, `typedAnswer()` | opt into typed recall |
| `speech()` | `{text, token}` for TTS; token dedupes auto-play |
| `hideActions` | true hides the practice toggles (`.bottom-actions`, now in the settings sheet) |
| `page` | true: the view draws a whole page into `#card-area`; the app clears and hides the study chrome (stats, meter, scope bar, nav, grading row, shortcuts) |
| `tabLabel` | short tab text (falls back to `label`; `cards` shows as Study, `verbs` as Verbs) |
| `resetPlan()` | `{title, lines: [html], count, confirmLabel, run()}` for the sheet's two-step reset; without it the sheet resets the study selection (or drill scores on `verbs`) |

Switch with `F.app.setView(name)`; the active view name is `F.state.tab` and
`document.body.dataset.view`. The app opens on `today` (or the view named in
the URL hash, e.g. `index.html#cards`), not the last tab.

**Settings sheet** (`F.sheet.open/close/toggle/isOpen`). The header button opens it;
it holds each view's `panel` (views without one show the study panel), the
practice toggles, theme, backup and reset. `body.filters-collapsed` is set while
it is closed.

**Today sections** (`F.today.registerSection({id, order, visible(), html() | render(el), lead})`).
Built-ins: `new-lesson` 10 (lead), `reviews` 20, `progress` 90. Markup classes:
`.t-k .t-big .t-sub .t-meta .t-row(.t-row-label/.t-row-val) .t-acts .btn-primary
.btn-secondary .btn-link`. The new-lesson section calls `F.learn.start(sessionId)`
and shows `F.learn.pending(sessionId)` (a number) when `F.learn` exists; otherwise
it filters the study view to that session. `F.today.queueEstimate(sessionsSet)`
gives `{due, fresh, freshTotal, total, nextDue}` for the Due & new queue.

**Progress** (`F.progress`): `stats()` (cached item counts per session: a word is
known when every card of it is in review with stability >= 21 days),
`weekForecast()`, `streakNow()` (2 rest days allowed in any 7), `rates()` /
`estimateSec(due, fresh)` (8 s a review, 20 s a new card until the review log
has 20+ timed reviews), `meterHTML({known, learning, new})`, `invalidate()`.

**Actions** (`F.actions.register(name, fn(el, event))`). Markup uses
`data-action="name"` (plus `data-arg`); one delegated click listener runs it.
Clicks inside `input`, `textarea`, `select` or `label` are ignored. Do not add
inline `onclick` attributes.

**Card renderers** (`F.study.registerRenderer({name, match(card, ctx), render(card, ctx)})`).
`render` returns `{front, back}` HTML. The most recently registered matching
renderer wins; built-ins are `fa-en`, `en-fa`, `alphabet`, `verbs`. `ctx` is
`{frontMode, direction, mode}`. Badges, the typed input, the speaker button
and hook `card:rendered` are applied after the renderer.

**Hooks** (`F.hooks.on(name, fn)`):

| Event | Payload |
|---|---|
| `boot` | `{migrated}` (migration report or null) |
| `render` | `{view}` |
| `view:changed` | `{from, to}` |
| `card:rendered` | `{card, front, back, flipped, view}` (`drill` instead of `card` in the drill) |
| `card:flipped` | `{view, flipped}` |
| `card:graded` | `{card, rating, before, after, review}` |
| `card:buried`, `card:unburied` | `{card}` |
| `drill:marked` | `{prompt, known}` |
| `shuffle:changed` | `{shuffled}` |
| `sheet:toggled` | `{open}` |
| `progress:reset` | `{}` after the sheet's reset |
| `progress:timing` | `{review, fresh, calibrated}` once review durations are read |

**Prefs** (`F.store.registerPrefs({save(prefs), load(prefs)})`). `save` writes
the module's fields into the shared prefs object; `load` reads them at boot.
Keep field names unique across modules.
Shell prefs: `theme` (`system` | `light` | `dark`, applied as `html[data-theme]`;
an inline script at the top of `<body>` applies it before first paint). `filtersExpanded` is gone.

**Generated decks** (`F.cards.registerGenerator({session, type, items, extra})`).
How the Verbs session is made; `items()` returns `{id, fa, pin, en, notes}`
and each item becomes a fa-en and an en-fa card. Call `F.cards.build()` again
if you register after boot.

**Lesson metadata** for a notes viewer or home screen: `F.lessons` (each has
`id, label, title?, summary?, kind, notesFiles[], items[]`) and
`F.cards.sessions` (`{id, label, kind, lesson?}` in deck order, including
`verbs`). `F.cards.newestLesson()` is the last numbered lesson.

## Data shapes

**Lesson** (`lessons/s35.js`):

```js
F.lesson({
  id: '35',                       // session id; never change ('24-25' is one lesson)
  label: 'Session 35',
  title: 'Where things are',      // optional
  summary: '...',                 // optional, one line
  notes: 'ALEX-SESSION-35_formatted.md',   // optional, string or array
  items: [
    { id: '35.v.yakhchal', type: 'vocabulary', fa: 'یخچال', pin: 'yakhchāl', en: 'fridge, refrigerator', notes: '…' },
  ],
});
```

Item `type`: `vocabulary`, `grammar`, `phrases`, `story`, or `letter`
(alphabet: `{id, type: 'letter', name, sound, isolated, initial, medial, final, notes}`).
`notes` is the breakdown shown on the back (HTML allowed, e.g. `<br>`).
Optional `dirs: ['farsi-to-english']` limits the directions generated.

**Item ids are permanent.** They are written literally in the file and are the
key for all progress. Never derive them from text, never rename or reuse one.
Convention: `<session>.<v|g|p|s>.<pinglish-slug>` with `-2`, `-3` on
collision, `alpha.<name>` for letters. Fixing a typo in `fa`/`pin`/`en`/`notes`
keeps the card's history; deleting an item orphans it.

**Card** (built by `F.cards.build()`):
`{id, itemId, session, type, direction, farsi, pinglish, english, breakdown}`,
alphabet cards `{id, itemId, session: 'alphabet', type: 'alphabet', direction: 'letter', name, sound, isolated, initial, medial, final, notes}`,
verb cards add `{verb, tense, pi}`.
`id = itemId + ':' + (fa-en | en-fa | letter)`. Verb item ids are
`verb.<verbId>.inf` or `verb.<verbId>.<tense>.<1sg|2sg|3sg|1pl|2pl|3pl>`, e.g.
`verb.boodan.past.3pl:fa-en`.

**SRS state** (`store.srs[cardId]`): `{d, s, due, last, state: 'learning'|'review'|'relearning', step, reps, lapses}`
(times in ms).

## Storage keys

| Key | What |
|---|---|
| `localStorage['farsi-v2']` | the store: `{version: 2, srs, buried, drill, newLog, revLog, prefs, meta}` |
| `localStorage['farsi-flashcards-v1']` | the pre-split store. Read-only now, never deleted |
| `localStorage['farsi-v2-before-import']` | safety copy taken before a restore |
| `localStorage['farsi-reviews-v1']` | review log fallback when IndexedDB is unavailable |
| IndexedDB `farsi-flashcards` / store `reviews` | review log, append-only |

- `buried[cardId] = timestamp`; `drill['verbId|tense|personIndex'] = {r, w}`;
  `newLog['Y-M-D'] = {fa, en}` (new cards per direction bucket);
  `revLog['Y-M-D'] = count`. Day keys are local dates without zero padding.
- `meta`: `createdAt`, `lastBackupAt`, `backupSnoozedAt`, `migratedFrom`,
  `migratedAt`, `v1Hash`, `importedAt`, `legacyOrphans` (v1 records whose
  card no longer existed).
- Review log entry: `{cardId, ts, rating (1-4), elapsedDays (null if new), durationMs, stateBefore, sBefore, dBefore, stateAfter, sAfter, dAfter, dueAfter}`.
- Backup file: `{app: 'farsi-flashcards', kind: 'backup', format: 1, exportedAt, store, reviews}`.
  Restore also accepts a raw v1 blob and migrates it.

### Migration from v1

On first boot with `farsi-flashcards-v1` and no `farsi-v2`, `store.init()`
loads `js/legacy-keys.js` and copies every v1 `srs`/`buried` record to the
new id(s) its old key (`session|type|direction|farsi`, or `alpha|name`) maps
to. 192 old verb keys were shared by two or three cards (an infinitive and its
colloquial 3pl past are spelled the same); each card gets its own copy. Prefs,
drill scores and day counts are copied as is. v1 is left untouched. If v1
changes later (an old cached page), the next boot folds in newer reviews.
`js/legacy-keys.js` is frozen: it was generated from flashcards.html at
218298c and must not be regenerated.

## How to add a lesson

1. Create `lessons/s36.js` with `F.lesson({ id: '36', label: 'Session 36', ... })`.
   Give every item a new, unique, literal `id`.
2. Add `<script src="lessons/s36.js"></script>` after the last lesson in
   `index.html` (before `alphabet.js`).
3. `node tools/test.js`. The session list, the default selection and
   "Newest only" come from the registry; existing users get the new session
   switched on automatically. `python3 generate_anki.py` picks it up too.

## How to add a view

1. Create `js/ui/<name>.js` and register: `F.views.register('home', { label: 'Today', order: 5, render() {...} })`.
2. Add its `<script>` before `js/app.js`. Use `data-action` + `F.actions.register`
   for clicks and `F.store.registerPrefs` for anything it remembers.
3. If it needs its own settings panel, add the element to `index.html` and set
   `panel: '<element id>'`.

## Tools and tests

```
node tools/test.js            # all tests, ~1 s, no npm install
node tools/dump-cards.js      # deck as JSON (used by generate_anki.py)
python3 generate_anki.py      # Anki deck with stable guids from card ids
```

`tools/test.js` checks: unique well-formed item and card ids; sessions derived
from the registry; card counts per session/type against the legacy app;
card-by-card text identity with the legacy app; the legacy key map; FSRS
output against the legacy scheduler (4,200 reviews, fuzz on and off); the v1
migration (a store built by running reviews through the legacy app's own code
over every session, the alphabet, verbs, shared keys and buried cards); the
re-merge of a changed v1 store; queue order against the legacy app; and backup
build/inspect/restore. The legacy app is read with `git show 218298c:flashcards.html`
(`tools/legacy/old-app.js`); without git those checks fall back to
`tools/fixtures/legacy-counts.json` or are skipped with a warning.

Card text and counts are pinned to the legacy app. When a later change edits
card text or trims the verb deck on purpose, update the pairing and count
tests (and never regenerate `js/legacy-keys.js`).
