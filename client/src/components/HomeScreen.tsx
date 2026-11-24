import React, { useEffect, useState } from 'react';
import { Brush, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { AVATAR_COLORS } from '@drawsomething/shared';
import { AudioControls } from './AudioControls';
import { soundFX } from '../utils/sound';

interface HomeScreenProps {
  initialRoomCode?: string;
  loading: boolean;
  error: string | null;
  onCreateRoom: (nickname: string, avatarColor: string) => void;
  onJoinRoom: (roomCode: string, nickname: string, avatarColor: string) => void;
  onOpenAdmin?: () => void;
  musicEnabled: boolean;
  musicVolume: number;
  sfxMuted: boolean;
  onToggleMusic: () => void;
  onChangeMusicVolume: (volume: number) => void;
  onToggleSfx: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  initialRoomCode = '',
  loading,
  error,
  onCreateRoom,
  onJoinRoom,
  onOpenAdmin,
  musicEnabled,
  musicVolume,
  sfxMuted,
  onToggleMusic,
  onChangeMusicVolume,
  onToggleSfx,
}) => {
  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem('drawsomething_nick') || ''
  );
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode.toUpperCase());
    }
  }, [initialRoomCode]);

  const validateNickname = (): string | null => {
    const clean = nickname.trim();
    if (clean.length < 2) {
      soundFX.playError();
      setLocalError('Escribe un apodo de al menos 2 letras.');
      return null;
    }
    setLocalError(null);
    sessionStorage.setItem('drawsomething_nick', clean);
    return clean;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = validateNickname();
    if (!clean) return;
    soundFX.playConfirm();
    onCreateRoom(clean, avatarColor);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = validateNickname();
    if (!clean) return;
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      soundFX.playError();
      setLocalError('Ingresa el código de sala válido.');
      return;
    }
    soundFX.playConfirm();
    onJoinRoom(code, clean, avatarColor);
  };

  const shownError = localError || error;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Audio Bar */}
        <div className="flex justify-end">
          <AudioControls
            musicEnabled={musicEnabled}
            musicVolume={musicVolume}
            sfxMuted={sfxMuted}
            onToggleMusic={onToggleMusic}
            onChangeMusicVolume={onChangeMusicVolume}
            onToggleSfx={onToggleSfx}
          />
        </div>

        {/* Hero Title */}
        <div className="text-center space-y-2 animate-pop-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B] text-sm font-extrabold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            Duelo 1 vs 1 en tiempo real
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white drop-shadow-[0_5px_0_#1E1B4B] tracking-tight">
            Dibuja<span className="text-[#FFBE0B]">Ya!</span>
          </h1>
          <p className="text-indigo-100 font-bold text-base sm:text-lg max-w-md mx-auto">
            Elige una de 2 palabras, dibújala en vivo y reta a tu rival a
            descifrar las letras tipo Scrabble.
          </p>
        </div>

        {/* Main Arcade Card */}
        <div className="arcade-card rounded-3xl p-6 sm:p-8 space-y-6">
          {/* Nickname & Avatar */}
          <div className="space-y-3">
            <label className="block text-sm font-extrabold uppercase tracking-wide text-indigo-950">
              Tu apodo y color
            </label>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="w-12 h-12 rounded-2xl border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B] shrink-0 flex items-center justify-center text-white font-display text-xl font-bold"
                  style={{ backgroundColor: avatarColor }}
                >
                  {(nickname.trim()[0] || '?').toUpperCase()}
                </div>
                <input
                  type="text"
                  maxLength={18}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ej. Picasso99"
                  className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#1E1B4B] bg-indigo-50/70 font-bold text-lg focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#FFBE0B]/60"
                />
              </div>
              <div className="flex items-center gap-1.5 justify-center">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => {
                      soundFX.playOptionSelect();
                      setAvatarColor(c);
                    }}
                    className={`w-8 h-8 rounded-full border-[3px] border-[#1E1B4B] transition-transform ${
                      avatarColor === c
                        ? 'scale-115 ring-3 ring-[#FFBE0B]'
                        : 'opacity-80 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {shownError && (
            <div className="p-3 rounded-2xl bg-rose-100 border-[2.5px] border-rose-600 text-rose-800 font-extrabold text-sm text-center">
              {shownError}
            </div>
          )}

          {/* Create or Join */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <form onSubmit={handleCreate} className="flex flex-col justify-between p-4 rounded-2xl bg-amber-50 border-[3px] border-[#1E1B4B] space-y-3">
              <div>
                <h2 className="font-display text-xl font-bold flex items-center gap-2">
                  <Brush className="w-5 h-5 text-[#FF4D6D]" />
                  Nueva Sala
                </h2>
                <p className="text-xs font-bold text-slate-600 mt-1">
                  Crea una partida privada y comparte el código o enlace.
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="arcade-btn w-full py-3 px-4 rounded-2xl bg-[#FFBE0B] text-[#1E1B4B] font-display font-bold text-lg cursor-pointer"
              >
                {loading ? 'Conectando...' : 'Crear Sala 1v1'}
              </button>
            </form>

            <form onSubmit={handleJoin} className="flex flex-col justify-between p-4 rounded-2xl bg-sky-50 border-[3px] border-[#1E1B4B] space-y-3">
              <div>
                <h2 className="font-display text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#3A86FF]" />
                  Unirse a Sala
                </h2>
                <input
                  type="text"
                  maxLength={8}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="CÓDIGO (ej. K7M2PX)"
                  className="mt-2 w-full px-3 py-2 rounded-xl border-[2.5px] border-[#1E1B4B] bg-white font-display font-bold text-center tracking-widest uppercase focus:outline-none focus:ring-3 focus:ring-[#3A86FF]/40"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="arcade-btn w-full py-3 px-4 rounded-2xl bg-[#2EC4B6] text-[#1E1B4B] font-display font-bold text-lg cursor-pointer"
              >
                {loading ? 'Entrando...' : 'Entrar a Jugar'}
              </button>
            </form>
          </div>
        </div>

        {/* How to play pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="arcade-card-sm rounded-2xl px-4 py-3 bg-white/95">
            <div className="font-display font-bold text-[#FF4D6D] text-sm">
              1. Elige 1 de 2
            </div>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              Fácil (+100 pts) o Difícil (+200 pts)
            </p>
          </div>
          <div className="arcade-card-sm rounded-2xl px-4 py-3 bg-white/95">
            <div className="font-display font-bold text-[#3A86FF] text-sm">
              2. Dibuja en vivo
            </div>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              5 lápices, relleno, borrador y colores
            </p>
          </div>
          <div className="arcade-card-sm rounded-2xl px-4 py-3 bg-white/95">
            <div className="font-display font-bold text-[#059669] text-sm flex items-center justify-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              3. Adivina Scrabble
            </div>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              12 fichas revueltas + bomba de ayuda
            </p>
          </div>
        </div>

        {onOpenAdmin && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => {
                soundFX.playButtonClick();
                onOpenAdmin();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white border-2 border-white/30 font-display font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFBE0B]" />
              Administrar palabras
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
