export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface WordChunk {
  text: string;
  hintJa: string;
  katakana: string;
  en?: string; // Kept in type for future use, but UI toggle is removed
}

export interface EnglishSentence {
  english: string;
  translationJa: string;
  grammarNoteJa?: string;
  
  /**
   * Chunks that make up the correct sentence.
   */
  wordBank: WordChunk[];

  /**
   * Optional: Wrong words mixed into the bank to test comprehension.
   * The UI will shuffle these together with the wordBank.
   */
  distractors?: WordChunk[];

  audioBase64?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LISTENING = 'LISTENING',
  FINISHED = 'FINISHED',
}