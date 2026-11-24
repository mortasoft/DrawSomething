import React, { useEffect, useRef, useState } from 'react';
import { Music, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { soundFX } from '../utils/sound';

interface AudioControlsProps {
  musicEnabled: boolean;
  musicVolume: number;
  sfxMuted: boolean;
  compact?: boolean;
  onToggleMusic: () => void;
  onChangeMusicVolume: (volume: number) => void;
  onToggleSfx: () => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  musicEnabled,
  musicVolume,
  sfxMuted,
  compact = false,
  onToggleMusic,
  onChangeMusicVolume,
  onToggleSfx,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [popoverOpen]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-1.5"
    >
      {/* Music toggle button */}
      <button
        type="button"
        onClick={() => {
          soundFX.playToggle(!musicEnabled);
          onToggleMusic();
        }}
        aria-label={musicEnabled ? 'Silenciar música' : 'Activar música'}
        title={musicEnabled ? 'Música activa (clic para apagar)' : 'Activar música'}
        className={`arcade-btn rounded-xl font-display font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer ${
          compact ? 'p-2' : 'px-3 py-1.5'
        } ${
          musicEnabled
            ? 'bg-[#FFBE0B] text-[#1E1B4B]'
            : 'bg-white text-slate-500'
        }`}
      >
        <Music className={`w-4 h-4 ${musicEnabled ? '' : 'opacity-50'}`} />
        {!compact && <span>{musicEnabled ? 'Música' : 'Sin música'}</span>}
      </button>

      {/* Inline volume slider when expanded, or compact popover button */}
      {musicEnabled && !compact && (
        <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/95 border-[2.5px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B]">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(e) => onChangeMusicVolume(Number(e.target.value))}
            aria-label="Volumen de la música"
            className="w-20 accent-[#FF4D6D] cursor-pointer"
          />
        </div>
      )}

      {musicEnabled && compact && (
        <button
          type="button"
          onClick={() => {
            soundFX.playOptionSelect();
            setPopoverOpen((prev) => !prev);
          }}
          aria-label="Volumen de la música"
          title="Ajustar volumen de la música"
          className="arcade-btn p-2 rounded-xl bg-white text-[#1E1B4B] cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      )}

      {/* SFX toggle button */}
      <button
        type="button"
        onClick={onToggleSfx}
        aria-label={sfxMuted ? 'Activar efectos de sonido' : 'Silenciar efectos'}
        title={sfxMuted ? 'Activar efectos de sonido' : 'Silenciar efectos'}
        className="arcade-btn p-2 rounded-xl bg-white cursor-pointer"
      >
        {sfxMuted ? (
          <VolumeX className="w-4 h-4 text-rose-600" />
        ) : (
          <Volume2 className="w-4 h-4 text-indigo-950" />
        )}
      </button>

      {/* Compact volume popover */}
      {popoverOpen && musicEnabled && compact && (
        <div className="absolute right-0 top-full mt-2 z-50 arcade-card-sm rounded-2xl p-3 bg-white w-48 space-y-1.5 animate-pop-in">
          <div className="flex items-center justify-between text-xs font-extrabold text-indigo-950">
            <span>Volumen música</span>
            <span>{Math.round(musicVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(e) => onChangeMusicVolume(Number(e.target.value))}
            aria-label="Volumen de la música"
            className="w-full accent-[#FF4D6D] cursor-pointer"
          />
        </div>
      )}
    </div>
  );
};
