import React, { useEffect } from 'react';
import {
  Brush,
  Eraser,
  Feather,
  Hand,
  Highlighter,
  PaintBucket,
  PenTool,
  Pencil,
  Redo2,
  SprayCan,
  Trash2,
  Undo2,
} from 'lucide-react';
import { PRESET_PALETTE, ToolType } from '@drawsomething/shared';

interface ToolPaletteProps {
  tool: ToolType;
  color: string;
  size: number;
  canUndo: boolean;
  canRedo: boolean;
  stylusOnly: boolean;
  stylusDetected: boolean;
  onSelectTool: (tool: ToolType) => void;
  onSelectColor: (color: string) => void;
  onSelectSize: (size: number) => void;
  onToggleStylusOnly: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const TOOLS: {
  id: ToolType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'pencil', label: 'Lápiz', icon: Pencil },
  { id: 'pen', label: 'Pluma', icon: PenTool },
  { id: 'marker', label: 'Plumón', icon: Highlighter },
  { id: 'spray', label: 'Spray', icon: SprayCan },
  { id: 'calligraphy', label: 'Caligráfico', icon: Feather },
  { id: 'eraser', label: 'Borrador', icon: Eraser },
  { id: 'fill', label: 'Relleno', icon: PaintBucket },
];

const QUICK_SIZES = [4, 10, 18, 28];

export const ToolPalette: React.FC<ToolPaletteProps> = ({
  tool,
  color,
  size,
  canUndo,
  canRedo,
  stylusOnly,
  stylusDetected,
  onSelectTool,
  onSelectColor,
  onSelectSize,
  onToggleStylusOnly,
  onUndo,
  onRedo,
  onClear,
}) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) onUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (canRedo) onRedo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canUndo, canRedo, onUndo, onRedo]);

  return (
    <div className="arcade-card-sm rounded-3xl p-2.5 sm:p-4 space-y-2.5 sm:space-y-3">
      {/* Row 1: 7 Tools + History Actions */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTool(t.id)}
                title={t.label}
                className={`arcade-btn px-2.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#FFBE0B] text-[#1E1B4B]'
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1.5">
          <button
            type="button"
            onClick={onToggleStylusOnly}
            title="Solo lápiz (rechazo de palma para tablet)"
            aria-pressed={stylusOnly}
            className={`arcade-btn px-2.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1 shrink-0 cursor-pointer ${
              stylusOnly
                ? 'bg-[#06D6A0] text-[#1E1B4B]'
                : stylusDetected
                  ? 'bg-amber-100 text-[#1E1B4B]'
                  : 'bg-slate-50 text-slate-700'
            }`}
          >
            <Hand className="w-4 h-4" />
            <span>{stylusOnly ? 'Solo lápiz' : 'Táctil + Lápiz'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Deshacer (Ctrl+Z)"
              className="arcade-btn px-2.5 py-2 rounded-xl bg-sky-100 text-[#1E1B4B] font-extrabold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
              <span className="hidden md:inline">Deshacer</span>
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Rehacer (Ctrl+Y)"
              className="arcade-btn px-2.5 py-2 rounded-xl bg-sky-100 text-[#1E1B4B] font-extrabold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
              <span className="hidden md:inline">Rehacer</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              title="Limpiar lienzo"
              className="arcade-btn px-2.5 py-2 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden md:inline">Limpiar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Colors & Stroke Size */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 pt-1.5 border-t-2 border-slate-100">
        {/* Preset Colors + Custom Picker */}
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {PRESET_PALETTE.map((c) => {
            const active = color.toUpperCase() === c.toUpperCase() && tool !== 'eraser';
            return (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => {
                  onSelectColor(c);
                  if (tool === 'eraser') onSelectTool('pen');
                }}
                className={`w-7 h-7 rounded-full border-[2.5px] border-[#1E1B4B] transition-transform shrink-0 cursor-pointer ${
                  active ? 'scale-115 ring-3 ring-[#FFBE0B]' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            );
          })}

          <label
            title="Color personalizado"
            className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border-[2.5px] border-[#1E1B4B] bg-slate-50 shrink-0 cursor-pointer text-xs font-extrabold"
          >
            <Brush className="w-3.5 h-3.5" />
            <input
              type="color"
              value={color}
              onChange={(e) => {
                onSelectColor(e.target.value);
                if (tool === 'eraser') onSelectTool('pen');
              }}
              className="w-5 h-5 border-0 bg-transparent p-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Size Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="flex items-center gap-1.5">
            {QUICK_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSelectSize(s)}
                aria-label={`Grosor ${s}px`}
                className={`w-8 h-8 rounded-xl border-2 border-[#1E1B4B] flex items-center justify-center cursor-pointer ${
                  size === s ? 'bg-[#FFBE0B]' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <span
                  className="rounded-full bg-[#1E1B4B] block"
                  style={{
                    width: Math.max(4, Math.min(20, s * 0.7)),
                    height: Math.max(4, Math.min(20, s * 0.7)),
                  }}
                />
              </button>
            ))}
          </div>
          <input
            type="range"
            min={2}
            max={36}
            value={size}
            onChange={(e) => onSelectSize(Number(e.target.value))}
            className="w-24 accent-[#FF4D6D] cursor-pointer"
          />
          <span className="font-display font-bold text-xs w-9 text-right">
            {size}px
          </span>
        </div>
      </div>
    </div>
  );
};
