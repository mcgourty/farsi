# Farsi Study Repository

Personal Farsi study repo. Drop teacher PDFs here → agent formats everything with full explanations → generate Anki cards.

**Phone / web:** [mcgourty.github.io/farsi](https://mcgourty.github.io/farsi/) — open in Safari, then Share → Add to Home Screen. Push to `main` and the site updates in about a minute. Review progress stays on each device.

## How It Works

1. **Add PDF** from teacher
2. **Agent converts** PDF to text
3. **Agent extracts** every word, phrase, conjugation, concept
4. **Agent formats** with:
   - Farsi script
   - Pinglish (pronunciation)
   - English translation
   - Letter-by-letter breakdown
   - Grammar explanations
5. **Request Anki cards** → added to "Farsi" deck

## Studying

The web app schedules with **FSRS-6** (the same algorithm modern Anki uses) and keeps
progress in each device's local storage.

- **Study modes** — *Due & new* for daily review, *Weak spots* for everything you have
  lapsed on or that FSRS rates as hard (worst first), *All cards* to browse.
- **Vocab direction** — Farsi → English, English → Farsi, or **Both, mixed**. Mixed mode
  keeps the two directions of the same word at least 8 cards apart, so the second one
  isn't a freebie.
- **Session filters** — *All* / *None* / *Newest only*, and each session pill carries a
  meter showing how much of it is mature, young, learning, or still new. The bar under
  the filters breaks the whole selection down with counts and percentages.
- **Leeches** — cards you have lapsed 6+ times get flagged with a prompt to re-encode
  them rather than grind them.
- **Audio** — on devices with a Persian voice installed, tap the speaker on the answer
  (or press `s`) to hear the word. *Auto-play audio* speaks it on every reveal.
- **Type answer** — typed recall in pinglish, with tolerant matching for oo/u, ee/i, gh/q.

## Files

- `*.pdf` - Original teacher materials
- `*.txt` - Text conversion of PDFs
- `*_formatted.md` - Full breakdown and explanation

See `AGENT_STUDY_PROTOCOL.md` for detailed agent instructions.
