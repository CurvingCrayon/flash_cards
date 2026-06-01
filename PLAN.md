# Pleco Flashcards Web App Plan

## Goal

Create a front-end web app version of a Pleco-style flashcard workflow in `flash_cards`. The app should import Pleco `.txt` flashcard files, let learners study cards, and let them choose whether each card side shows English, Hanzi, Pinyin, or any combination of those fields.

## Initial scope

- Build a client-only React app.
- Import flashcards from a pasted or uploaded `.txt` file.
- Support the existing repo's Pleco export shape: category headers such as `// term1/week4` followed by tab-delimited rows like `汉字<TAB>pin1 yin1<TAB>English`.
- Preview imported cards before study.
- Save decks locally in the browser.
- Study cards with configurable front and back fields.
- Add a Hanzi character inspector so clicking an individual character opens dictionary/stroke-order links.

## Data model

Each parsed card has:

- `id`: stable client-side identifier
- `hanzi`: Chinese text
- `pinyin`: pronunciation text
- `english`: definition/translation
- `category`: most recent `// ...` section header
- `lineNumber`: source line for troubleshooting

## UX flow

1. User opens the app.
2. User pastes `.txt` content or uploads a `.txt` file.
3. Parser shows imported cards and any malformed lines.
4. User imports valid cards into the active deck.
5. User optionally saves the deck to local storage.
6. User selects which fields appear on the card front and back.
7. User studies by flipping, moving next/previous, or shuffling.
8. User clicks individual Hanzi characters to open a character inspector with external lookup links.

## Hanzi character lookup

First version uses external services so the front-end can stay static:

- MDBG dictionary lookup
- Arch Chinese dictionary/stroke-order lookup
- YellowBridge character dictionary

Later versions can add a local or API-backed dictionary cache.

## Implementation phases

1. Scaffold React + TypeScript app in `flash_cards`.
2. Add parser utilities and tests.
3. Build import and preview screen.
4. Build study screen with configurable front/back fields.
5. Add local saved decks.
6. Add clickable Hanzi character inspector with external links.
7. Polish responsive styling and manual browser testing.

## Testing plan

- Unit-test the parser against valid rows, headers, blank/comment lines, malformed rows, and Hanzi extraction.
- Run lint and production build.
- Manually test import, save, study navigation, field toggles, and Hanzi lookup in the browser.
