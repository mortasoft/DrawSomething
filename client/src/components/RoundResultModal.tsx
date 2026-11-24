import React, { useEffect, useState } from 'react';
import { ArrowRight, Bomb, Clock, Flag, PartyPopper, Trophy } from 'lucide-react';
import {
  ROUND_RESULT_AUTO_ADVANCE_SEC,
  RoomStateView,
} from '@drawsomething/shared';

interface RoundResultModalProps {
  state: RoomStateView;
  onNextRound: () => void;
}

export const RoundResultModal: React.FC<RoundResultModalProps> = ({
  state,
  onNextRound,
}) => {
  const result = state.lastRoundResult;
  const [countdown, setCountdown] = useState(ROUND_RESULT_AUTO_ADVANCE_SEC);

  useEffect(() => {
    if (!state.phaseEndsAt) return;
    const update = () => {
      const sec = Math.max(
        0,
        Math.ceil(((state.phaseEndsAt ?? 0) - Date.now()) / 1000)
      );
      setCountdown(sec);
    };
    update();
    const timer = setInterval(update, 150);
    return () => clearInterval(timer);
  }, [state.phaseEndsAt]);

  if (!result) return null;

  const drawer = state.players.find((p) => p.id === result.drawerId);
  const guesser = state.players.find((p) => p.id === result.guesserId);
  const isFinalRound = state.currentRound >= state.settings.totalRounds;

  return (
    <div className="fixed inset-0 z-40 bg-[#1E1B4B]/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="arcade-card rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 animate-pop-in">
        {/* Status Banner */}
        <div className="space-y-2">
          <div
            className={`w-16 h-16 mx-auto rounded-2xl border-[3px] border-[#1E1B4B] shadow-[0_4px_0_#1E1B4B] flex items-center justify-center ${
              result.guessed
                ? 'bg-[#06D6A0]'
                : result.gaveUp
                  ? 'bg-amber-300'
                  : 'bg-[#FF4D6D] text-white'
            }`}
          >
            {result.guessed ? (
              <PartyPopper className="w-8 h-8" />
            ) : result.gaveUp ? (
              <Flag className="w-8 h-8" />
            ) : (
              <Clock className="w-8 h-8" />
            )}
          </div>
          <h2 className="font-display text-3xl font-bold">
            {result.guessed
              ? '¡Palabra Adivinada!'
              : result.gaveUp
                ? 'Turno Rendido'
                : '¡Tiempo Agotado!'}
          </h2>
        </div>

        {/* Secret Word Reveal */}
        <div className="p-4 rounded-2xl bg-amber-50 border-[3px] border-[#1E1B4B] space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            La palabra secreta era ({result.category})
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {result.normalizedWord.split('').map((ch, idx) => (
              <span
                key={idx}
                className="scrabble-tile w-9 h-10 rounded-lg flex items-center justify-center font-bold text-xl"
              >
                {ch}
              </span>
            ))}
          </div>
        </div>

        {/* Points Breakdown */}
        {result.guessed ? (
          <div className="space-y-2 text-sm font-bold bg-indigo-50/80 p-4 rounded-2xl border-2 border-[#1E1B4B]">
            <div className="flex justify-between">
              <span>Base ({result.difficulty === 'easy' ? 'Fácil' : 'Difícil'})</span>
              <span className="font-display font-bold">+{result.basePoints}</span>
            </div>
            <div className="flex justify-between">
              <span>Bono de rapidez ({result.durationUsedSec}s)</span>
              <span className="font-display font-bold text-emerald-700">
                +{result.speedBonus}
              </span>
            </div>
            {result.bombUsed && (
              <div className="flex justify-between text-amber-700">
                <span className="flex items-center gap-1">
                  <Bomb className="w-3.5 h-3.5" /> Bomba usada
                </span>
                <span>-25%</span>
              </div>
            )}
            <div className="border-t-2 border-indigo-200 pt-2 mt-2 flex justify-between text-base">
              <span>{guesser?.nickname} (Adivinó)</span>
              <span className="font-display font-bold text-[#3A86FF]">
                +{result.guesserPoints} pts
              </span>
            </div>
            <div className="flex justify-between text-base">
              <span>{drawer?.nickname} (Dibujó)</span>
              <span className="font-display font-bold text-[#FF4D6D]">
                +{result.drawerPoints} pts
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-slate-100 border-2 border-[#1E1B4B] text-sm font-extrabold text-slate-600">
            Ningún jugador sumó puntos en esta ronda.
          </div>
        )}

        <button
          type="button"
          onClick={onNextRound}
          className="arcade-btn w-full py-3.5 rounded-2xl bg-[#FFBE0B] text-[#1E1B4B] font-display font-bold text-lg flex items-center justify-center gap-2 cursor-pointer"
        >
          {isFinalRound ? (
            <>
              <Trophy className="w-5 h-5" />
              Ver Resultados ({countdown}s)
            </>
          ) : (
            <>
              Siguiente turno ({countdown}s)
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
