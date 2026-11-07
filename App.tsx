import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchRandomSentence,
  shuffleWordBank,
  checkAnswer as serviceCheckAnswer,
  markAsMastered,
  resetLevelProgress,
  EnglishSentenceWithId,
} from "./services/sentenceService";
import { AppState, CEFRLevel, WordChunk } from "./types";

const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1"];

const KatakanaText = ({
  text,
  showReading,
}: {
  text: string;
  showReading: boolean;
}) => {
  const parseReading = (str: string) => {
    if (str.includes("[")) {
      const parts = [];
      const regex = /([^\[]+)\[([^\]]+)\]/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(str)) !== null) {
        const baseText = match[1];
        const reading = match[2];

        const latinMatch = baseText.match(/[A-Za-z]+/);

        if (latinMatch) {
          const word = latinMatch[0];
          const before = baseText.split(word)[0];
          const after = baseText.split(word)[1] || "";

          if (before) {
            parts.push(<span key={`pre-${match.index}`} className="text-black">{before}</span>);
          }

          parts.push(
            <ruby key={`ruby-${match.index}`} className="mx-0 text-black" style={{ rubyAlign: "start", rubyPosition: "over" }}>
              {word}
              <rt className={`text-[0.55em] font-bold text-red-600 transition-all duration-300 ${showReading ? "opacity-100" : "opacity-0 overflow-hidden"}`} style={{ lineHeight: "1.6", paddingBottom: "2px" }}>
                {reading}
              </rt>
            </ruby>,
          );

          if (after) {
            parts.push(<span key={`post-${match.index}`} className="text-black">{after}</span>);
          }
        } else {
          parts.push(<span key={`text-${match.index}`} className="text-black">{baseText}</span>);
        }

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < str.length) {
        parts.push(<span key="text-end" className="text-black">{str.slice(lastIndex)}</span>);
      }
      return parts.length > 0 ? parts : [str];
    }
    return [<span key="raw" className="text-black">{str}</span>];
  };
  return <>{parseReading(text)}</>;
};

const WordBlock = ({
  chunk,
  showWordKatakana,
  onClick,
}: {
  chunk: WordChunk;
  showWordKatakana: boolean;
  onClick: () => void;
}) => {
  const hasReading = !!chunk.katakana;
  const showTooltip = showWordKatakana && hasReading;

  return (
    <div className="relative group">
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-white border border-gray-200 shadow-xl rounded-lg p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 flex flex-col items-center gap-1">
          {showWordKatakana && hasReading && (
            <div className="text-base font-semibold">
              <KatakanaText text={chunk.katakana} showReading={true} />
            </div>
          )}
          <div className="text-xs text-gray-600 font-medium">{chunk.hintJa}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white" />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-xl font-medium text-gray-700 shadow-sm hover:border-gray-300 hover:shadow hover:text-black transition-all active:scale-95"
      >
        {chunk.text}
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const [level, setLevel] = useState<CEFRLevel>("A1");
  const [sentence, setSentence] = useState<EnglishSentenceWithId | null>(null);

  const [showTranslation, setShowTranslation] = useState(true);
  const [isSlowAudio, setIsSlowAudio] = useState(false);
  const [enableWordAudio, setEnableWordAudio] = useState(false);
  const [showWordKatakana, setShowWordKatakana] = useState(false);

  const [selectedWords, setSelectedWords] = useState<WordChunk[]>([]);
  const [availableWords, setAvailableWords] = useState<WordChunk[]>([]);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [isCorrect, setIsCorrect] = useState(false);
  const [history, setHistory] = useState<EnglishSentenceWithId[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  
  const [hasMadeMistake, setHasMadeMistake] = useState(false);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSentenceRef = useRef<string | undefined>(undefined);

  const slowAudioRef = useRef(isSlowAudio);
  useEffect(() => {
    slowAudioRef.current = isSlowAudio;
  }, [isSlowAudio]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        (e.key === "Enter" || e.key === " ") && 
        !["INPUT", "TEXTAREA"].includes(target.tagName)
      ) {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const playSuccessSound = useCallback(() => {
    if (!audioContextRef.current)
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }, []);

  const speak = (text: string, rate: number = 0.9) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  };

  const initSession = useCallback(
    async (targetLevel: CEFRLevel = level) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      window.speechSynthesis.cancel();
      setIsLevelComplete(false);
      setAppState(AppState.LOADING);
      setSelectedWords([]);
      setAvailableWords([]);
      setIsCorrect(false);
      setHistoryIndex(null);
      setHasMadeMistake(false); 

      try {
        const newSentence = await fetchRandomSentence(targetLevel, currentSentenceRef.current);
        
        if (newSentence === null) {
          setIsLevelComplete(true);
          setAppState(AppState.IDLE);
          return;
        }

        currentSentenceRef.current = newSentence.english;
        setSentence(newSentence);
        
        const allWords = [
          ...(newSentence.wordBank || []),
          ...(newSentence.distractors || [])
        ];
        setAvailableWords(shuffleWordBank(allWords));
        
        setAppState(AppState.LISTENING);
      } catch (error) {
        console.error("Initialization error", error);
        setAppState(AppState.IDLE);
      }
    },
    [level],
  );

  const handleReset = () => {
    currentSentenceRef.current = undefined;
    initSession();
  };

  const handleLevelChange = (newLevel: CEFRLevel) => {
    if (newLevel === level) return;
    setLevel(newLevel);
    initSession(newLevel);
  };

  const handleResetLevel = () => {
    resetLevelProgress(level);
    setIsLevelComplete(false);
    handleReset();
  };

  const handleNextLevel = () => {
    const currentIndex = CEFR_LEVELS.indexOf(level);
    if (currentIndex < CEFR_LEVELS.length - 1) {
      const nextLevel = CEFR_LEVELS[currentIndex + 1];
      setLevel(nextLevel);
      setIsLevelComplete(false);
      initSession(nextLevel);
    }
  };

  const playAudio = useCallback(async () => {
    const activeSentence = historyIndex !== null ? history[historyIndex].english : sentence?.english;
    if (activeSentence) {
      speak(activeSentence, isSlowAudio ? 0.75 : 1.0);
    }
  }, [history, historyIndex, sentence, isSlowAudio]);

  const playMySentence = () => {
    if (selectedWords.length === 0) return;
    const mySentence = selectedWords.map((w) => w.text).join(" ");
    speak(mySentence, isSlowAudio ? 0.75 : 1.0);
  };

  useEffect(() => {
    if (!sentence || isCorrect) return;
    if (selectedWords.length === 0) return;

    if (serviceCheckAnswer(selectedWords, sentence)) {
      setIsCorrect(true);
      setAppState(AppState.FINISHED);
      playSuccessSound();
      setHistory((prev) => [...prev, sentence]);
      
      if (!hasMadeMistake) {
        markAsMastered(sentence.id);
      }
    }
  }, [selectedWords, sentence, isCorrect, playSuccessSound, hasMadeMistake]);

  const handleWordClick = (
    chunk: WordChunk,
    index: number,
    fromBank: boolean,
  ) => {
    if (isCorrect) return;

    if (fromBank && enableWordAudio) {
      speak(chunk.text, 0.85);
    }

    if (fromBank) {
      setSelectedWords((prev) => [...prev, chunk]);
      setAvailableWords((prev) => prev.filter((_, i) => i !== index));
    } else {
      setHasMadeMistake(true);
      setSelectedWords((prev) => prev.filter((_, i) => i !== index));
      setAvailableWords((prev) => [...prev, chunk]);
    }
  };

  const navigateHistory = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (historyIndex === null) {
        if (history.length > 0) setHistoryIndex(history.length - 1);
      } else if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
    } else {
      if (historyIndex !== null) {
        if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
        else setHistoryIndex(null);
      }
    }
  };

  useEffect(() => {
    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayedSentence = historyIndex !== null ? history[historyIndex] : sentence;
  const isViewingHistory = historyIndex !== null;
  const canGoBack = history.length > 0 && (historyIndex === null || historyIndex > 0);
  const fadeUp = "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-forwards";

  return (
    <div className="min-h-screen flex flex-col items-center p-8 bg-[#fdfdfd] text-[#2c2c2c] selection:bg-gray-100 font-sans transition-all duration-700">
      
      <div className="fixed top-12 left-12 z-30">
        <p className="text-[10px] text-gray-400 font-medium max-w-[200px] leading-tight">
          進捗はこのブラウザにのみ保存されます。<br/>別の端末では最初からになります。
        </p>
      </div>

      <div className="fixed top-12 right-12 z-30 flex flex-col items-end space-y-6">
        <nav className="flex items-center justify-end space-x-6 h-6">
          {CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => handleLevelChange(lvl)}
              className={`text-xs font-semibold tracking-[0.4em] transition-all duration-300 ${
                level === lvl ? "text-black scale-125" : "text-gray-200 hover:text-gray-400"
              }`}
            >
              {lvl}
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-6">
          <button 
            type="button" 
            onClick={() => setShowHelp(true)} 
            className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 hover:text-black transition-colors"
          >
            How to Use
          </button>
          
          <button type="button" onClick={handleReset} className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 hover:text-red-400 transition-colors">
            Reset Session
          </button>

          <label className="flex items-center cursor-pointer space-x-3 group">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 group-hover:text-black transition-colors">
              Translation
            </span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showTranslation} onChange={() => setShowTranslation(!showTranslation)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${showTranslation ? "bg-black" : "bg-gray-200"}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showTranslation ? "translate-x-4" : ""}`}></div>
            </div>
          </label>
        </div>

        <div className="flex items-center space-x-6">
          <label className="flex items-center cursor-pointer space-x-3 group">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 group-hover:text-black transition-colors">
              Slow Audio
            </span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={isSlowAudio} onChange={() => setIsSlowAudio(!isSlowAudio)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${isSlowAudio ? "bg-black" : "bg-gray-200"}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isSlowAudio ? "translate-x-4" : ""}`}></div>
            </div>
          </label>

          <label className="flex items-center cursor-pointer space-x-3 group">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 group-hover:text-black transition-colors">
              Word Audio
            </span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={enableWordAudio} onChange={() => setEnableWordAudio(!enableWordAudio)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${enableWordAudio ? "bg-black" : "bg-gray-200"}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${enableWordAudio ? "translate-x-4" : ""}`}></div>
            </div>
          </label>
        </div>

        <div className="flex items-center space-x-6">
          <label className="flex items-center cursor-pointer space-x-3 group">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 group-hover:text-black transition-colors">
              Word Katakana
            </span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showWordKatakana} onChange={() => setShowWordKatakana(!showWordKatakana)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${showWordKatakana ? "bg-black" : "bg-gray-200"}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showWordKatakana ? "translate-x-4" : ""}`}></div>
            </div>
          </label>
        </div>
      </div>

      {/* How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-3xl p-8 max-w-lg w-full space-y-6 animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-black tracking-wide text-center">
              アプリの使い方
            </h2>
            
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <div>
                <h3 className="font-bold text-black mb-1">1. レベルを選択</h3>
                <p>右上の A1 〜 C1 から、自分のレベルを選びます。</p>
              </div>
              
              <div>
                <h3 className="font-bold text-black mb-1">2. 音声を聴く</h3>
                <p>中央の青いスピーカーアイコンをタップすると、英文が再生されます。何度でも聴けます。</p>
              </div>
              
              <div>
                <h3 className="font-bold text-black mb-1">3. 単語を並べる</h3>
                <p>画面下の単語チップをタップして、聴こえた英文を組み立てます。間違えた単語はタップして戻せます。</p>
              </div>
              
              <div>
                <h3 className="font-bold text-black mb-1">4. 答え合わせ</h3>
                <p>正しく並べられると、緑色のチェックマークが表示されます。ヒントや文法の解説も確認できます。</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-blue-900 mt-4">
                <h3 className="font-bold mb-1">マスタリー（習得）システム</h3>
                <p>一度も間違えずに（単語を戻さずに）正解した文章は「マスター」として保存され、二度と出題されません。間違えた場合は、後で復習として再登場します。</p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-gray-700 mt-4">
                <h3 className="font-bold mb-1">📱 スマホでアプリとして使うには</h3>
                <p className="text-xs mb-2"><strong>iPhone (Safari):</strong> 画面下の共有ボタン（□に↑）をタップし、「ホーム画面に追加」を選択します。</p>
                <p className="text-xs"><strong>Android (Chrome):</strong> 右上のメニュー（⋮）をタップし、「ホーム画面に追加」を選択します。</p>
              </div>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="px-8 py-3 bg-black text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition-all tracking-[0.2em] uppercase"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Complete Modal */}
      {isLevelComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-3xl p-10 max-w-sm w-full text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="text-4xl">🎉</div>
            <h2 className="text-2xl font-bold text-black tracking-wide">
              レベル{level}をマスターしました！
            </h2>
            <p className="text-gray-500 text-sm">
              このレベルのすべての文章をクリアしました。
            </p>
            <div className="flex flex-col space-y-3 pt-4">
              {level !== "C1" && (
                <button
                  type="button"
                  onClick={handleNextLevel}
                  className="w-full py-4 bg-black text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition-all tracking-[0.2em] uppercase"
                >
                  次のレベルへ
                </button>
              )}
              <button
                type="button"
                onClick={handleResetLevel}
                className="w-full py-4 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-xs font-semibold hover:bg-gray-100 transition-all tracking-[0.2em] uppercase"
              >
                このレベルをリセット
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Nav */}
      {history.length > 0 && (
        <div className="fixed right-12 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-4 z-20">
          <button
            type="button"
            onClick={() => navigateHistory("prev")}
            disabled={!canGoBack}
            className={`px-5 py-3 rounded-full border border-gray-100 bg-white shadow-sm transition-all duration-300 active:scale-90 disabled:opacity-0 flex items-center space-x-2 ${canGoBack ? "hover:shadow-md hover:border-gray-200 text-gray-400 hover:text-black" : "pointer-events-none"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Review</span>
          </button>

          {isViewingHistory && (
            <button
              type="button"
              onClick={() => navigateHistory("next")}
              className="px-5 py-3 rounded-full border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-200 text-gray-400 hover:text-black active:scale-90 flex items-center space-x-2"
            >
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Next</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="max-w-2xl w-full flex-grow flex flex-col items-center justify-center space-y-8 pt-24 pb-12">
        <header className="text-center opacity-40">
          <h1 className="text-sm font-medium tracking-[0.3em] uppercase">
            {isViewingHistory ? "Review Mode" : "🧘 Zen Eigo 🧘"}
          </h1>
        </header>

        <div className="flex flex-col items-center space-y-6">
          <button
            type="button"
            onClick={playAudio}
            disabled={(!isViewingHistory && (appState === AppState.LOADING || !sentence)) || (isViewingHistory && !history[historyIndex])}
            className={`group relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 bg-blue-50 border border-blue-100 shadow-sm hover:shadow-lg hover:bg-blue-100 hover:border-blue-200 active:scale-95 disabled:opacity-30 ${appState === AppState.LOADING ? "animate-pulse" : ""}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-8 h-8 transition-colors ${!isViewingHistory && !sentence ? "text-blue-200" : "text-blue-500 group-hover:text-blue-700"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            {appState === AppState.LOADING && (
              <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin opacity-10" />
            )}
          </button>
        </div>

        {!isViewingHistory && !isLevelComplete && (
          <div className="w-full space-y-8">
            <div className="relative flex flex-col items-center min-h-[100px] justify-center border-b border-gray-100 pb-4 pt-4">
              <div className="flex flex-wrap justify-center gap-3 items-center">
                {selectedWords.length === 0 && (
                  <span className="text-gray-400 text-xl font-light tracking-wide mt-2">
                    Tap words below to build the sentence
                  </span>
                )}

                {selectedWords.map((chunk, idx) => (
                  <button
                    key={`selected-${idx}`}
                    type="button"
                    onClick={() => handleWordClick(chunk, idx, false)}
                    disabled={isCorrect}
                    className={`px-5 py-2.5 rounded-xl text-xl font-medium transition-all ${isCorrect ? "bg-green-50 text-green-600 cursor-default" : "bg-gray-50 text-black hover:bg-gray-100 active:scale-95"}`}
                  >
                    {chunk.text}
                  </button>
                ))}

                {isCorrect && (
                  <div className="ml-2 animate-in zoom-in fade-in duration-500 fill-mode-forwards flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {!isCorrect && (
              <div className="flex flex-col items-center space-y-4 pt-2">
                {selectedWords.length > 0 && (
                  <button
                    type="button"
                    onClick={playMySentence}
                    className="flex items-center space-x-2 text-xs font-semibold tracking-[0.2em] uppercase text-gray-400 hover:text-black transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Play My Sentence</span>
                  </button>
                )}

                <div className="flex flex-wrap justify-center gap-3">
                  {availableWords.map((chunk, idx) => (
                    <WordBlock
                      key={`bank-${idx}`}
                      chunk={chunk}
                      showWordKatakana={showWordKatakana}
                      onClick={() => handleWordClick(chunk, idx, true)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(isCorrect || isViewingHistory) && displayedSentence && !isLevelComplete && (
          <div className={`flex flex-col items-center space-y-8 w-full ${fadeUp}`}>
            <div className="text-center space-y-4">
              <div className="space-y-2">
                <p className="text-4xl font-normal text-black flex justify-center flex-wrap gap-x-1 leading-[2] items-baseline">
                  {displayedSentence.english}
                </p>
              </div>
              
              {showTranslation && (
                <div className="pt-2 max-w-lg mx-auto animate-in fade-in duration-300">
                  <p className="text-xl text-gray-600 font-light tracking-wide">
                    {displayedSentence.translationJa}
                  </p>
                </div>
              )}

              {displayedSentence.grammarNoteJa && (
                <div className="pt-2 max-w-lg mx-auto animate-in fade-in duration-500">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-5 py-3 shadow-sm">
                    <p className="text-sm font-medium text-blue-900 leading-relaxed text-center">
                      {displayedSentence.grammarNoteJa}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!isViewingHistory && (
              <div className="text-center pb-2 animate-in fade-in duration-500">
                {hasMadeMistake ? (
                  <p className="text-xs text-gray-400 font-medium">Passed (Needs review later)</p>
                ) : (
                  <p className="text-xs text-green-600 font-medium">✨ Perfect! Sentence Mastered.</p>
                )}
              </div>
            )}
            
            <button
              type="button"
              onClick={() =>
                isViewingHistory ? setHistoryIndex(null) : initSession()
              }
              className="px-10 py-4 bg-black text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition-all hover:px-12 active:scale-95 tracking-[0.4em] uppercase shadow-lg shadow-black/5"
            >
              {isViewingHistory ? "Back to Current" : "Next Sentence"}
            </button>
          </div>
        )}
      </div>

      <footer className="mt-auto pt-8 pb-4 text-[10px] text-gray-400 opacity-60 hover:opacity-100 transition-opacity duration-300 text-center px-4 w-full">
        Base code by{" "}
        <a href="https://github.com/chrisloveliverpool-debug/Zen-Listen" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-gray-300 hover:text-black transition-colors">chrisloveliverpool-debug</a>
        {" "}• Perfected with the help of{" "}
        <a href="https://github.com/ACG-Applications" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-gray-300 hover:text-black transition-colors">ACG-Applications</a>
        {" "}and{" "}
        <a href="https://github.com/deepseek-ai" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-gray-300 hover:text-black transition-colors">DeepSeek</a>
      </footer>
    </div>
  );
};

export default App;