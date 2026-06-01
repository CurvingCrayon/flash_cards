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
你好\tni3 hao3\thello
谢谢\txie4 xie5\tthanks
朋友\tpeng2 you5\tfriend`;

const DECKS_STORAGE_KEY = "pleco-flash-card-decks";
const RESULTS_STORAGE_KEY = "pleco-flash-card-results";
const STARRED_STORAGE_KEY = "pleco-flash-card-starred";
const FIELDS: { key: FlashcardField; label: string }[] = [
  { key: "hanzi", label: "Hanzi" },
  { key: "pinyin", label: "Pinyin" },
  { key: "english", label: "English" },
];
const ALL_FIELDS_VISIBLE: FieldVisibility = { hanzi: true, pinyin: true, english: true };

type AppPage = "decks" | "test" | "results";
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
  const [activePage, setActivePage] = useState<AppPage>("decks");
  const [sourceText, setSourceText] = useState(SAMPLE_PLECO_TEXT);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(readSavedDecks);
  const [savedResults, setSavedResults] = useState<StudySessionResult[]>(readSavedResults);
  const [starredCardIds, setStarredCardIds] = useState<string[]>(readStarredCardIds);
  const [gradedCards, setGradedCards] = useState<Record<string, FlashcardGrade>>({});
  const [latestResult, setLatestResult] = useState<StudySessionResult | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
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
  const selectedDeck = savedDecks.find((deck) => deck.id === selectedDeckId) ?? savedDecks[0];

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

  function startStudy(deck: SavedDeck) {
    setCards(deck.cards);
    setSelectedDeckId(deck.id);
    setCurrentIndex(0);
    resetStudySession();
    setActivePage("test");
  }

  function studyImportedCards() {
    if (parsedDeck.cards.length === 0) return;
    setCards(parsedDeck.cards);
    setSelectedDeckId(null);
    setCurrentIndex(0);
    resetStudySession();
    setActivePage("test");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    file.text().then(setSourceText).catch(() => {
      window.alert("Could not read that file. Please paste the text instead.");
    });
  }

  function saveDeckFromCards(cardsToSave: Flashcard[], name = createDeckName(cardsToSave)): SavedDeck | null {
    if (cardsToSave.length === 0) return null;

    const newDeck: SavedDeck = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      cards: cardsToSave,
    };
    const nextDecks = [newDeck, ...savedDecks];
    setSavedDecks(nextDecks);
    setSelectedDeckId(newDeck.id);
    writeJson(DECKS_STORAGE_KEY, nextDecks);
    return newDeck;
  }

  function saveImportedDeck() {
    saveDeckFromCards(parsedDeck.cards);
  }

  function saveActiveDeck() {
    saveDeckFromCards(cards);
  }

  function deleteDeck(deckId: string) {
    const nextDecks = savedDecks.filter((deck) => deck.id !== deckId);
    setSavedDecks(nextDecks);
    setSelectedDeckId((current) => (current === deckId ? nextDecks[0]?.id ?? null : current));
    writeJson(DECKS_STORAGE_KEY, nextDecks);
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
    setActivePage("results");
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
    const newDeck = saveDeckFromCards(result.incorrectCards, `Review: ${result.deckName}`);
    if (!newDeck) return;
    startStudy(newDeck);
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
        <h1>Import, study, and review Chinese flashcard decks.</h1>
        <p>
          Manage decks, start focused tests, and turn missed cards into new review decks.
        </p>
      </section>

      <nav className="page-nav" aria-label="Flashcard app pages">
        <div>
          <p className="eyebrow">Flashcards</p>
          <strong>Study menu</strong>
        </div>
        <button type="button" className={activePage === "decks" ? "is-active" : ""} onClick={() => setActivePage("decks")}>
          Decks
        </button>
        <button type="button" className={activePage === "test" ? "is-active" : ""} onClick={() => setActivePage("test")}>
          Test
        </button>
        <button type="button" className={activePage === "results" ? "is-active" : ""} onClick={() => setActivePage("results")}>
          Results
        </button>
      </nav>

      {activePage === "decks" && (
        <DecksPage
          sourceText={sourceText}
          parsedCards={parsedDeck.cards}
          parseErrors={parsedDeck.errors}
          savedDecks={savedDecks}
          selectedDeck={selectedDeck}
          onSourceTextChange={setSourceText}
          onUpload={handleUpload}
          onUseSample={() => setSourceText(SAMPLE_PLECO_TEXT)}
          onSaveImportedDeck={saveImportedDeck}
          onStudyImportedDeck={studyImportedCards}
          onSelectDeck={(deck) => setSelectedDeckId(deck.id)}
          onStudyDeck={startStudy}
          onDeleteDeck={deleteDeck}
        />
      )}

      {activePage === "test" && (
        <TestPage
          cards={cards}
          savedDecks={savedDecks}
          currentCard={currentCard}
          currentIndex={currentIndex}
          currentGrade={currentGrade}
          isFlipped={isFlipped}
          isLastCard={isLastCard}
          latestResult={latestResult}
          frontFields={frontFields}
          visibleFields={visibleFields}
          selectedCharacter={selectedCharacter}
          isStudyFullscreen={isStudyFullscreen}
          isScribbleEnabled={isScribbleEnabled}
          scribbleStrokes={activeScribble ? [...scribbleStrokes, activeScribble] : scribbleStrokes}
          activeScribble={activeScribble}
          onStartStudy={startStudy}
          onUpdateFieldVisibility={updateFieldVisibility}
          onToggleStar={toggleStar}
          isCardStarred={isCardStarred}
          onToggleScribble={toggleScribble}
          onClearInk={() => setScribbleStrokes([])}
          onToggleFullscreen={() => setIsStudyFullscreen((fullscreen) => !fullscreen)}
          onSaveActiveDeck={saveActiveDeck}
          onSelectCharacter={setSelectedCharacter}
          onStartScribble={startScribble}
          onContinueScribble={continueScribble}
          onFinishScribble={finishScribble}
          onGradeCard={gradeCard}
          onMoveCard={moveCard}
          onFlip={() => setIsFlipped((flipped) => !flipped)}
          onShuffle={shuffleDeck}
          onCreateIncorrectDeck={createDeckFromIncorrect}
        />
      )}

      {activePage === "results" && (
        <ResultsPage
          results={savedResults}
          latestResultId={latestResult?.id}
          onCreateIncorrectDeck={createDeckFromIncorrect}
        />
      )}
    </main>
  );
}

function DecksPage({
  sourceText,
  parsedCards,
  parseErrors,
  savedDecks,
  selectedDeck,
  onSourceTextChange,
  onUpload,
  onUseSample,
  onSaveImportedDeck,
  onStudyImportedDeck,
  onSelectDeck,
  onStudyDeck,
  onDeleteDeck,
}: {
  sourceText: string;
  parsedCards: Flashcard[];
  parseErrors: Array<{ lineNumber: number; message: string }>;
  savedDecks: SavedDeck[];
  selectedDeck?: SavedDeck;
  onSourceTextChange: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUseSample: () => void;
  onSaveImportedDeck: () => void;
  onStudyImportedDeck: () => void;
  onSelectDeck: (deck: SavedDeck) => void;
  onStudyDeck: (deck: SavedDeck) => void;
  onDeleteDeck: (deckId: string) => void;
}) {
  return (
    <section className="page-section">
      <div className="workspace-grid">
        <section className="panel import-panel" aria-labelledby="import-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Deck library</p>
              <h2 id="import-heading">Import a Pleco .txt deck</h2>
            </div>
            <label className="file-button">
              Upload .txt
              <input type="file" accept=".txt,text/plain" onChange={onUpload} />
            </label>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => onSourceTextChange(event.target.value)}
            aria-label="Pleco text input"
            spellCheck={false}
          />

          <div className="action-row">
            <button type="button" onClick={onUseSample}>Use sample</button>
            <button type="button" className="primary" onClick={onSaveImportedDeck} disabled={parsedCards.length === 0}>
              Save imported deck
            </button>
            <button type="button" onClick={onStudyImportedDeck} disabled={parsedCards.length === 0}>
              Study imported deck
            </button>
          </div>

          {parseErrors.length > 0 && (
            <div className="error-list" role="alert">
              <strong>{parseErrors.length} line{parseErrors.length === 1 ? "" : "s"} need attention</strong>
              {parseErrors.map((error) => (
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
              <p className="eyebrow">Import preview</p>
              <h2 id="preview-heading">Parsed cards</h2>
            </div>
            <span className="count-pill">{parsedCards.length} parsed</span>
          </div>
          <CardTable cards={parsedCards.slice(0, 8)} />
          {parsedCards.length > 8 && <p className="muted">Showing the first 8 parsed cards.</p>}
        </section>
      </div>

      <div className="workspace-grid deck-library-grid">
        <section className="panel" aria-labelledby="saved-decks-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Saved decks</p>
              <h2 id="saved-decks-heading">Choose a deck to view</h2>
            </div>
            <span className="count-pill">{savedDecks.length} decks</span>
          </div>
          {savedDecks.length === 0 ? (
            <p className="muted">Import and save a deck to build your library.</p>
          ) : (
            <div className="deck-list">
              {savedDecks.map((deck) => (
                <div className="saved-deck" key={deck.id}>
                  <button type="button" className="deck-title-button" onClick={() => onSelectDeck(deck)}>
                    <strong>{deck.name}</strong>
                    <span>{deck.cards.length} cards</span>
                  </button>
                  <button type="button" onClick={() => onStudyDeck(deck)}>Study</button>
                  <button type="button" className="ghost-danger" onClick={() => onDeleteDeck(deck.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="deck-detail-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Deck detail</p>
              <h2 id="deck-detail-heading">{selectedDeck ? selectedDeck.name : "No deck selected"}</h2>
            </div>
            {selectedDeck && <button type="button" className="primary" onClick={() => onStudyDeck(selectedDeck)}>Start test</button>}
          </div>
          {selectedDeck ? <CardTable cards={selectedDeck.cards} /> : <p className="muted">Select a saved deck to view its cards.</p>}
        </section>
      </div>
    </section>
  );
}

function TestPage({
  cards,
  savedDecks,
  currentCard,
  currentIndex,
  currentGrade,
  isFlipped,
  isLastCard,
  latestResult,
  frontFields,
  visibleFields,
  selectedCharacter,
  isStudyFullscreen,
  isScribbleEnabled,
  scribbleStrokes,
  activeScribble,
  onStartStudy,
  onUpdateFieldVisibility,
  onToggleStar,
  isCardStarred,
  onToggleScribble,
  onClearInk,
  onToggleFullscreen,
  onSaveActiveDeck,
  onSelectCharacter,
  onStartScribble,
  onContinueScribble,
  onFinishScribble,
  onGradeCard,
  onMoveCard,
  onFlip,
  onShuffle,
  onCreateIncorrectDeck,
}: {
  cards: Flashcard[];
  savedDecks: SavedDeck[];
  currentCard?: Flashcard;
  currentIndex: number;
  currentGrade?: FlashcardGrade;
  isFlipped: boolean;
  isLastCard: boolean;
  latestResult: StudySessionResult | null;
  frontFields: FieldVisibility;
  visibleFields: FieldVisibility;
  selectedCharacter: string | null;
  isStudyFullscreen: boolean;
  isScribbleEnabled: boolean;
  scribbleStrokes: ScribbleStroke[];
  activeScribble: ScribbleStroke | null;
  onStartStudy: (deck: SavedDeck) => void;
  onUpdateFieldVisibility: (field: FlashcardField) => void;
  onToggleStar: (card: Flashcard) => void;
  isCardStarred: (card: Flashcard) => boolean;
  onToggleScribble: () => void;
  onClearInk: () => void;
  onToggleFullscreen: () => void;
  onSaveActiveDeck: () => void;
  onSelectCharacter: (character: string) => void;
  onStartScribble: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onContinueScribble: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onFinishScribble: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onGradeCard: (grade: FlashcardGrade) => void;
  onMoveCard: (direction: -1 | 1) => void;
  onFlip: () => void;
  onShuffle: () => void;
  onCreateIncorrectDeck: (result: StudySessionResult) => void;
}) {
  if (cards.length === 0) {
    return (
      <section className="page-section">
        <section className="panel deck-picker" aria-labelledby="deck-picker-heading">
          <p className="eyebrow">Start a test</p>
          <h2 id="deck-picker-heading">Pick a deck</h2>
          {savedDecks.length === 0 ? (
            <p className="muted">No saved decks yet. Go to Decks to import one.</p>
          ) : (
            <div className="deck-card-grid">
              {savedDecks.map((deck) => (
                <article className="deck-card" key={deck.id}>
                  <h3>{deck.name}</h3>
                  <p>{deck.cards.length} cards</p>
                  <button type="button" className="primary" onClick={() => onStartStudy(deck)}>Start test</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="page-section">
      <section className="workspace-grid study-grid">
        <section className={`panel study-panel ${isStudyFullscreen ? "fullscreen-study" : ""}`} aria-labelledby="study-heading">
          <div className="panel-heading study-heading">
            <div>
              <p className="eyebrow">Test</p>
              <h2 id="study-heading">Study active deck</h2>
            </div>
            <div className="study-tools">
              <button type="button" className={currentCard && isCardStarred(currentCard) ? "star-button is-starred" : "star-button"} onClick={() => currentCard && onToggleStar(currentCard)} disabled={!currentCard}>
                {currentCard && isCardStarred(currentCard) ? "★ Starred" : "☆ Star"}
              </button>
              <button type="button" onClick={onToggleScribble} disabled={cards.length === 0}>
                {isScribbleEnabled ? "Stop scribbling" : "Scribble"}
              </button>
              <button type="button" onClick={onClearInk} disabled={scribbleStrokes.length === 0 && !activeScribble}>Clear ink</button>
              <button type="button" onClick={onToggleFullscreen} disabled={cards.length === 0}>
                {isStudyFullscreen ? "Exit full screen" : "Full screen"}
              </button>
              <button type="button" onClick={onSaveActiveDeck} disabled={cards.length === 0}>Save deck</button>
            </div>
          </div>

          <div className="settings-grid single-setting">
            <FieldSelector title="Front shows" fields={frontFields} onToggle={onUpdateFieldVisibility} />
            <p className="back-display-note">Back always shows Hanzi, Pinyin, and English.</p>
          </div>

          <div className={`flashcard-stage ${isScribbleEnabled ? "scribble-enabled" : ""}`}>
            <article className="flashcard" aria-live="polite">
              {currentCard ? (
                <>
                  <p className="card-progress">Card {currentIndex + 1} of {cards.length}</p>
                  {isCardStarred(currentCard) && <span className="card-star">★ Starred</span>}
                  {FIELDS.filter(({ key }) => visibleFields[key]).map(({ key, label }) => (
                    <CardField
                      key={key}
                      label={label}
                      value={getCardField(currentCard, key)}
                      isHanzi={key === "hanzi"}
                      onSelectCharacter={onSelectCharacter}
                    />
                  ))}
                  {!FIELDS.some(({ key }) => visibleFields[key]) && <p className="muted">Select at least one field for this side.</p>}
                </>
              ) : (
                <p className="empty-state">Pick a deck to begin studying.</p>
              )}
            </article>

            {currentCard && (
              <ScribbleLayer
                isEnabled={isScribbleEnabled}
                strokes={scribbleStrokes}
                onPointerDown={onStartScribble}
                onPointerMove={onContinueScribble}
                onPointerUp={onFinishScribble}
              />
            )}
          </div>

          {isScribbleEnabled && <p className="scribble-hint">Scribble mode is on. Draw over the card to practice writing Hanzi.</p>}

          {currentCard && isFlipped && (
            <div className="grade-panel" aria-label="Card grade controls">
              <p>{currentGrade ? `Already marked ${currentGrade}. Choose again to continue.` : "Choose correct or incorrect to continue."}</p>
              <button type="button" className={currentGrade === "correct" ? "grade-correct is-selected" : "grade-correct"} onClick={() => onGradeCard("correct")}>
                {isLastCard ? "Correct and finish" : "Correct"}
              </button>
              <button type="button" className={currentGrade === "incorrect" ? "grade-incorrect is-selected" : "grade-incorrect"} onClick={() => onGradeCard("incorrect")}>
                {isLastCard ? "Incorrect and finish" : "Incorrect"}
              </button>
            </div>
          )}

          <div className="action-row card-controls">
            <button type="button" onClick={() => onMoveCard(-1)} disabled={cards.length === 0}>Previous</button>
            <button type="button" className="primary" onClick={onFlip} disabled={cards.length === 0}>{isFlipped ? "Show front" : "Flip card"}</button>
            <button type="button" onClick={onShuffle} disabled={cards.length < 2}>Shuffle</button>
          </div>

          {latestResult && <ResultSummary result={latestResult} onCreateIncorrectDeck={onCreateIncorrectDeck} />}
        </section>

        <aside className="panel side-panel" aria-labelledby="lookup-heading">
          <HanziInspector selectedCharacter={selectedCharacter} currentCard={currentCard} />
        </aside>
      </section>
    </section>
  );
}

function ResultsPage({
  results,
  latestResultId,
  onCreateIncorrectDeck,
}: {
  results: StudySessionResult[];
  latestResultId?: string;
  onCreateIncorrectDeck: (result: StudySessionResult) => void;
}) {
  return (
    <section className="page-section">
      <section className="panel" aria-labelledby="results-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Previous tests</p>
            <h2 id="results-heading">Results</h2>
          </div>
          <span className="count-pill">{results.length} saved</span>
        </div>
        {results.length === 0 ? (
          <p className="muted">Complete a test to save results here.</p>
        ) : (
          <ResultsTable
            results={results}
            latestResultId={latestResultId}
            onCreateIncorrectDeck={onCreateIncorrectDeck}
          />
        )}
      </section>
    </section>
  );
}


function ResultsTable({
  results,
  latestResultId,
  onCreateIncorrectDeck,
}: {
  results: StudySessionResult[];
  latestResultId?: string;
  onCreateIncorrectDeck: (result: StudySessionResult) => void;
}) {
  return (
    <div className="table-wrap results-table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Completed</th>
            <th>Deck</th>
            <th>Score</th>
            <th>Incorrect</th>
            <th>Starred</th>
            <th>Review</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr className={result.id === latestResultId ? "is-highlighted" : ""} key={result.id}>
              <td>{new Date(result.completedAt).toLocaleString()}</td>
              <td>{result.deckName}</td>
              <td>{result.correctCount}/{result.totalCards}</td>
              <td>
                {result.incorrectCards.length > 0 ? (
                  <div className="missed-list compact">
                    {result.incorrectCards.map((card) => (
                      <span key={card.id}>{card.hanzi} · {formatPinyinForDisplay(card.pinyin)}</span>
                    ))}
                  </div>
                ) : (
                  <span className="muted">None</span>
                )}
              </td>
              <td>{result.starredCards.length}</td>
              <td>
                <button type="button" onClick={() => onCreateIncorrectDeck(result)} disabled={result.incorrectCards.length === 0}>
                  Create review deck
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HanziInspector({ selectedCharacter, currentCard }: { selectedCharacter: string | null; currentCard?: Flashcard }) {
  return (
    <>
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
          <a href={`https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">Open in MDBG</a>
          <a href={`https://www.archchinese.com/chinese_english_dictionary.html?find=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">Open in Arch Chinese</a>
          <a href={`https://www.yellowbridge.com/chinese/dictionary.php?word=${encodeURIComponent(selectedCharacter)}`} target="_blank" rel="noreferrer">Open in YellowBridge</a>
        </div>
      ) : (
        <p className="muted">Click an individual Hanzi character on a study card to view definition links and stroke order.</p>
      )}
    </>
  );
}

function CardTable({ cards }: { cards: Flashcard[] }) {
  if (cards.length === 0) return <p className="muted">No cards to show yet.</p>;

  return (
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
          {cards.map((card) => (
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
  isHighlighted = false,
  onCreateIncorrectDeck,
}: {
  result: StudySessionResult;
  isHighlighted?: boolean;
  onCreateIncorrectDeck: (result: StudySessionResult) => void;
}) {
  return (
    <section className={`result-summary ${isHighlighted ? "is-highlighted" : ""}`} aria-label={`${result.deckName} result`}>
      <div>
        <p className="eyebrow">{new Date(result.completedAt).toLocaleString()}</p>
        <h3>{result.deckName}: {result.correctCount}/{result.totalCards} correct</h3>
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
