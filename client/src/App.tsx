import React, { useEffect, useRef, useState } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import {
  DrawOperation,
  FillOperation,
  RoomSettings,
  RoomStateView,
  StrokeOperation,
  ToolType,
} from '@drawsomething/shared';
import { emitWithAck, getPlayerToken, socket } from './socket';
import { soundFX } from './utils/sound';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameHeader } from './components/GameHeader';
import { WordPickerOverlay } from './components/WordPickerOverlay';
import { DrawingCanvas, createClearOp } from './components/DrawingCanvas';
import { ToolPalette } from './components/ToolPalette';
import { ScrabbleRack } from './components/ScrabbleRack';
import { RoundResultModal } from './components/RoundResultModal';
import { GameOverGallery } from './components/GameOverGallery';
import { AdminPage } from './components/AdminPage';

interface GameAppProps {
  onOpenAdmin: () => void;
}

function GameApp({ onOpenAdmin }: GameAppProps) {
  const [roomState, setRoomState] = useState<RoomStateView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => soundFX.isMuted());

  // Drawer local tool state
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(8);
  const [stylusOnly, setStylusOnly] = useState(
    () => localStorage.getItem('drawsomething_stylus_only') === '1'
  );
  const [stylusDetected, setStylusDetected] = useState(false);

  // Toast for wrong guess or disconnect info
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  const initialUrlRoom = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ?? '';
  })();

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const onState = (next: RoomStateView) => {
      const prevPhase = prevPhaseRef.current;
      prevPhaseRef.current = next.phase;

      if (prevPhase !== next.phase) {
        if (next.phase === 'drawing') {
          soundFX.playTurnStart();
        } else if (next.phase === 'round_end' && next.lastRoundResult?.guessed) {
          soundFX.playCorrectGuess();
        } else if (next.phase === 'game_over') {
          soundFX.playVictory();
        }
      }

      setRoomState(next);
    };

    const onWrongGuess = (payload: { guess: string }) => {
      showToast(`Intentó: ${payload.guess}`);
    };

    socket.on('room:state', onState);
    socket.on('guess:wrong', onWrongGuess);

    // Auto-rejoin if sessionStorage still holds active room + nick
    const savedRoom = sessionStorage.getItem('drawsomething_room');
    const savedNick = sessionStorage.getItem('drawsomething_nick');
    if (savedRoom && savedNick) {
      void emitWithAck('room:join', {
        roomCode: savedRoom,
        playerToken: getPlayerToken(),
        nickname: savedNick,
      }).then((res) => {
        if (!res.ok) {
          sessionStorage.removeItem('drawsomething_room');
        }
      });
    }

    return () => {
      socket.off('room:state', onState);
      socket.off('guess:wrong', onWrongGuess);
    };
  }, []);

  const handleCreateRoom = async (nickname: string, avatarColor: string) => {
    setLoading(true);
    setError(null);
    const res = await emitWithAck<{ roomCode: string }>('room:create', {
      playerToken: getPlayerToken(),
      nickname,
      avatarColor,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo crear la sala.');
      return;
    }
    if (res.data?.roomCode) {
      sessionStorage.setItem('drawsomething_room', res.data.roomCode);
      window.history.replaceState(null, '', `/?room=${res.data.roomCode}`);
    }
  };

  const handleJoinRoom = async (
    roomCode: string,
    nickname: string,
    avatarColor: string
  ) => {
    setLoading(true);
    setError(null);
    const res = await emitWithAck<{ roomCode: string }>('room:join', {
      roomCode,
      playerToken: getPlayerToken(),
      nickname,
      avatarColor,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo entrar a la sala.');
      return;
    }
    if (res.data?.roomCode) {
      sessionStorage.setItem('drawsomething_room', res.data.roomCode);
      window.history.replaceState(null, '', `/?room=${res.data.roomCode}`);
    }
  };

  const handleLeaveRoom = async () => {
    await emitWithAck('room:leave');
    sessionStorage.removeItem('drawsomething_room');
    window.history.replaceState(null, '', '/');
    prevPhaseRef.current = null;
    setRoomState(null);
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundFX.setMuted(next);
    setMuted(next);
  };

  const handleToggleStylusOnly = () => {
    const next = !stylusOnly;
    setStylusOnly(next);
    localStorage.setItem('drawsomething_stylus_only', next ? '1' : '0');
    showToast(
      next
        ? 'Modo Solo lápiz activo (rechazo de palma)'
        : 'Modo Táctil + Lápiz activo'
    );
  };

  const handleStylusDetected = () => {
    if (!stylusDetected) {
      setStylusDetected(true);
      showToast('Lápiz detectado · Presión activa');
    }
  };

  const appendLocalOperation = (op: DrawOperation) => {
    setRoomState((prev) => {
      if (!prev) return prev;
      if (prev.operations.some((existing) => existing.id === op.id)) {
        return prev;
      }
      return {
        ...prev,
        operations: [...prev.operations, op],
        canRedo: false,
      };
    });
  };

  if (!roomState) {
    return (
      <HomeScreen
        initialRoomCode={initialUrlRoom}
        loading={loading}
        error={error}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onOpenAdmin={onOpenAdmin}
      />
    );
  }

  if (roomState.phase === 'lobby') {
    return (
      <LobbyScreen
        state={roomState}
        onUpdateSettings={(s: Partial<RoomSettings>) =>
          void emitWithAck('room:update_settings', s)
        }
        onStartGame={() => void emitWithAck('game:start')}
        onLeave={handleLeaveRoom}
      />
    );
  }

  if (roomState.phase === 'game_over') {
    return (
      <GameOverGallery
        state={roomState}
        onRematch={() => void emitWithAck('game:rematch')}
        onLeave={handleLeaveRoom}
      />
    );
  }

  const isDrawer = roomState.meId === roomState.drawerId;
  const roundKey = `${roomState.roomCode}-${roomState.currentRound}`;

  return (
    <div className="min-h-[100dvh] p-2 sm:p-4 flex flex-col gap-2.5 sm:gap-3 max-w-6xl mx-auto">
      <GameHeader
        state={roomState}
        muted={muted}
        onToggleMute={handleToggleMute}
        onLeave={handleLeaveRoom}
      />

      {roomState.phase === 'choosing_word' ? (
        <div className="flex-1 flex items-center justify-center py-4">
          <WordPickerOverlay
            state={roomState}
            onPickWord={(normalized) =>
              void emitWithAck('word:pick', { normalized })
            }
            onReroll={() => void emitWithAck('word:reroll')}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          {/* Role Info Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            {isDrawer ? (
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B]">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm font-extrabold uppercase">
                  Dibuja:
                </span>
                <span className="font-display text-lg sm:text-2xl font-bold tracking-wider">
                  {roomState.currentWord?.word}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B]">
                <Eye className="w-4 h-4 text-[#3A86FF]" />
                <span className="font-display font-bold text-sm sm:text-base">
                  Observando dibujo en tiempo real...
                </span>
              </div>
            )}

            {toast && (
              <div className="px-3.5 py-1.5 rounded-xl bg-rose-500 text-white border-2 border-[#1E1B4B] font-display font-bold text-sm animate-pop-in">
                {toast}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="w-full max-w-[880px] mx-auto">
            <DrawingCanvas
              roundKey={roundKey}
              isDrawer={isDrawer}
              tool={tool}
              color={color}
              size={size}
              stylusOnly={stylusOnly}
              onStylusDetected={handleStylusDetected}
              operations={roomState.operations}
              onStrokeCommit={(op: StrokeOperation) => {
                appendLocalOperation(op);
                socket.emit('draw:stroke_commit', { operation: op });
              }}
              onFill={(op: FillOperation) => {
                appendLocalOperation(op);
                socket.emit('draw:fill', { operation: op });
              }}
            />
          </div>

          {/* Bottom Controls: ToolPalette (Drawer) or ScrabbleRack (Guesser) */}
          <div className="w-full max-w-[880px] mx-auto">
            {isDrawer ? (
              <ToolPalette
                tool={tool}
                color={color}
                size={size}
                canUndo={roomState.operations.length > 0}
                canRedo={roomState.canRedo}
                stylusOnly={stylusOnly}
                stylusDetected={stylusDetected}
                onSelectTool={setTool}
                onSelectColor={setColor}
                onSelectSize={setSize}
                onToggleStylusOnly={handleToggleStylusOnly}
                onUndo={() => socket.emit('draw:undo')}
                onRedo={() => socket.emit('draw:redo')}
                onClear={() => {
                  const op = createClearOp();
                  appendLocalOperation(op);
                  socket.emit('draw:clear', { operation: op });
                }}
              />
            ) : (
              <ScrabbleRack
                roundKey={roundKey}
                wordLength={roomState.wordLength}
                wordCategory={roomState.wordCategory}
                tiles={roomState.tiles}
                bombUsed={roomState.bombUsed}
                onSubmitGuess={async (guess) => {
                  const res = await emitWithAck<{
                    correct: boolean;
                    guess: string;
                  }>('guess:submit', { guess });
                  return Boolean(res.ok && res.data?.correct);
                }}
                onUseBomb={() => void emitWithAck('guess:use_bomb')}
                onGiveUp={() => void emitWithAck('guess:give_up')}
              />
            )}
          </div>
        </div>
      )}

      {roomState.phase === 'round_end' && (
        <RoundResultModal
          state={roomState}
          onNextRound={() => void emitWithAck('round:next')}
        />
      )}
    </div>
  );
}

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState(null, '', to);
    }
    setPathname(to);
  };

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPage onBackToGame={() => navigate('/')} />;
  }

  return <GameApp onOpenAdmin={() => navigate('/admin')} />;
}

export default App;
