# Farsi Study Protocol - Agent Instructions

## Core Principle

**All content comes from the teacher's materials.** The agent does NOT invent vocabulary, grammar rules, or examples. Everything is extracted, formatted, and explained from the PDFs and documents the user provides.

---

## User's Study Strategy

1. **Drop teacher PDFs/materials** into this repository
2. **Agent converts PDFs to text** (for searchability and processing)
3. **Agent extracts and formats** all vocabulary, phrases, grammar from the materials
4. **User reviews** the formatted, explained content
5. **Agent creates Anki cards** from the extracted content

---

## Agent Tasks

### Step 1: PDF Processing

When user adds a new PDF:
1. Convert PDF to text file (same name, `.txt` extension)
2. Preserve the text file alongside the PDF for reference
3. Identify all Farsi content in the document

### Step 2: Content Extraction & Formatting

For every word, phrase, and concept in the teacher's materials:

**Vocabulary Entry Format:**
```markdown
### [English meaning from PDF]

| Farsi | Pinglish | 
|-------|----------|
| [word from PDF] | [transliteration] |

**Letter Breakdown:**
- [letter 1] ([name]) - /sound/
- [letter 2] ([name]) - /sound/
- ...

**Context:** [How it appears in the lesson/PDF]
```

**Sentence/Phrase Format:**
```markdown
### [Translation]

| Farsi | Pinglish |
|-------|----------|
| [phrase from PDF] | [transliteration] |

**Word-by-Word:**
| Farsi | Pinglish | Meaning | Role |
|-------|----------|---------|------|
| [word] | [sound] | [meaning] | [grammar role] |
```

**Verb Conjugation Format:**
```markdown
### [Verb infinitive] - [English meaning]

| Person | Farsi | Pinglish | English |
|--------|-------|----------|---------|
| من (I) | [conjugation] | [sound] | I [verb] |
| تو (you) | [conjugation] | [sound] | you [verb] |
| ...
```

### Pinglish Conventions:
- â = long 'a' (آ، ا) - like 'a' in "father"
- a = short 'a' (َ fatheh) - like 'a' in "cat"
- e = short 'e' (ِ kasreh) - like 'e' in "bed"  
- i = long 'i' (ی) - like 'ee' in "see"
- o = short 'o' (ُ dammeh) - like 'o' in "got"
- oo/u = long 'u' (و) - like 'oo' in "moon"
- gh = غ (ghayn) - guttural 'g'
- kh = خ (kheh) - like 'ch' in Scottish "loch"
- zh = ژ (zheh) - like 's' in "measure"
- sh = ش (shin) - like 'sh' in "ship"
- ch = چ (cheh) - like 'ch' in "chip"
- ' = ع (eyn) - glottal sound

---

## Anki Card Creation Protocol

**Method:** Use `genanki` Python library to generate `.apkg` files for import.

**Target Deck:** "Farsi - Cursor Agent"

### User Preferences

- **NO HINTS on the front of the card** — test reading ability
- Front should be ONLY the Farsi script (e.g., `چطور` not `چطور (chetor)`)
- Pinglish goes on the BACK of the card (answer side)
- Include letter breakdowns, compound explanations, usage notes on back
- Keep all the rich detail — just not as hints on the front

### Card Types

1. **Vocabulary (Farsi → English)**
   - Front: Farsi word ONLY (no pinglish hint)
   - Back: Pinglish + English meaning + letter breakdown

2. **Vocabulary (English → Farsi)**
   - Front: English meaning ONLY
   - Back: Farsi script + Pinglish + breakdown

3. **Reading Practice (Phrases/Sentences)** — both directions, same as vocabulary
   - Farsi → English front: Farsi text ONLY
   - English → Farsi front: English translation ONLY
   - Back: the other language, plus pinglish and the word-by-word breakdown

4. **Grammar/Conjugation** — both directions
   - Farsi → English front: Farsi form ONLY
   - English → Farsi front: English meaning ONLY
   - Back: the other language, plus pinglish and the grammatical explanation

Story lines follow the same both-directions pattern. Alphabet cards are the
exception: they are a letter drill and ignore the direction filter.

5. **Alphabet - Letter Recognition**
   - Front: Isolated letter form ONLY
   - Back: Letter name + sound + all 4 positional forms + notes

6. **Alphabet - Forms Recognition**
   - Front: All 4 forms (isolated, initial, medial, final)
   - Back: Letter name + sound

7. **Alphabet - Writing Practice**
   - Front: Letter name + sound
   - Back: All 4 forms to write/recall

8. **Verb meanings (every conjugation)**
   - Generated at runtime from the verb trainer's `VERBS` + `conj()` engine
   - Session `verbs`, type `verbs`, both directions
   - Front FA→EN: conjugated Farsi only
   - Front EN→FA: English meaning (person + tense), with the infinitive pinglish
     so near-synonyms stay distinct
   - Back: Farsi + pinglish + person/tense/breakdown
   - Covers infinitive plus present, negative, past, neg. past, continuous
     (when the verb allows it), and both imperatives
   - Do not hand-write these cards — add the verb to `VERBS` in `js/verbs.js`
     and the cards appear automatically. A verb's `id` is part of its card ids,
     so never rename one that has shipped

### Generation

**`lessons/*.js` is the single source of truth for card data.** Both the web
app and the Anki deck read from it. A new session is one new file plus one
`<script>` tag:

1. Create `lessons/sNN.js`:

   ```js
   // Session 36: <theme>.
   // Item ids are permanent. Never change or reuse one; add new items with new ids.
   F.lesson({
     id: '36',
     label: 'Session 36',
     title: 'Short theme in sentence case',      // optional
     notes: 'ALEX-SESSION-36_formatted.md',       // the formatted lesson file
     items: [
       // Vocabulary
       { id: '36.v.yakhchal', type: 'vocabulary', fa: 'یخچال', pin: 'yakhchāl', en: 'fridge', notes: 'ی-خ-چ-ا-ل' },
       // Grammar
       { id: '36.g.mizaram', type: 'grammar', fa: '…', pin: '…', en: '…', notes: '…' },
       // Phrases
       { id: '36.p.ketab-ru-miz-e', type: 'phrases', fa: '…', pin: '…', en: '…', notes: '…' },
     ],
   });
   ```

   - `type` is `vocabulary`, `grammar`, `phrases` or `story`. Every item becomes
     two cards (Farsi → English and English → Farsi).
   - `notes` is the back-of-card breakdown (letters, word-by-word, usage).
   - Write Persian as real text, not `\u` escapes.
   - **Every item needs a unique `id`, written literally**: `<session>.<v|g|p|s>.<pinglish-slug>`,
     adding `-2`, `-3` if the slug is taken. The id is what review progress is
     stored under, so it must never change afterwards, even if the Farsi or
     pinglish is corrected. Do not reuse an id for a different word.
2. Add `<script src="lessons/sNN.js"></script>` to `index.html` after the
   previous session (before `lessons/alphabet.js`).
3. Run `node tools/test.js`. The session filter, the default selection and
   *Newest only* update themselves.

Correcting a card later: edit its text in place and keep its `id`.

`generate_anki.py` reads the lesson files through `node tools/dump-cards.js`
and sets each note's guid from the card id. It holds no card data of its own.

Run: `python3 generate_anki.py` (needs node and `pip install genanki`)  
Output: `farsi_cursor_agent.apkg`  
Import: Double-click the `.apkg` file to import into Anki

The deck and model IDs are fixed and every note has a stable guid from its card
id, so re-importing a regenerated deck updates the existing cards in place
rather than creating duplicates. (Decks imported before guids were added will
duplicate once; delete the old notes after that first re-import.)

---

## Workflow Per Session

### When User Drops a PDF:
1. Convert to `.txt` file
2. Extract ALL Farsi content
3. Create formatted lesson file with:
   - Every vocabulary word (with letter breakdown)
   - Every phrase/sentence (with word-by-word)
   - Every grammar concept (conjugations, rules)
   - Every exercise/example from the PDF
4. Report what was extracted

### When User Requests Anki Cards:
1. Generate cards ONLY from extracted content
2. Insert into "Farsi" deck
3. Confirm what was added

### For each new lesson: practice stories and example sentences
Lesson cards still come only from the teacher's material. Practice stories are
the one exception to "don't invent": they are short graded readers written
from words the deck has already taught, and they are always marked as
generated (`generated: true`; the Read tab says "written for you, not from
your teacher"). They never become cards.

1. After adding `lessons/sNN.js`, write 2 practice stories for the session in
   `tools/stories-src/stories.src.js` (60-140 words, one sentence per line as
   `[fa, pin, en]`, ids `st-NN-1`, `st-NN-2`; never reuse or rename an id).
   Use only words taught up to that session, gloss any unavoidable new word
   in `gloss`.
2. `node tools/stories-src/build-stories.js` scores every story with
   `tools/coverage.js` and writes `lessons/stories.js`. Each story must reach
   **>= 98% known tokens** (95% is the hard floor) with no missing gloss;
   rewrite lines until it does. To check a draft text:
   `node tools/coverage.js --cutoff NN "..."`, or all shipped stories:
   `node tools/coverage.js --stories lessons/stories.js --repo .`
3. `node tools/stories-src/build-examples.js` then
   `node tools/apply-examples.js` to refresh the example sentences on every
   vocabulary card (they come from the lessons' phrases and story cards and
   the practice stories).
4. `node tools/test.js`.

### Exercise Generation (from PDF content):
- **Fill in the blank** using vocabulary from lessons
- **Translation practice** using sentences from lessons
- **Conjugation drills** using verbs from lessons
- **Reading comprehension** using passages from lessons

---

## File Organization

```
.
├── AGENT_STUDY_PROTOCOL.md     # This file
├── ARCHITECTURE.md             # How the web app is built
├── README.md                   # Repository overview
├── ALEX-SESSION-NN.pdf         # Teacher's PDF
├── ALEX-SESSION-NN.txt         # Converted text
├── ALEX-SESSION-NN_formatted.md# Fully explained/formatted content
├── lessons/sNN.js              # Card data for the session (see Generation)
├── lessons/stories.js          # Practice stories (generated; built from tools/stories-src/)
├── index.html, js/, css/       # The web app
├── tools/                      # Tests and data tools (node)
└── generate_anki.py            # Anki deck from lessons/*.js
```

PDFs, text conversions and formatted lessons stay at the root; card data goes
in `lessons/`.

## Important Reminders

- **DO NOT** invent vocabulary or examples not in the materials
- **DO** explain every letter, every word, every grammatical structure
- **DO** provide Pinglish for everything so user can pronounce it
- **DO** break down new concepts completely
- **Source everything** from the teacher's PDFs
