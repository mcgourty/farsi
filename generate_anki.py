#!/usr/bin/env python3
"""
Generate an Anki deck from the Farsi lessons.

Card data lives in lessons/*.js (one file per session, loaded by the web app
in the order index.html lists them). This script asks node for that data via
`node tools/dump-cards.js`, so the deck and the app can never drift apart and
there is no HTML scraping.

Every note gets a stable guid derived from the app's card id (for example
`35.v.yakhchal:fa-en`), so editing a card's text and re-importing updates the
note in place instead of adding a duplicate.

Verb *meaning* cards (session/type `verbs`) are generated at runtime from the
trainer's VERBS list and are not exported here.

Run:    python3 generate_anki.py      (needs node and `pip install genanki`)
Output: farsi_cursor_agent.apkg (double-click to import into Anki)
"""

import json
import os
import subprocess
import sys

import genanki

HERE = os.path.dirname(os.path.abspath(__file__))
DUMP = os.path.join(HERE, 'tools', 'dump-cards.js')
OUTPUT = os.path.join(HERE, 'farsi_cursor_agent.apkg')

# Stable IDs. These must never change: Anki matches on them, so re-importing a
# regenerated deck updates the existing cards instead of creating duplicates.
MODEL_ID = 1769630112233
DECK_ID = 1769630445566
DECK_NAME = 'Farsi - Cursor Agent'


# ============================================================
# READ THE LESSON DATA (via node, from lessons/*.js)
# ============================================================

def load_lessons():
    try:
        out = subprocess.run(['node', DUMP, '--lessons-only'], cwd=HERE, check=True,
                             capture_output=True, text=True, encoding='utf-8').stdout
    except FileNotFoundError:
        sys.exit('node is required: it reads the lesson files (tools/dump-cards.js)')
    except subprocess.CalledProcessError as e:
        sys.exit(f'tools/dump-cards.js failed:\n{e.stderr}')
    return json.loads(out)['lessons']


# ============================================================
# CARD MODEL
# ============================================================

farsi_model = genanki.Model(
    MODEL_ID,
    'Farsi Vocabulary (Cursor Agent)',
    fields=[
        {'name': 'Front'},
        {'name': 'Back'},
    ],
    templates=[
        {
            'name': 'Card 1',
            'qfmt': '{{Front}}',
            'afmt': '{{FrontSide}}<hr id="answer">{{Back}}',
        },
    ],
    css='''
    .card {
        font-family: -apple-system, "Segoe UI", Arial, sans-serif;
        font-size: 22px;
        text-align: center;
        color: #1a1917;
        background-color: #faf9f7;
    }
    .card.nightMode, .nightMode .card {
        color: #ececea;
        background-color: #0c0c0d;
    }
    .farsi {
        font-family: "Vazirmatn", "SF Arabic", "Geeza Pro", Tahoma, sans-serif;
        font-size: 40px;
        direction: rtl;
        line-height: 1.5;
        margin: 20px 0;
    }
    .pinglish {
        font-size: 20px;
        color: #c15f3c;
    }
    .nightMode .pinglish { color: #e08056; }
    .meaning {
        font-size: 24px;
        font-weight: 600;
        margin: 10px 0;
    }
    .breakdown {
        font-size: 15px;
        color: #6b6862;
        margin-top: 15px;
        text-align: left;
        direction: rtl;
        unicode-bidi: plaintext;
    }
    .nightMode .breakdown { color: #94918c; }
    .tag {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 12px;
        letter-spacing: 0.06em;
        color: #93908a;
        margin-bottom: 12px;
    }
    hr { border: none; border-top: 1px solid #d8d5cf; }
    .nightMode hr { border-top-color: #2a2a2d; }
    '''
)


# ============================================================
# CARD TEMPLATES
#
# Per the study protocol: NO hints on the front. The front is the Farsi
# script alone (or the English alone, going the other way). Pinglish,
# breakdowns and notes all live on the back.
# ============================================================

def front_farsi(farsi):
    return f'<div class="farsi">{farsi}</div>'


def back_farsi(pinglish, english, breakdown):
    return (f'<div class="meaning"><strong>{english}</strong></div>\n'
            f'<div class="pinglish">{pinglish}</div>\n'
            f'<div class="breakdown">{breakdown}</div>')


def front_english(english):
    return f'<div class="meaning">{english}</div>'


def back_english(farsi, pinglish, breakdown):
    return (f'<div class="farsi">{farsi}</div>\n'
            f'<div class="pinglish">{pinglish}</div>\n'
            f'<div class="breakdown">{breakdown}</div>')


def letter_front(isolated):
    return f'<div class="farsi" style="font-size: 72px;">{isolated}</div>'


def letter_back(name, sound, isolated, initial, medial, final, notes):
    return f'''<div class="meaning"><strong>{name}</strong></div>
<div class="pinglish">Sound: {sound}</div>
<hr>
<table style="margin: 0 auto; font-size: 16px;">
<tr><td>Isolated</td><td>Initial</td><td>Medial</td><td>Final</td></tr>
<tr style="font-size: 36px; direction: rtl;"><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
<div class="breakdown">{notes}</div>'''


def forms_front(isolated, initial, medial, final):
    return f'''<table style="margin: 0 auto; font-size: 40px; direction: rtl;">
<tr><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
<div class="pinglish">What letter is this?</div>'''


def forms_back(name, sound, notes):
    return f'''<div class="meaning"><strong>{name}</strong></div>
<div class="pinglish">Sound: {sound}</div>
<div class="breakdown">{notes}</div>'''


def writing_front(name, sound):
    return f'''<div class="meaning"><strong>{name}</strong></div>
<div class="pinglish">Sound: {sound}</div>
<div class="breakdown" style="text-align: center; direction: ltr;">Write all four forms.</div>'''


def writing_back(isolated, initial, medial, final, notes):
    return f'''<table style="margin: 0 auto; font-size: 16px;">
<tr><td>Isolated</td><td>Initial</td><td>Medial</td><td>Final</td></tr>
<tr style="font-size: 40px; direction: rtl;"><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
<div class="breakdown">{notes}</div>'''


# ============================================================
# BUILD THE DECK
# ============================================================

def note(front, back, tags, guid_key):
    return genanki.Note(model=farsi_model, fields=[front, back], tags=tags,
                        guid=genanki.guid_for(guid_key))


TYPE_ORDER = ['vocabulary', 'grammar', 'phrases', 'story']


def main():
    lessons = load_lessons()
    deck = genanki.Deck(DECK_ID, DECK_NAME)
    counts = []

    for lesson in lessons:
        session = lesson['id']

        if lesson['kind'] == 'alphabet':
            # Three card types per letter: recognise it, identify it from its
            # four forms, and recall the forms from the name.
            letters = [it for it in lesson['items'] if it['type'] == 'letter']
            for it in letters:
                name, sound, notes = it['name'], it['sound'], it.get('notes', '')
                iso, ini, med, fin = it['isolated'], it['initial'], it['medial'], it['final']
                for front, back, kind in (
                    (letter_front(iso), letter_back(name, sound, iso, ini, med, fin, notes), 'letter-recognition'),
                    (forms_front(iso, ini, med, fin), forms_back(name, sound, notes), 'forms-recognition'),
                    (writing_front(name, sound), writing_back(iso, ini, med, fin, notes), 'writing-practice'),
                ):
                    deck.add_note(note(front, back, ['alphabet', kind], f"{it['id']}:{kind}"))
            counts.append(('alphabet', 'alphabet', len(letters), len(letters) * 3))
            continue

        session_tag = f'session-{session}'
        for card_type in TYPE_ORDER:
            items = [it for it in lesson['items'] if it['type'] == card_type]
            if not items:
                continue
            made = 0
            for it in items:
                farsi, pinglish, english, breakdown = it['fa'], it['pin'], it['en'], it.get('notes', '')
                for direction in it.get('dirs') or ['farsi-to-english', 'english-to-farsi']:
                    if direction == 'english-to-farsi':
                        front, back = front_english(english), back_english(farsi, pinglish, breakdown)
                        tag, code = 'en-to-fa', 'en-fa'
                    else:
                        front, back = front_farsi(farsi), back_farsi(pinglish, english, breakdown)
                        tag, code = 'fa-to-en', 'fa-en'
                    deck.add_note(note(front, back, [session_tag, card_type, tag], f"{it['id']}:{code}"))
                    made += 1
            counts.append((session, card_type, len(items), made))

    genanki.Package(deck).write_to_file(OUTPUT)

    # ---- report ----
    print(f'✓ Created: {OUTPUT}\n')
    print(f'{"Session":<14}{"Type":<12}{"Entries":>9}{"Cards":>8}')
    print('-' * 43)
    total_entries = total_cards = 0
    for session, card_type, entries, cards in counts:
        label = session if session == 'alphabet' else f'Session {session}'
        print(f'{label:<14}{card_type:<12}{entries:>9}{cards:>8}')
        total_entries += entries
        total_cards += cards
    print('-' * 43)
    print(f'{"TOTAL":<26}{total_entries:>9}{total_cards:>8}\n')
    print('→ Double-click the .apkg file to import into Anki.')
    print(f'→ Re-importing a regenerated deck updates "{DECK_NAME}" in place.')


if __name__ == '__main__':
    main()
