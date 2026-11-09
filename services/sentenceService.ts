import { EnglishSentence, CEFRLevel, WordChunk } from "../types";
import { ENGLISH_SENTENCE_BANK_A1 } from "../englishSentenceBankA1";
import { ENGLISH_SENTENCE_BANK_A2 } from "../englishSentenceBankA2";
import { ENGLISH_SENTENCE_BANK_B1 } from "../englishSentenceBankB1";
import { ENGLISH_SENTENCE_BANK_B2 } from "../englishSentenceBankB2";
import { ENGLISH_SENTENCE_BANK_C1 } from "../englishSentenceBankC1";

export type EnglishSentenceWithId = EnglishSentence & { id: string };

// Automatically assign IDs based on the level and index
const BANKS: Record<CEFRLevel, EnglishSentenceWithId[]> = {
  A1: ENGLISH_SENTENCE_BANK_A1.map((s, i) => ({ ...s, id: `A1-${i}` })),
  A2: ENGLISH_SENTENCE_BANK_A2.map((s, i) => ({ ...s, id: `A2-${i}` })),
  B1: ENGLISH_SENTENCE_BANK_B1.map((s, i) => ({ ...s, id: `B1-${i}` })),
  B2: ENGLISH_SENTENCE_BANK_B2.map((s, i) => ({ ...s, id: `B2-${i}` })),
  C1: ENGLISH_SENTENCE_BANK_C1.map((s, i) => ({ ...s, id: `C1-${i}` })),
};

const STORAGE_KEY = "zen-eigo-mastered";

// Get the list of solved IDs from Local Storage
function getMasteredIds(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save a newly solved ID to Local Storage
export function markAsMastered(id: string) {
  const mastered = getMasteredIds();
  if (!mastered.includes(id)) {
    mastered.push(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mastered));
  }
}

// Clear progress for a specific level
export function resetLevelProgress(level: CEFRLevel) {
  const mastered = getMasteredIds().filter((id) => !id.startsWith(level));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mastered));
}

// --- NEW DECK FUNCTION ---
// Returns a shuffled array of sentences that have NOT been mastered yet.
export function getUnseenDeck(level: CEFRLevel): EnglishSentenceWithId[] {
  const bank = BANKS[level];
  const masteredIds = getMasteredIds();

  // Filter out sentences already marked as mastered
  const unseen = bank.filter((s) => !masteredIds.includes(s.id));
  
  // Shuffle the unseen sentences
  return shuffleWordBank(unseen);
}
// -------------------------

export function shuffleWordBank<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeForCompare(s: string): string {
  return s
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function checkAnswer(
  assembled: readonly WordChunk[],
  sentence: EnglishSentence,
): boolean {
  const attempt = assembled.map((c) => c.text).join(" ");
  return normalizeForCompare(attempt) === normalizeForCompare(sentence.english);
}