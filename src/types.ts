export type FlashcardField = "hanzi" | "pinyin" | "english";

export type FieldVisibility = Record<FlashcardField, boolean>;

export type Flashcard = {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  category: string;
  lineNumber: number;
};

export type ParseError = {
  lineNumber: number;
  line: string;
  message: string;
};

export type ParsedPlecoDeck = {
  cards: Flashcard[];
  errors: ParseError[];
};

export type SavedDeck = {
  id: string;
  name: string;
  createdAt: string;
  cards: Flashcard[];
};

export type FlashcardGrade = "correct" | "incorrect";

export type StudySessionResult = {
  id: string;
  deckName: string;
  completedAt: string;
  totalCards: number;
  correctCount: number;
  incorrectCount: number;
  incorrectCards: Flashcard[];
  starredCards: Flashcard[];
  cardResults: Array<{
    card: Flashcard;
    grade: FlashcardGrade;
  }>;
};
