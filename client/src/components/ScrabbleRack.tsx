import React, { useEffect, useRef, useState } from 'react';
import { Bomb, Delete, Flag, RotateCcw } from 'lucide-react';
import { ScrabbleTile, normalizeWord } from '@drawsomething/shared';
import { soundFX } from '../utils/sound';

interface ScrabbleRackProps {
  roundKey: string;
  wordLength: number;
  wordCategory: string | null;
  tiles: ScrabbleTile[];
  bombUsed: boolean;
  onSubmitGuess: (guess: string) => Promise<boolean>;
  onUseBomb: () => void;
  onGiveUp: () => void;
}

export const ScrabbleRack: React.FC<ScrabbleRackProps> = ({
  roundKey,
  wordLength,
  wordCategory,
  tiles,
  bombUsed,
  onSubmitGuess,
  onUseBomb,
  onGiveUp,
}) => {
  const [placedTileIds, setPlacedTileIds] = useState<(string | null)[]>([]);
  const [wrongFlash, setWrongFlash] = useState(false);
  const submittingRef = useRef(false);

  // Reset slots on new round / wordLength
  useEffect(() => {
    setPlacedTileIds(Array(wordLength).fill(null));
    setWrongFlash(false);
    submittingRef.current = false;
  }, [roundKey, wordLength]);

  // If bomb eliminates a tile currently placed in a slot, clear that slot
  useEffect(() => {
    const eliminatedIds = new Set(
      tiles.filter((t) => t.eliminated).map((t) => t.id)
    );
    setPlacedTileIds((prev) =>
      prev.map((id) => (id && eliminatedIds.has(id) ? null : id))
    );
  }, [tiles]);

  const tileMap = new Map(tiles.map((t) => [t.id, t]));
  const usedSet = new Set(placedTileIds.filter((id): id is string => Boolean(id)));

  const triggerCheck = async (nextSlots: (string | null)[]) => {
    if (nextSlots.some((s) => s === null) || submittingRef.current) return;
    const guess = nextSlots
      .map((id) => (id ? tileMap.get(id)?.letter ?? '' : ''))
      .join('');
    if (guess.length !== wordLength) return;

    submittingRef.current = true;
    const correct = await onSubmitGuess(guess);
    if (!correct) {
      soundFX.playWrongGuess();
      setWrongFlash(true);
      setTimeout(() => {
        setWrongFlash(false);
        setPlacedTileIds(Array(wordLength).fill(null));
        submittingRef.current = false;
      }, 460);
    } else {
      submittingRef.current = false;
    }
  };

  const placeTile = (tileId: string) => {
    if (submittingRef.current || wrongFlash) return;
    const tile = tileMap.get(tileId);
    if (!tile || tile.eliminated || usedSet.has(tileId)) return;

    const emptyIdx = placedTileIds.findIndex((id) => id === null);
    if (emptyIdx === -1) return;

    soundFX.playTileClick();
    const next = [...placedTileIds];
    next[emptyIdx] = tileId;
    setPlacedTileIds(next);
    void triggerCheck(next);
  };

  const removeSlot = (slotIdx: number) => {
    if (submittingRef.current || wrongFlash) return;
    if (!placedTileIds[slotIdx]) return;
    soundFX.playTileRemove();
    const next = [...placedTileIds];
    next[slotIdx] = null;
    setPlacedTileIds(next);
  };

  const clearSlots = () => {
    if (submittingRef.current || wrongFlash) return;
    if (placedTileIds.some(Boolean)) soundFX.playTileRemove();
    setPlacedTileIds(Array(wordLength).fill(null));
  };

  const removeLastSlot = () => {
    if (submittingRef.current || wrongFlash) return;
    for (let i = placedTileIds.length - 1; i >= 0; i--) {
      if (placedTileIds[i] !== null) {
        removeSlot(i);
        break;
      }
    }
  };

  // Physical keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        removeLastSlot();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSlots();
        return;
      }

      const norm = normalizeWord(e.key);
      if (norm.length === 1) {
        const match = tiles.find(
          (t) => !t.eliminated && !usedSet.has(t.id) && t.letter === norm
        );
        if (match) {
          e.preventDefault();
          placeTile(match.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const canUseBomb = !bombUsed && tiles.length - wordLength > 0;

  return (
    <div className="arcade-card-sm rounded-3xl p-2.5 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="px-2.5 sm:px-3 py-1 rounded-full bg-[#3A86FF] text-white border-2 border-[#1E1B4B] font-display font-bold text-xs uppercase">
            Adivina la palabra ({wordLength} letras)
          </span>
          {wordCategory && (
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 border-2 border-[#1E1B4B] font-extrabold text-xs text-indigo-950">
              Pista: {wordCategory}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={!canUseBomb}
            onClick={() => {
              soundFX.playBomb();
              onUseBomb();
            }}
            className="arcade-btn px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#FFBE0B] text-[#1E1B4B] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Bomb className="w-4 h-4" />
            {bombUsed ? 'Bomba usada' : 'Bomba (-25% pts)'}
          </button>
          <button
            type="button"
            onClick={clearSlots}
            title="Limpiar letras"
            className="arcade-btn px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-800 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpiar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundFX.playGiveUp();
              onGiveUp();
            }}
            className="arcade-btn px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
            Rendirse
          </button>
        </div>
      </div>

      {/* Answer Slots */}
      <div
        className={`flex flex-wrap items-center justify-center gap-1 sm:gap-2.5 py-0.5 sm:py-1 ${
          wrongFlash ? 'animate-shake-x' : ''
        }`}
      >
        {placedTileIds.map((tileId, idx) => {
          const tile = tileId ? tileMap.get(tileId) : null;
          return (
            <button
              key={idx}
              type="button"
              disabled={!tile}
              onClick={() => removeSlot(idx)}
              className={`w-9 h-11 sm:w-12 sm:h-14 rounded-xl flex items-center justify-center font-display text-xl sm:text-3xl font-bold transition-all ${
                wrongFlash
                  ? 'bg-rose-400 text-white border-[3px] border-[#1E1B4B]'
                  : tile
                    ? 'scrabble-tile cursor-pointer animate-pop-in'
                    : 'bg-indigo-50 border-[3px] border-dashed border-indigo-400 text-transparent'
              }`}
            >
              {tile ? tile.letter : '_'}
            </button>
          );
        })}
        <button
          type="button"
          onClick={removeLastSlot}
          aria-label="Borrar última letra"
          className="ml-1 arcade-btn p-2 sm:p-2.5 rounded-xl bg-slate-100 text-slate-700 cursor-pointer"
        >
          <Delete className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* 12 Scrambled Scrabble Tiles */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2 max-w-3xl mx-auto">
        {tiles.map((tile) => {
          const isPlaced = usedSet.has(tile.id);
          if (tile.eliminated) {
            return (
              <div
                key={tile.id}
                className="h-11 sm:h-13 rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/60 flex items-center justify-center text-rose-300 font-display text-lg sm:text-xl line-through select-none"
              >
                {tile.letter}
              </div>
            );
          }

          if (isPlaced) {
            return (
              <div
                key={tile.id}
                className="h-11 sm:h-13 rounded-xl border-[2.5px] border-indigo-200 bg-indigo-50/70"
              />
            );
          }

          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => placeTile(tile.id)}
              className="scrabble-tile h-11 sm:h-13 rounded-xl flex items-center justify-center font-bold text-xl sm:text-2xl cursor-pointer select-none"
            >
              {tile.letter}
            </button>
          );
        })}
      </div>
    </div>
  );
};
