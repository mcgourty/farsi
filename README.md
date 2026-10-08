# Farsi

A personal Farsi study app, built from my lessons with my teacher. It runs in
the browser and works offline as an iPhone home-screen app.

**Open it:** [mcgourty.github.io/farsi](https://mcgourty.github.io/farsi/). In
Safari, tap Share, then Add to Home Screen. Pushing to `main` updates the site
in about a minute; the app shows "Update ready · Reload" when a new version is in.

## What it does

- **Today** puts the day in order: the next new lesson, reviews due (with a time
  estimate), a verb drill, a story to read, the lesson notes and how far you have come.
- **Learn** shows each new item before testing it: Farsi, pinglish, meaning,
  breakdown and an example sentence, then one quick check. Ten at a time, within
  the new-per-day limit.
- **Study** schedules reviews with FSRS-6 (the scheduler modern Anki uses). Cards
  come in both directions, one direction per word per day. Type the answer to see a
  letter-by-letter diff and a suggested grade, fill in the blanks of lesson
  sentences, bury a card from its menu, and undo the last grade or bury.
- **Verbs** runs mixed sets of 10 prompts across verbs, tenses and persons, weighted
  toward forms you miss and the newest lessons, with a summary at the end. You can
  also practise one verb at a time or browse the conjugation tables.
- **Read** has short practice stories written from the words you have studied (tap a
  word for its meaning, a sentence for its English) and the teacher's lesson notes,
  searchable, with a link from the back of every card.
- **Progress** counts the words you actually know (stable for three weeks or more),
  the week ahead, your history and a streak that allows rest days.
- **Settings** (top right) holds what to study, practice options, the theme
  (system, light or dark), backup and a reset that tells you exactly what it resets.

## Adding a lesson

Drop the teacher's PDF in the repo and ask the agent to follow
`AGENT_STUDY_PROTOCOL.md`: it writes the formatted notes
(`ALEX-SESSION-NN_formatted.md`) and a `lessons/sNN.js` file, adds it to
`index.html` and `sw.js`, and runs `node tools/test.js`. The new lesson shows up
on Today by itself. `python3 generate_anki.py` builds the same deck for Anki.
How the app is put together is in `ARCHITECTURE.md`.

## Keep a backup

Progress lives only on the device, in the browser's storage. On iPhone the
home-screen app and Safari keep **separate** progress, and deleting the
home-screen icon deletes its progress with it. So:

- Export a backup now and then (Settings → Backup → Export backup, then Save to
  Files or iCloud). The app reminds you after a week without one.
- Always export a backup **before deleting the home-screen icon** or moving to a
  new phone, then restore it with Restore from file in the new place.
