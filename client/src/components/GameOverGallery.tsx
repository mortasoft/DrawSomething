import React, { useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Download,
  Home,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  RoomStateView,
  RoundRecord,
  renderOperations,
} from '@drawsomething/shared';

interface GalleryCardProps {
  record: RoundRecord;
  drawerName: string;
}

const GalleryCard: React.FC<GalleryCardProps> = ({ record, drawerName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderOperations(ctx, record.operations);
  }, [record]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `dibujaya-ronda-${record.roundNumber}-${record.normalizedWord.toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="arcade-card-sm rounded-3xl p-3.5 space-y-3 flex flex-col">
      <div className="relative rounded-2xl border-2 border-[#1E1B4B] overflow-hidden bg-white aspect-[3/2]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full block"
        />
        <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-[#FFBE0B] border-2 border-[#1E1B4B] font-display font-bold text-xs">
          Ronda {record.roundNumber}
        </span>
        <span
          className={`absolute top-2 right-2 px-2 py-0.5 rounded-full border-2 border-[#1E1B4B] font-extrabold text-xs flex items-center gap-1 ${
            record.guessed
              ? 'bg-[#06D6A0] text-[#1E1B4B]'
              : 'bg-rose-500 text-white'
          }`}
        >
          {record.guessed ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" /> Adivinada
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5" /> Fallada
            </>
          )}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display font-bold text-xl truncate">
            {record.word}
          </div>
          <div className="text-xs font-extrabold text-slate-500">
            Dibujó: {drawerName}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="arcade-btn px-3 py-2 rounded-xl bg-sky-100 text-[#1E1B4B] font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          PNG
        </button>
      </div>
    </div>
  );
};

interface GameOverGalleryProps {
  state: RoomStateView;
  onRematch: () => void;
  onLeave: () => void;
}

export const GameOverGallery: React.FC<GameOverGalleryProps> = ({
  state,
  onRematch,
  onLeave,
}) => {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const isTie = sorted.length === 2 && sorted[0].score === sorted[1].score;
  const winner = sorted[0];

  const getPlayerName = (id: string) =>
    state.players.find((p) => p.id === id)?.nickname ?? 'Jugador';

  return (
    <div className="min-h-screen p-4 py-8 max-w-5xl mx-auto space-y-6">
      {/* Winner Podium Card */}
      <div className="arcade-card rounded-3xl p-6 sm:p-8 text-center space-y-5 animate-pop-in bg-gradient-to-b from-amber-50 to-white">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_4px_0_#1E1B4B] flex items-center justify-center animate-float-slow">
          <Trophy className="w-10 h-10 text-[#1E1B4B]" />
        </div>

        <div className="space-y-1">
          <div className="text-xs font-extrabold uppercase tracking-widest text-indigo-900">
            Fin de la Partida
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-[#1E1B4B]">
            {isTie ? '¡Empate Épico!' : `¡Gana ${winner?.nickname}!`}
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          {sorted.map((p, idx) => (
            <div
              key={p.id}
              className={`arcade-card-sm rounded-2xl p-4 flex items-center justify-between ${
                idx === 0 && !isTie ? 'bg-[#FFF3B0]' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-xl text-slate-500">
                  #{idx + 1}
                </span>
                <div
                  className="w-10 h-10 rounded-xl border-2 border-[#1E1B4B] flex items-center justify-center text-white font-display font-bold"
                  style={{ backgroundColor: p.avatarColor }}
                >
                  {p.nickname[0]?.toUpperCase()}
                </div>
                <span className="font-display font-bold text-lg">
                  {p.nickname}
                </span>
              </div>
              <span className="font-display font-bold text-2xl text-[#3A86FF]">
                {p.score}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={state.players.length < 2}
            onClick={onRematch}
            className="arcade-btn px-6 py-3.5 rounded-2xl bg-[#06D6A0] text-[#1E1B4B] font-display font-bold text-lg flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            ¡Revancha Instantánea!
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="arcade-btn px-5 py-3.5 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-lg flex items-center gap-2 cursor-pointer"
          >
            <Home className="w-5 h-5" />
            Volver al inicio
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-3">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow-[0_3px_0_#1E1B4B]">
          Galería de Dibujos de la Partida
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.history.map((rec) => (
            <GalleryCard
              key={rec.roundNumber}
              record={rec}
              drawerName={getPlayerName(rec.drawerId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
