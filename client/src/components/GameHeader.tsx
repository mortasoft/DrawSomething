import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Palette, Puzzle, Volume2, VolumeX } from 'lucide-react';
import { RoomStateView, WORD_PICK_DURATION_SEC } from '@drawsomething/shared';
import { soundFX } from '../utils/sound';

interface GameHeaderProps {
  state: RoomStateView;
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  state,
  muted,
  onToggleMute,
  onLeave,
}) => {
  const [remainingMs, setRemainingMs] = useState(0);
  const lastTickSecRef = useRef<number | null>(null);

  useEffect(() => {
    lastTickSecRef.current = null;
    if (!state.phaseEndsAt) {
      setRemainingMs(0);
      return;
    }

    const update = () => {
      const rem = Math.max(0, (state.phaseEndsAt ?? 0) - Date.now());
      setRemainingMs(rem);

      if (state.phase === 'drawing') {
        const sec = Math.ceil(rem / 1000);
        if (sec > 0 && sec <= 10 && lastTickSecRef.current !== sec) {
          lastTickSecRef.current = sec;
          soundFX.playTick();
        }
      }
    };

    update();
    const timer = setInterval(update, 120);
    return () => clearInterval(timer);
  }, [state.phaseEndsAt, state.phase, state.currentRound]);

  const totalSec =
    state.phase === 'choosing_word'
      ? WORD_PICK_DURATION_SEC
      : state.settings.turnDurationSec;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const pct = Math.min(100, Math.max(0, (remainingMs / (totalSec * 1000)) * 100));

  const barColor =
    pct > 50 ? 'bg-[#06D6A0]' : pct > 20 ? 'bg-[#FFBE0B]' : 'bg-[#FF4D6D]';
  const isUrgent = state.phase === 'drawing' && remainingSec > 0 && remainingSec <= 10;

  return (
    <header className="w-full max-w-6xl mx-auto arcade-card-sm rounded-2xl px-3 py-2.5 sm:px-5 sm:py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Brand + Round */}
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xl sm:text-2xl font-bold text-[#1E1B4B]">
            Dibuja<span className="text-[#FF4D6D]">Ya!</span>
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#FFBE0B] border-2 border-[#1E1B4B] font-display font-bold text-xs sm:text-sm">
            Ronda {state.currentRound}/{state.settings.totalRounds}
          </span>
          {state.phase === 'drawing' && state.wordCategory && (
            <span className="hidden md:inline-flex px-2.5 py-1 rounded-xl bg-indigo-100 border-2 border-[#1E1B4B] font-extrabold text-xs text-indigo-950">
              {state.wordCategory}
            </span>
          )}
        </div>

        {/* Players Score Pills */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {state.players.map((p) => {
            const isDrawer = p.id === state.drawerId;
            const isGuesser = p.id === state.guesserId;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border-2 border-[#1E1B4B] ${
                  p.id === state.meId ? 'bg-amber-50' : 'bg-slate-50'
                } ${!p.connected ? 'opacity-60' : ''}`}
              >
                <div
                  className="w-7 h-7 rounded-lg border-2 border-[#1E1B4B] flex items-center justify-center text-white font-display font-bold text-xs"
                  style={{ backgroundColor: p.avatarColor }}
                >
                  {p.nickname[0]?.toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-1 text-xs font-extrabold">
                    <span className="max-w-[85px] truncate">{p.nickname}</span>
                    {isDrawer && (
                      <Palette className="w-3.5 h-3.5 text-[#FF4D6D]" aria-label="Dibujante" />
                    )}
                    {isGuesser && (
                      <Puzzle className="w-3.5 h-3.5 text-[#3A86FF]" aria-label="Adivina" />
                    )}
                  </div>
                  <div className="font-display font-bold text-xs text-indigo-950">
                    {p.score} pts
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Timer + Controls */}
        <div className="flex items-center gap-2">
          {state.phaseEndsAt && (
            <div
              className={`min-w-[54px] text-center px-2.5 py-1 rounded-xl border-2 border-[#1E1B4B] font-display font-bold text-sm sm:text-base ${
                isUrgent
                  ? 'bg-[#FF4D6D] text-white animate-pulse'
                  : 'bg-white text-[#1E1B4B]'
              }`}
            >
              {remainingSec}s
            </div>
          )}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            className="arcade-btn p-2 rounded-xl bg-white cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-600" />
            ) : (
              <Volume2 className="w-4 h-4 text-indigo-950" />
            )}
          </button>
          <button
            type="button"
            onClick={onLeave}
            aria-label="Salir de la partida"
            className="arcade-btn p-2 rounded-xl bg-rose-100 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-700" />
          </button>
        </div>
      </div>

      {/* Countdown Progress Bar */}
      {state.phaseEndsAt && (
        <div className="w-full h-2.5 rounded-full bg-slate-200 border-2 border-[#1E1B4B] overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </header>
  );
};
