import React from 'react';
import { Brush, RefreshCw, Sparkles, Star } from 'lucide-react';
import { RoomStateView } from '@drawsomething/shared';

interface WordPickerOverlayProps {
  state: RoomStateView;
  onPickWord: (normalized: string) => void;
  onReroll: () => void;
}

export const WordPickerOverlay: React.FC<WordPickerOverlayProps> = ({
  state,
  onPickWord,
  onReroll,
}) => {
  const isDrawer = state.meId === state.drawerId;
  const drawer = state.players.find((p) => p.id === state.drawerId);

  if (!isDrawer) {
    return (
      <div className="arcade-card rounded-3xl p-8 sm:p-12 max-w-lg w-full mx-auto text-center space-y-5 animate-pop-in">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_4px_0_#1E1B4B] flex items-center justify-center animate-float-slow">
          <Brush className="w-10 h-10 text-[#1E1B4B]" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">
            ¡Prepárate para adivinar!
          </h2>
          <p className="font-bold text-slate-600 text-base">
            <span className="text-[#FF4D6D] font-extrabold">
              {drawer?.nickname ?? 'Tu rival'}
            </span>{' '}
            está eligiendo entre 2 palabras para dibujar...
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border-2 border-[#1E1B4B] text-xs font-extrabold text-indigo-950">
          Usa el mouse o tu teclado físico cuando aparezcan las fichas
        </div>
      </div>
    );
  }

  const choices = state.wordChoices ?? [];

  return (
    <div className="arcade-card rounded-3xl p-6 sm:p-8 max-w-2xl w-full mx-auto space-y-6 animate-pop-in">
      <div className="text-center space-y-1.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4D6D] text-white border-2 border-[#1E1B4B] text-xs font-extrabold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Tu turno de dibujar
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold">
          Elige una palabra para dibujar
        </h2>
        <p className="text-sm font-bold text-slate-600">
          Las palabras difíciles otorgan el doble de puntos base.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {choices.map((entry) => {
          const isEasy = entry.difficulty === 'easy';
          return (
            <button
              key={entry.normalized}
              type="button"
              onClick={() => onPickWord(entry.normalized)}
              className={`arcade-btn rounded-3xl p-5 text-left flex flex-col justify-between gap-4 cursor-pointer ${
                isEasy
                  ? 'bg-gradient-to-b from-emerald-50 to-white'
                  : 'bg-gradient-to-b from-amber-50 to-white'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`px-3 py-1 rounded-full border-2 border-[#1E1B4B] font-display font-bold text-xs uppercase ${
                    isEasy
                      ? 'bg-[#06D6A0] text-[#1E1B4B]'
                      : 'bg-[#8338EC] text-white'
                  }`}
                >
                  {isEasy ? 'Fácil' : 'Difícil'}
                </span>
                <span className="inline-flex items-center gap-1 font-display font-bold text-base text-amber-600">
                  <Star className="w-4 h-4 fill-amber-400 text-[#1E1B4B]" />+
                  {entry.points} pts
                </span>
              </div>

              <div className="py-2 text-center">
                <div className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-[#1E1B4B]">
                  {entry.word}
                </div>
                <div className="text-xs font-extrabold text-slate-500 mt-1 uppercase tracking-wider">
                  {entry.category} · {entry.normalized.length} letras
                </div>
              </div>

              <div className="w-full py-2 rounded-xl bg-[#1E1B4B] text-white font-display font-bold text-center text-sm">
                Dibujar esta palabra
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={state.rerollUsed}
          onClick={onReroll}
          className="arcade-btn px-5 py-2.5 rounded-2xl bg-indigo-100 text-[#1E1B4B] font-bold text-sm flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          {state.rerollUsed
            ? 'Cambio de palabras usado'
            : 'Cambiar palabras (1 por turno)'}
        </button>
      </div>
    </div>
  );
};
