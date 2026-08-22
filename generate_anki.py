#!/usr/bin/env python3
"""
Generate an Anki deck from the Farsi lessons.

Card data lives in flashcards.html — that file is the single source of truth
for both the web app and this deck, so a new session only has to be added
there. This script reads the `for (const c of sNN_type)` registration lines
out of flashcards.html, parses the arrays they name, and turns every entry
into Anki notes.

Run:    python3 generate_anki.py
Output: farsi_cursor_agent.apkg (double-click to import into Anki)
"""

import json
import os
import re
import sys

import genanki

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'flashcards.html')
OUTPUT = os.path.join(HERE, 'farsi_cursor_agent.apkg')

# Stable IDs. These must never change: Anki matches on them, so re-importing a
# regenerated deck updates the existing cards instead of creating duplicates.
MODEL_ID = 1769630112233
DECK_ID = 1769630445566
DECK_NAME = 'Farsi - Cursor Agent'


# ============================================================
# READ THE CARD DATA OUT OF flashcards.html
# ============================================================

def load_source():
    if not os.path.exists(SOURCE):
        sys.exit(f'Could not find {SOURCE}')
    with open(SOURCE, encoding='utf-8') as fh:
        return fh.read()


def parse_arrays(html):
    """Every `const NAME = [ ... ];` block in the file, parsed as JSON.

    The entries are JS array literals of double-quoted strings, which is valid
    JSON once the `//` comment lines and the trailing comma are stripped.
    Blocks that are not plain arrays of strings (VERBS, TENSES, ...) fail to
    parse and are skipped — they are not card data.
    """
    arrays = {}
    for name, body in re.findall(r'^const (\w+) = \[\n(.*?)^\];$', html, re.S | re.M):
        lines = [ln for ln in body.splitlines() if not ln.strip().startswith('//')]
        text = '[' + re.sub(r',\s*$', '', '\n'.join(lines).strip()) + ']'
        try:
            arrays[name] = json.loads(text)
        except ValueError:
            continue
    return arrays


def parse_registrations(html):
    """The addCards() calls, in file order.

    Returns [(varname, session, card_type, [directions])]. This is the mapping
    the web app itself uses, so the deck can never drift out of step with it.
    """
    registrations = []
    pattern = re.compile(r"^for \(const c of (\w+)\)\s*\{(.*)\}\s*$", re.M)
    for varname, calls in pattern.findall(html):
        found = re.findall(r"addCards\('([^']*)','([^']*)',\s*\[c\],\s*'([^']*)'\)", calls)
        if not found:
            continue
        session, card_type = found[0][0], found[0][1]
        directions = [d for _, _, d in found]
        registrations.append((varname, session, card_type, directions))
    return registrations


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

def main():
    html = load_source()
    arrays = parse_arrays(html)
    registrations = parse_registrations(html)

    deck = genanki.Deck(DECK_ID, DECK_NAME)
    counts = []

    for varname, session, card_type, directions in registrations:
        items = arrays.get(varname)
        if items is None:
            print(f'  ! {varname} is registered but was not parsed — skipping')
            continue

        session_tag = f'session-{session}' if session != 'alphabet' else 'alphabet'
        made = 0

        if card_type == 'alphabet':
            # Three card types per letter: recognise it, identify it from its
            # four forms, and recall the forms from the name.
            for name, sound, isolated, initial, medial, final, notes in items:
                for front, back, kind in (
                    (letter_front(isolated),
                     letter_back(name, sound, isolated, initial, medial, final, notes),
                     'letter-recognition'),
                    (forms_front(isolated, initial, medial, final),
                     forms_back(name, sound, notes),
                     'forms-recognition'),
                    (writing_front(name, sound),
                     writing_back(isolated, initial, medial, final, notes),
                     'writing-practice'),
                ):
                    deck.add_note(genanki.Note(
                        model=farsi_model,
                        fields=[front, back],
                        tags=['alphabet', kind],
                    ))
                    made += 1
        else:
            for farsi, pinglish, english, breakdown in items:
                for direction in directions:
                    if direction == 'english-to-farsi':
                        front, back = front_english(english), back_english(farsi, pinglish, breakdown)
                        tag = 'en-to-fa'
                    else:
                        front, back = front_farsi(farsi), back_farsi(pinglish, english, breakdown)
                        tag = 'fa-to-en'
                    deck.add_note(genanki.Note(
                        model=farsi_model,
                        fields=[front, back],
                        tags=[session_tag, card_type, tag],
                    ))
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
