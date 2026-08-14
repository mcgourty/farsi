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

3. **Reading Practice (Phrases/Sentences)**
   - Front: Farsi text ONLY
   - Back: Pinglish + English translation + word-by-word breakdown

4. **Grammar/Conjugation**
   - Front: Farsi conjugated form ONLY
   - Back: Pinglish + English + grammatical explanation

5. **Alphabet - Letter Recognition**
   - Front: Isolated letter form ONLY
   - Back: Letter name + sound + all 4 positional forms + notes

6. **Alphabet - Forms Recognition**
   - Front: All 4 forms (isolated, initial, medial, final)
   - Back: Letter name + sound

7. **Alphabet - Writing Practice**
   - Front: Letter name + sound
   - Back: All 4 forms to write/recall

### Generation

Run: `python3 generate_anki.py`  
Output: `farsi_cursor_agent.apkg`  
Import: Double-click the `.apkg` file to import into Anki

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
├── README.md                    # Repository overview
├── Lesson_01.pdf               # Teacher's PDF
├── Lesson_01.txt               # Converted text
├── Lesson_01_formatted.md      # Fully explained/formatted content
├── Lesson_02.pdf
├── Lesson_02.txt
├── Lesson_02_formatted.md
└── ...
```

Keep it simple - PDFs, their text conversions, and formatted versions all at the root level (or organize by lesson number if it gets large).

---

## Important Reminders

- **DO NOT** invent vocabulary or examples not in the materials
- **DO** explain every letter, every word, every grammatical structure
- **DO** provide Pinglish for everything so user can pronounce it
- **DO** break down new concepts completely
- **Source everything** from the teacher's PDFs
