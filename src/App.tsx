import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import HanziWriter from "hanzi-writer";
import "./App.css";
import { formatPinyinForDisplay } from "./pinyin";
import { extractHanziCharacters, parsePlecoText } from "./plecoParser";
import type {
  FieldVisibility,
  Flashcard,
  FlashcardField,
  FlashcardGrade,
  SavedDeck,
  StudySessionResult,
} from "./types";

const SAMPLE_PLECO_TEXT = `// term1/greetings
你好	ni3 hao3	hello
谢谢	xie4 xie5	thanks
朋友	peng2 you5	friend`;

const DECKS_STORAGE_KEY = "pleco-flash-card-decks";
const RESULTS_STORAGE_KEY = "pleco-flash-card-results";
const STARRED_STORAGE_KEY = "pleco-flash-card-starred";
const FIELDS: { key: FlashcardField; label: string }[] = [
  { key: "hanzi", label: "Hanzi" },
  { key: "pinyin", label: "Pinyin" },
  { key: "english", label: "English" },
];
const ALL_FIELDS_VISIBLE: FieldVisibility = { hanzi: true, pinyin: true, english: true };

type ScribblePoint = { x: number; y: number };
type ScribbleStroke = ScribblePoint[];

function createDefaultFront(): FieldVisibility {
  return { hanzi: true, pinyin: false, english: false };
}


function readJson<T>(key: string, fallback: T): T {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readSavedDecks(): SavedDeck[] {
  return readJson<SavedDeck[]>(DECKS_STORAGE_KEY, []);
}

function readSavedResults(): StudySessionResult[] {
  return readJson<StudySessionResult[]>(RESULTS_STORAGE_KEY, []);
}

function readStarredCardIds(): string[] {
  return readJson<string[]>(STARRED_STORAGE_KEY, []);
}

function getCardField(card: Flashcard, field: FlashcardField): string {
  return field === "pinyin" ? formatPinyinForDisplay(card.pinyin) : card[field];
}

function createDeckName(cards: Flashcard[]): string {
  const firstCategory = cards[0]?.category ?? "Imported deck";
  return firstCategory.split("/").filter(Boolean).at(-1) || firstCategory;
}

function shuffleCards(cards: Flashcard[]): Flashcard[] {
  return [...cards]
    .map((card) => ({ card, sortKey: Math.random() }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ card }) => card);
}

function getScribblePoint(event: ReactPointerEvent<SVGSVGElement>): ScribblePoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function buildStudyResult(
  cards: Flashcard[],
  gradedCards: Record<string, FlashcardGrade>,
  starredCardIds: string[],
): StudySessionResult {
  const cardResults = cards.map((card) => ({
    card,
    grade: gradedCards[card.id] ?? "incorrect",
  }));
  const incorrectCards = cardResults.filter((result) => result.grade === "incorrect").map((result) => result.card);

  return {
    id: crypto.randomUUID(),
    deckName: createDeckName(cards),
    completedAt: new Date().toISOString(),
    totalCards: cards.length,
    correctCount: cardResults.length - incorrectCards.length,
    incorrectCount: incorrectCards.length,
    incorrectCards,
    starredCards: cards.filter((card) => starredCardIds.includes(card.id)),
    cardResults,
  };
}

function App() {
  const [sourceText, setSourceText] = useState(SAMPLE_PLECO_TEXT);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(readSavedDecks);
  const [savedResults, setSavedResults] = useState<StudySessionResult[]>(readSavedResults);
  const [starredCardIds, setStarredCardIds] = useState<string[]>(readStarredCardIds);
  const [gradedCards, setGradedCards] = useState<Record<string, FlashcardGrade>>({});
  const [latestResult, setLatestResult] = useState<StudySessionResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [frontFields, setFrontFields] = useState<FieldVisibility>(createDefaultFront);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [isStudyFullscreen, setIsStudyFullscreen] = useState(false);
  const [isScribbleEnabled, setIsScribbleEnabled] = useState(false);
  const [scribbleStrokes, setScribbleStrokes] = useState<ScribbleStroke[]>([]);
  const [activeScribble, setActiveScribble] = useState<ScribbleStroke | null>(null);

  const parsedDeck = useMemo(() => parsePlecoText(sourceText), [sourceText]);
  const currentCard = cards[currentIndex];
  const visibleFields = isFlipped ? ALL_FIELDS_VISIBLE : frontFields;
  const currentGrade = currentCard ? gradedCards[currentCard.id] : undefined;
  const isLastCard = cards.length > 0 && currentIndex === cards.length - 1;

  function resetCardView() {
    setIsFlipped(false);
    setSelectedCharacter(null);
    setScribbleStrokes([]);
    setActiveScribble(null);
  }

  function resetStudySession() {
    setGradedCards({});
    setLatestResult(null);
    resetCardView();
  }

  function importParsedCards() {
    setCards(parsedDeck.cards);
    setCurrentIndex(0);
    resetStudySession();
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    file.text().then(setSourceText).catch(() => {
      window.alert("Could not read that file. Please paste the text instead.");
    });
  }

  function saveDeck() {
    if (cards.length === 0) return;

    const newDeck: SavedDeck = {
      id: crypto.randomUUID(),
      name: createDeckName(cards),
      createdAt: new Date().toISOString(),
      cards,
    };
    const nextDecks = [newDeck, ...savedDecks];
    setSavedDecks(nextDecks);
    writeJson(DECKS_STORAGE_KEY, nextDecks);
  }

  function loadDeck(deck: SavedDeck) {
    setCards(deck.cards);
    setCurrentIndex(0);
    resetStudySession();
  }

  function deleteDeck(deckId: string) {
    const nextDecks = savedDecks.filter((deck) => deck.id !== deckId);
    setSavedDecks(nextDecks);
    writeJson(DECKS_STORAGE_KEY, nextDecks);
  }

  function deleteCard(cardId: string) {
    const nextCards = cards.filter((card) => card.id !== cardId);
    setCards(nextCards);
    setCurrentIndex((index) => Math.min(index, Math.max(nextCards.length - 1, 0)));
    setGradedCards((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  }

  function updateFieldVisibility(field: FlashcardField) {
    setFrontFields((current) => ({ ...current, [field]: !current[field] }));
  }

  function moveCard(direction: -1 | 1) {
    if (cards.length === 0) return;
    setCurrentIndex((index) => (index + direction + cards.length) % cards.length);
    resetCardView();
  }

  function finishDeck(nextGradedCards: Record<string, FlashcardGrade>) {
    if (cards.length === 0) return;
    const result = buildStudyResult(cards, nextGradedCards, starredCardIds);
    const nextResults = [result, ...savedResults];
    setLatestResult(result);
    setSavedResults(nextResults);
    writeJson(RESULTS_STORAGE_KEY, nextResults);
  }

  function gradeCard(grade: FlashcardGrade) {
    if (!currentCard) return;

    const nextGradedCards = { ...gradedCards, [currentCard.id]: grade };
    setGradedCards(nextGradedCards);
    if (isLastCard) {
      finishDeck(nextGradedCards);
      resetCardView();
      return;
    }

    setCurrentIndex((index) => Math.min(index + 1, cards.length - 1));
    resetCardView();
  }

  function shuffleDeck() {
    setCards((currentCards) => shuffleCards(currentCards));
    setCurrentIndex(0);
    resetStudySession();
  }

  function createDeckFromIncorrect(result: StudySessionResult) {
    if (result.incorrectCards.length === 0) return;

    const newDeck: SavedDeck = {
      id: crypto.randomUUID(),
      name: `Review: ${result.deckName}`,
      createdAt: new Date().toISOString(),
      cards: result.incorrectCards,
    };
    const nextDecks = [newDeck, ...savedDecks];
    setSavedDecks(nextDecks);
    writeJson(DECKS_STORAGE_KEY, nextDecks);
    setCards(result.incorrectCards);
    setCurrentIndex(0);
    resetStudySession();
  }

  function toggleStar(card: Flashcard) {
    setStarredCardIds((current) => {
      const next = current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id];
      writeJson(STARRED_STORAGE_KEY, next);
      return next;
    });
  }

  function isCardStarred(card: Flashcard): boolean {
    return starredCardIds.includes(card.id);
  }

  function toggleScribble() {
    setIsScribbleEnabled((enabled) => !enabled);
    setActiveScribble(null);
  }

  function startScribble(event: ReactPointerEvent<SVGSVGElement>) {
    if (!isScribbleEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveScribble([getScribblePoint(event)]);
  }

  function continueScribble(event: ReactPointerEvent<SVGSVGElement>) {
    if (!isScribbleEnabled || !activeScribble) return;
    setActiveScribble([...activeScribble, getScribblePoint(event)]);
  }

  function finishScribble(event: ReactPointerEvent<SVGSVGElement>) {
    if (!activeScribble) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setScribbleStrokes((strokes) => [...strokes, activeScribble]);
    setActiveScribble(null);
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Pleco .txt trainer</p>
        <h1>Import Pleco flashcards and study them in the browser.</h1>
        <p>
          Paste or upload a Pleco text export, choose which fields appear on each card side,
          and click Hanzi characters for dictionary lookups.
        </p>
      </section>

      <section className="workspace-grid">
        <section className="panel import-panel" aria-labelledby="import-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2 id="import-heading">Import a Pleco .txt deck</h2>
            </div>
            <label className="file-button">
              Upload .txt
              <input type="file" accept=".txt,text/plain" onChange={handleUpload} />
            </label>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            aria-label="Pleco text input"
            spellCheck={false}
          />

          <div className="action-row">
            <button type="button" onClick={() => setSourceText(SAMPLE_PLECO_TEXT)}>
              Use sample
            </button>
            <button type="button" className="primary" onClick={importParsedCards} disabled={parsedDeck.cards.length === 0}>
              Import {parsedDeck.cards.length} cards
            </button>
          </div>

          {parsedDeck.errors.length > 0 && (
            <div className="error-list" role="alert">
              <strong>{parsedDeck.errors.length} line{parsedDeck.errors.length === 1 ? "" : "s"} need attention</strong>
              {parsedDeck.errors.map((error) => (
                <p key={`${error.lineNumber}-${error.message}`}>
                  Line {error.lineNumber}: {error.message}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="preview-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2 id="preview-heading">Preview cards</h2>
            </div>
            <span className="count-pill">{parsedDeck.cards.length} parsed</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hanzi</th>
                  <th>Pinyin</th>
                  <th>English</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {parsedDeck.cards.slice(0, 8).map((card) => (
                  <tr key={card.id}>
                    <td>{card.hanzi}</td>
                    <td>{formatPinyinForDisplay(card.pinyin)}</td>
                    <td>{card.english}</td>
                    <td>{card.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedDeck.cards.length > 8 && <p className="muted">Showing the first 8 parsed cards.</p>}
        </section>
      </section>

      <section className="workspace-grid study-grid">
        <section className={`panel study-panel ${isStudyFullscreen ? "fullscreen-study" : ""}`} aria-labelledby="study-heading">
          <div className="panel-heading study-heading">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2 id="study-heading">Study deck</h2>
            </div>
            <div className="study-tools">
              <button type="button" className={currentCard && isCardStarred(currentCard) ? "star-button is-starred" : "star-button"} onClick={() => currentCard && toggleStar(currentCard)} disabled={!currentCard}>
                {currentCard && isCardStarred(currentCard) ? "★ Starred" : "☆ Star"}
              </button>
              <button type="button" onClick={toggleScribble} disabled={cards.length === 0}>
                {isScribbleEnabled ? "Stop scribbling" : "Scribble"}
              </button>
              <button type="button" onClick={() => setScribbleStrokes([])} disabled={scribbleStrokes.length === 0 && !activeScribble}>
                Clear ink
              </button>
              <button type="button" onClick={() => setIsStudyFullscreen((fullscreen) => !fullscreen)} disabled={cards.length === 0}>
                {isStudyFullscreen ? "Exit full screen" : "Full screen"}
              </button>
              <button type="button" onClick={saveDeck} disabled={cards.length === 0}>
                Save deck
              </button>
            </div>
          </div>

          <div className="settings-grid single-setting">
            <FieldSelector title="Front shows" fields={frontFields} onToggle={updateFieldVisibility} />
            <p className="back-display-note">Back always shows Hanzi, Pinyin, and English.</p>
          </div>

          <div className={`flashcard-stage ${isScribbleEnabled ? "scribble-enabled" : ""}`}>
            <article className="flashcard" aria-live="polite">
              {currentCard ? (
                <>
                  <p className="card-progress">Card {currentIndex + 1} of {cards.length}</p>
                  {currentCard && isCardStarred(currentCard) && <span className="card-star">★ Starred</span>}
                  {FIELDS.filter(({ key }) => visibleFields[key]).map(({ key, label }) => (
                    <CardField
                      key={key}
                      label={label}
                      value={getCardField(currentCard, key)}
                      isHanzi={key === "hanzi"}
                      onSelectCharacter={setSelectedCharacter}
                    />
                  ))}
                  {!FIELDS.some(({ key }) => visibleFields[key]) && (
                    <p className="muted">Select at least one field for this side.</p>
                  )}
                </>
              ) : (
                <p className="empty-state">Import cards to begin studying.</p>
              )}
            </article>

            {currentCard && (
              <ScribbleLayer
                isEnabled={isScribbleEnabled}
                strokes={activeScribble ? [...scribbleStrokes, activeScribble] : scribbleStrokes}
                onPointerDown={startScribble}
                onPointerMove={continueScribble}
                onPointerUp={finishScribble}
              />
            )}
          </div>

          {isScribbleEnabled && <p className="scribble-hint">Scribble mode is on. Draw over the card to practice writing Hanzi.</p>}

          {currentCard && (
            <div className="grade-panel" aria-label="Card grade controls">
              <p>{currentGrade ? `Already marked ${currentGrade}. Choose again to continue.` : "Choose correct or incorrect to continue."}</p>
              <button type="button" className={currentGrade === "correct" ? "grade-correct is-selected" : "grade-correct"} onClick={() => gradeCard("correct")}>
                {isLastCard ? "Correct and finish" : "Correct"}
              </button>
              <button type="button" className={currentGrade === "incorrect" ? "grade-incorrect is-selected" : "grade-incorrect"} onClick={() => gradeCard("incorrect")}>
                {isLastCard ? "Incorrect and finish" : "Incorrect"}
              </button>
            </div>
          )}

          <div className="action-row card-controls">
            <button type="button" onClick={() => moveCard(-1)} disabled={cards.length === 0}>Previous</button>
            <button type="button" className="primary" onClick={() => setIsFlipped((flipped) => !flipped)} disabled={cards.length === 0}>
              {isFlipped ? "Show front" : "Flip card"}
            </button>
            <button type="button" onClick={shuffleDeck} disabled={cards.length < 2}>Shuffle</button>
          </div>

          {latestResult && (
            <ResultSummary result={latestResult} onCreateIncorrectDeck={createDeckFromIncorrect} />
          )}
        </section>

        <aside className="panel side-panel" aria-labelledby="lookup-heading">
          <div>
            <p className="eyebrow">Character tools</p>
            <h2 id="lookup-heading">Hanzi inspector</h2>
          </div>
          {selectedCharacter && currentCard ? (
            <div className="character-card">
              <span className="big-character">{selectedCharacter}</span>
              <p><strong>Card context:</strong> {currentCard.hanzi}</p>
              <p><strong>Pinyin context:</strong> {formatPinyinForDisplay(currentCard.pinyin)}</p>
              <p><strong>In-card meaning:</strong> {currentCard.english}</p>
              <div className="stroke-order-card">
                <strong>Stroke order</strong>
                <StrokeOrderDiagram character={selectedCharacter} />
              </div>
              <p className="definition-note">
                Embedded dictionary definitions need a bundled dictionary or backend API; external dictionaries are linked below for accurate lookup.
              </p>
              <a href={`https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">
                Open in MDBG
              </a>
              <a href={`https://www.archchinese.com/chinese_english_dictionary.html?find=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">
                Open in Arch Chinese
              </a>
              <a href={`https://www.yellowbridge.com/chinese/dictionary.php?word=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">
                Open in YellowBridge
              </a>
            </div>
          ) : (
            <p className="muted">Click an individual Hanzi character on a study card to view definition links.</p>
          )}

          <div className="saved-decks">
            <h3>Saved decks</h3>
            {savedDecks.length === 0 ? (
              <p className="muted">Saved decks stay in this browser.</p>
            ) : (
              savedDecks.map((deck) => (
                <div className="saved-deck" key={deck.id}>
                  <div>
                    <strong>{deck.name}</strong>
                    <span>{deck.cards.length} cards</span>
                  </div>
                  <button type="button" onClick={() => loadDeck(deck)}>Load</button>
                  <button type="button" className="ghost-danger" onClick={() => deleteDeck(deck.id)}>Delete</button>
                </div>
              ))
            )}
          </div>

          <div className="saved-results">
            <h3>Saved results</h3>
            {savedResults.length === 0 ? (
              <p className="muted">Completed deck results will appear here.</p>
            ) : (
              savedResults.slice(0, 4).map((result) => (
                <div className="saved-result" key={result.id}>
                  <strong>{result.deckName}</strong>
                  <span>{result.correctCount}/{result.totalCards} correct · {result.incorrectCount} missed</span>
                  <button type="button" onClick={() => createDeckFromIncorrect(result)} disabled={result.incorrectCount === 0}>
                    Review missed
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>

      {cards.length > 0 && (
        <section className="panel active-deck" aria-labelledby="active-deck-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Active deck</p>
              <h2 id="active-deck-heading">Manage imported cards</h2>
            </div>
            <span className="count-pill">{cards.length} active</span>
          </div>
          <div className="card-list">
            {cards.map((card) => (
              <div className="card-list-item" key={card.id}>
                <span>{card.hanzi}</span>
                <span>{formatPinyinForDisplay(card.pinyin)}</span>
                <span>{card.english}</span>
                <button type="button" className={isCardStarred(card) ? "star-button is-starred" : "star-button"} onClick={() => toggleStar(card)}>
                  {isCardStarred(card) ? "★" : "☆"}
                </button>
                <button type="button" onClick={() => deleteCard(card.id)}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function FieldSelector({
  title,
  fields,
  onToggle,
}: {
  title: string;
  fields: FieldVisibility;
  onToggle: (field: FlashcardField) => void;
}) {
  return (
    <fieldset className="field-selector">
      <legend>{title}</legend>
      {FIELDS.map(({ key, label }) => (
        <label key={key}>
          <input type="checkbox" checked={fields[key]} onChange={() => onToggle(key)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function CardField({
  label,
  value,
  isHanzi,
  onSelectCharacter,
}: {
  label: string;
  value: string;
  isHanzi: boolean;
  onSelectCharacter: (character: string) => void;
}) {
  return (
    <div className={`card-field ${isHanzi ? "hanzi-field" : ""}`}>
      <span>{label}</span>
      {isHanzi ? (
        <p>
          {Array.from(value).map((character, index) =>
            extractHanziCharacters(character).length > 0 ? (
              <button
                className="hanzi-character"
                type="button"
                key={`${character}-${index}`}
                onClick={() => onSelectCharacter(character)}
                aria-label={`Look up ${character}`}
              >
                {character}
              </button>
            ) : (
              <span key={`${character}-${index}`}>{character}</span>
            ),
          )}
        </p>
      ) : (
        <p>{value}</p>
      )}
    </div>
  );
}

function ScribbleLayer({
  isEnabled,
  strokes,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  isEnabled: boolean;
  strokes: ScribbleStroke[];
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
}) {
  return (
    <svg
      className={`scribble-layer ${isEnabled ? "is-active" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function StrokeOrderDiagram({ character }: { character: string }) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    target.innerHTML = "";
    setHasLoadError(false);
    let isMounted = true;
    const writer = HanziWriter.create(target, character, {
      width: 160,
      height: 160,
      padding: 10,
      showOutline: true,
      showCharacter: false,
      strokeAnimationSpeed: 1.2,
      delayBetweenStrokes: 250,
      strokeColor: "#0f172a",
      outlineColor: "#cbd5e1",
      highlightColor: "#2563eb",
      onLoadCharDataError: () => {
        if (isMounted) setHasLoadError(true);
      },
    });
    void writer.loopCharacterAnimation();

    return () => {
      isMounted = false;
      void writer.pauseAnimation();
      target.innerHTML = "";
    };
  }, [character]);

  return (
    <div>
      <div className="stroke-order-target" ref={targetRef} aria-label={`Stroke order animation for ${character}`} />
      {hasLoadError && <p className="muted">Stroke data could not be loaded for this character.</p>}
    </div>
  );
}

function ResultSummary({
  result,
  onCreateIncorrectDeck,
}: {
  result: StudySessionResult;
  onCreateIncorrectDeck: (result: StudySessionResult) => void;
}) {
  return (
    <section className="result-summary" aria-labelledby="result-summary-heading">
      <div>
        <p className="eyebrow">Saved result</p>
        <h3 id="result-summary-heading">{result.correctCount}/{result.totalCards} correct</h3>
      </div>
      <p>{result.incorrectCount} incorrect · {result.starredCards.length} starred in this deck</p>
      {result.incorrectCards.length > 0 ? (
        <div className="missed-list">
          {result.incorrectCards.map((card) => (
            <span key={card.id}>{card.hanzi} · {formatPinyinForDisplay(card.pinyin)}</span>
          ))}
        </div>
      ) : (
        <p className="muted">No incorrect cards in this result.</p>
      )}
      <button type="button" className="primary" onClick={() => onCreateIncorrectDeck(result)} disabled={result.incorrectCards.length === 0}>
        Create deck from incorrect items
      </button>
    </section>
  );
}

export default App;
