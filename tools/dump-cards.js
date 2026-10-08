#!/usr/bin/env node
// Prints the deck as JSON for other tools (generate_anki.py):
//   { lessons: [{id, label, title, kind, notes: [...], items: [...]}],
//     cards:   [{id, itemId, session, type, direction, ...}] }
// Usage: node tools/dump-cards.js [--lessons-only]
'use strict';

const { loadApp } = require('./load');

const { F } = loadApp();
const lessons = F.lessons.map(l => ({
  id: l.id, label: l.label, title: l.title || null, summary: l.summary || null,
  kind: l.kind, notes: l.notesFiles, items: l.items,
}));
const out = process.argv.includes('--lessons-only') ? { lessons } : { lessons, cards: F.cards.all };
process.stdout.write(JSON.stringify(out));
