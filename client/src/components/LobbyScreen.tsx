import React, { useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Crown,
  Globe,
  Link2,
  LogOut,
  Play,
  Repeat,
  UserCheck,
} from 'lucide-react';
import { RoomSettings, RoomStateView } from '@drawsomething/shared';

interface LobbyScreenProps {
  state: RoomStateView;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  state,
  onUpdateSettings,
  onStartGame,
  onLeave,
}) => {
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const me = state.players.find((p) => p.id === state.meId);
  const isHost = Boolean(me?.isHost);
  const readyToStart = state.players.length === 2;

  const copyText = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const inviteUrl = `${window.location.origin}/?room=${state.roomCode}`;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-2xl space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="font-display text-3xl font-bold text-white drop-shadow-[0_3px_0_#1E1B4B]">
            Dibuja<span className="text-[#FFBE0B]">Ya!</span>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="arcade-btn px-4 py-2 rounded-xl bg-white text-sm font-extrabold flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>

        {/* Invite Code Banner */}
        <div className="arcade-card rounded-3xl p-6 text-center space-y-4 bg-gradient-to-b from-amber-50 to-white">
          <div className="text-xs font-extrabold uppercase tracking-widest text-indigo-900">
            Código de Sala Privada
          </div>
          <div className="font-display text-5xl sm:text-6xl font-bold tracking-[0.2em] text-[#1E1B4B]">
            {state.roomCode}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => copyText(state.roomCode, 'code')}
              className="arcade-btn px-4 py-2.5 rounded-xl bg-[#FFBE0B] font-bold text-sm flex items-center gap-2 cursor-pointer"
            >
              {copiedType === 'code' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copiedType === 'code' ? '¡Código copiado!' : 'Copiar código'}
            </button>
            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="arcade-btn px-4 py-2.5 rounded-xl bg-[#3A86FF] text-white font-bold text-sm flex items-center gap-2 cursor-pointer"
            >
              {copiedType === 'link' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {copiedType === 'link'
                ? '¡Enlace copiado!'
                : 'Copiar enlace de invitación'}
            </button>
          </div>
        </div>

        {/* Players 1v1 Slots */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((slotIdx) => {
            const p = state.players[slotIdx];
            if (!p) {
              return (
                <div
                  key={slotIdx}
                  className="arcade-card-sm rounded-3xl p-5 bg-white/80 border-dashed flex items-center gap-4"
                >
                  <div className="w-14 h-14 rounded-2xl border-[3px] border-dashed border-amber-400 bg-amber-50 flex items-center justify-center text-amber-500 font-display text-2xl animate-pulse">
                    ?
                  </div>
                  <div>
                    <div className="font-display font-bold text-lg text-slate-600">
                      Esperando rival...
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      Comparte el código o enlace
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={p.id}
                className="arcade-card-sm rounded-3xl p-5 flex items-center gap-4 animate-pop-in"
              >
                <div
                  className="w-14 h-14 rounded-2xl border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B] flex items-center justify-center text-white font-display text-2xl font-bold shrink-0"
                  style={{ backgroundColor: p.avatarColor }}
                >
                  {p.nickname[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-xl truncate">
                      {p.nickname}
                    </span>
                    {p.id === state.meId && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-extrabold">
                        Tú
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-extrabold mt-1">
                    {p.isHost ? (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Crown className="w-3.5 h-3.5" /> Anfitrión
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <UserCheck className="w-3.5 h-3.5" /> Listo para jugar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Match Settings */}
        <div className="arcade-card rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">
              Configuración de la partida
            </h2>
            {!isHost && (
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-slate-100 border-2 border-[#1E1B4B]">
                Solo el anfitrión edita
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Rounds */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" /> Rondas totales
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([4, 6, 8, 10] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateSettings({ totalRounds: r })}
                    className={`py-2 rounded-xl border-[2.5px] border-[#1E1B4B] font-display font-bold text-sm transition-colors cursor-pointer ${
                      state.settings.totalRounds === r
                        ? 'bg-[#FFBE0B] text-[#1E1B4B]'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Turn Time */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Tiempo / turno
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([60, 90, 120] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateSettings({ turnDurationSec: sec })}
                    className={`py-2 rounded-xl border-[2.5px] border-[#1E1B4B] font-display font-bold text-sm transition-colors cursor-pointer ${
                      state.settings.turnDurationSec === sec
                        ? 'bg-[#2EC4B6] text-[#1E1B4B]'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Idioma palabras
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'es', label: 'Español' },
                    { id: 'en', label: 'English' },
                  ] as const
                ).map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateSettings({ language: lang.id })}
                    className={`py-2 rounded-xl border-[2.5px] border-[#1E1B4B] font-display font-bold text-sm transition-colors cursor-pointer ${
                      state.settings.language === lang.id
                        ? 'bg-[#FF4D6D] text-white'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2">
            {isHost ? (
              <button
                type="button"
                disabled={!readyToStart}
                onClick={onStartGame}
                className="arcade-btn w-full py-4 rounded-2xl bg-[#06D6A0] text-[#1E1B4B] font-display font-bold text-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-6 h-6 fill-current" />
                {readyToStart
                  ? '¡Empezar Partida!'
                  : 'Esperando al segundo jugador...'}
              </button>
            ) : (
              <div className="w-full py-3.5 rounded-2xl bg-indigo-50 border-[2.5px] border-[#1E1B4B] text-center font-extrabold text-indigo-950">
                Esperando a que {state.players[0]?.nickname} inicie la partida...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
