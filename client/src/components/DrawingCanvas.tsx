import React, { useEffect, useRef } from 'react';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ClearOperation,
  DrawOperation,
  FillOperation,
  Point,
  StrokeCommitPayload,
  StrokeOperation,
  StrokePointsPayload,
  StrokeStartPayload,
  ToolType,
  clearCanvasWhite,
  drawOperation,
  drawStrokeOperation,
  renderOperations,
} from '@drawsomething/shared';
import { socket } from '../socket';

interface DrawingCanvasProps {
  roundKey: string;
  isDrawer: boolean;
  tool: ToolType;
  color: string;
  size: number;
  stylusOnly?: boolean;
  onStylusDetected?: () => void;
  operations: DrawOperation[];
  onStrokeCommit: (op: StrokeOperation) => void;
  onFill: (op: FillOperation) => void;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createClearOp(): ClearOperation {
  return { id: createId('clear'), type: 'clear' };
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  roundKey,
  isDrawer,
  tool,
  color,
  size,
  stylusOnly = false,
  onStylusDetected,
  operations,
  onStrokeCommit,
  onFill,
}) => {
  const visibleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const renderedOpsRef = useRef<DrawOperation[]>([]);
  const localLiveOpRef = useRef<StrokeOperation | null>(null);
  const remoteLiveOpRef = useRef<StrokeOperation | null>(null);
  const pendingPointsRef = useRef<Point[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafPendingRef = useRef<boolean>(false);

  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string | null>(null);
  const strokeStartedAtRef = useRef<number>(0);
  const lastPenUpAtRef = useRef<number>(0);
  const stylusNotifiedRef = useRef<boolean>(false);

  const getOffscreen = () => {
    if (!baseCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_WIDTH;
      c.height = CANVAS_HEIGHT;
      baseCanvasRef.current = c;
      const ctx = c.getContext('2d');
      if (ctx) clearCanvasWhite(ctx);
    }
    if (!scratchCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_WIDTH;
      c.height = CANVAS_HEIGHT;
      scratchCanvasRef.current = c;
    }
    return {
      baseCanvas: baseCanvasRef.current,
      baseCtx: baseCanvasRef.current.getContext('2d'),
      scratchCanvas: scratchCanvasRef.current,
    };
  };

  const compositeVisible = () => {
    const visible = visibleCanvasRef.current;
    if (!visible) return;
    const vctx = visible.getContext('2d');
    if (!vctx) return;
    const { baseCanvas, scratchCanvas } = getOffscreen();

    vctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    vctx.drawImage(baseCanvas, 0, 0);

    const active = localLiveOpRef.current ?? remoteLiveOpRef.current;
    if (active) {
      drawStrokeOperation(vctx, active, scratchCanvas);
    }
  };

  const scheduleComposite = () => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      compositeVisible();
    });
  };

  // Reset live strokes on round change
  useEffect(() => {
    localLiveOpRef.current = null;
    remoteLiveOpRef.current = null;
    pendingPointsRef.current = [];
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, [roundKey]);

  // Sync authoritative operations from RoomStateView
  useEffect(() => {
    const { baseCtx, scratchCanvas } = getOffscreen();
    if (!baseCtx) return;

    const prev = renderedOpsRef.current;
    const isPrefix =
      prev.length <= operations.length &&
      prev.every((op, idx) => op.id === operations[idx]?.id);

    if (isPrefix) {
      for (let i = prev.length; i < operations.length; i++) {
        if (
          operations[i].type === 'clear' ||
          remoteLiveOpRef.current?.id === operations[i].id
        ) {
          remoteLiveOpRef.current = null;
        }
        drawOperation(baseCtx, operations[i], scratchCanvas);
      }
    } else {
      remoteLiveOpRef.current = null;
      renderOperations(baseCtx, operations, scratchCanvas);
    }

    renderedOpsRef.current = operations.map((op) => ({ ...op }));
    compositeVisible();
  }, [operations]);

  // Listen to live remote drawing events when watching
  useEffect(() => {
    if (isDrawer) return;

    const handleStrokeStart = (payload: StrokeStartPayload) => {
      remoteLiveOpRef.current = {
        id: payload.id,
        type: 'stroke',
        tool: payload.tool,
        color: payload.color,
        size: payload.size,
        points: [payload.point],
        seed: payload.seed,
      };
      scheduleComposite();
    };

    const handleStrokePoints = (payload: StrokePointsPayload) => {
      const live = remoteLiveOpRef.current;
      if (!live || live.id !== payload.id) return;
      live.points.push(...payload.points);
      scheduleComposite();
    };

    const handleOpCommitted = (op: DrawOperation) => {
      const { baseCtx, scratchCanvas } = getOffscreen();
      if (!baseCtx) return;

      if (remoteLiveOpRef.current?.id === op.id || op.type === 'clear') {
        remoteLiveOpRef.current = null;
      }

      if (!renderedOpsRef.current.some((existing) => existing.id === op.id)) {
        drawOperation(baseCtx, op, scratchCanvas);
        renderedOpsRef.current.push(op);
      }
      compositeVisible();
    };

    socket.on('draw:stroke_start', handleStrokeStart);
    socket.on('draw:stroke_points', handleStrokePoints);
    socket.on('draw:op_committed', handleOpCommitted);

    return () => {
      socket.off('draw:stroke_start', handleStrokeStart);
      socket.off('draw:stroke_points', handleStrokePoints);
      socket.off('draw:op_committed', handleOpCommitted);
    };
  }, [isDrawer]);

  const toLogicalPoint = (
    ev: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType' | 'pressure'>
  ): Point => {
    const canvas = visibleCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((ev.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const pt: Point = {
      x: Math.max(0, Math.min(CANVAS_WIDTH, Math.round(x * 10) / 10)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, Math.round(y * 10) / 10)),
    };
    if (ev.pointerType === 'pen' && ev.pressure > 0) {
      pt.p = Math.round(Math.max(0.12, Math.min(1, ev.pressure)) * 100) / 100;
    }
    return pt;
  };

  const flushPendingPoints = () => {
    const live = localLiveOpRef.current;
    if (!live || pendingPointsRef.current.length === 0) return;
    const batch = pendingPointsRef.current.splice(0);
    const payload: StrokePointsPayload = { id: live.id, points: batch };
    socket.emit('draw:stroke_points', payload);
  };

  const cancelLocalStroke = () => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    localLiveOpRef.current = null;
    pendingPointsRef.current = [];
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
    compositeVisible();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || e.button > 0) return;

    if (e.pointerType === 'pen' && !stylusNotifiedRef.current) {
      stylusNotifiedRef.current = true;
      onStylusDetected?.();
    }

    // Palm rejection: ignore touch when stylus-only is enabled or right after pen lift
    if (stylusOnly && e.pointerType === 'touch') return;
    if (
      e.pointerType === 'touch' &&
      Date.now() - lastPenUpAtRef.current < 400
    ) {
      return;
    }

    // Active pointer lock (or cancel accidental palm touch right before pen tip)
    if (activePointerIdRef.current !== null) {
      if (
        e.pointerType === 'pen' &&
        activePointerTypeRef.current === 'touch' &&
        Date.now() - strokeStartedAtRef.current < 150
      ) {
        cancelLocalStroke();
      } else {
        return;
      }
    }

    e.preventDefault();
    const pt = toLogicalPoint(e.nativeEvent);

    if (tool === 'fill') {
      const op: FillOperation = {
        id: createId('fill'),
        type: 'fill',
        x: Math.floor(pt.x),
        y: Math.floor(pt.y),
        color,
      };
      const { baseCtx, scratchCanvas } = getOffscreen();
      if (baseCtx) {
        drawOperation(baseCtx, op, scratchCanvas);
        renderedOpsRef.current.push(op);
        compositeVisible();
      }
      onFill(op);
      return;
    }

    activePointerIdRef.current = e.pointerId;
    activePointerTypeRef.current = e.pointerType;
    strokeStartedAtRef.current = Date.now();
    e.currentTarget.setPointerCapture(e.pointerId);

    const op: StrokeOperation = {
      id: createId('stroke'),
      type: 'stroke',
      tool,
      color,
      size,
      points: [pt],
      seed: (Math.random() * 0xffffffff) >>> 0,
    };

    localLiveOpRef.current = op;
    pendingPointsRef.current = [];
    scheduleComposite();

    const startPayload: StrokeStartPayload = {
      id: op.id,
      tool: op.tool,
      color: op.color,
      size: op.size,
      point: pt,
      seed: op.seed,
    };
    socket.emit('draw:stroke_start', startPayload);

    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(flushPendingPoints, 20);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !isDrawer ||
      !localLiveOpRef.current ||
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }

    const nativeEv = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const coalesced =
      typeof nativeEv.getCoalescedEvents === 'function'
        ? nativeEv.getCoalescedEvents()
        : [];
    const events = coalesced.length > 0 ? coalesced : [nativeEv];

    const pts = localLiveOpRef.current.points;
    let added = false;
    for (const ev of events) {
      const pt = toLogicalPoint(ev);
      const last = pts[pts.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) {
        continue;
      }
      pts.push(pt);
      pendingPointsRef.current.push(pt);
      added = true;
    }

    if (added) {
      scheduleComposite();
    }
  };

  const finishStroke = () => {
    if (!localLiveOpRef.current) return;
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushPendingPoints();

    const finished = localLiveOpRef.current;
    localLiveOpRef.current = null;
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;

    const { baseCtx, scratchCanvas } = getOffscreen();
    if (baseCtx) {
      drawOperation(baseCtx, finished, scratchCanvas);
      renderedOpsRef.current.push(finished);
      compositeVisible();
    }

    const payload: StrokeCommitPayload = { operation: finished };
    onStrokeCommit(payload.operation);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    if (e.pointerType === 'pen') {
      lastPenUpAtRef.current = Date.now();
    }
    finishStroke();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    if (e.pointerType === 'pen') {
      lastPenUpAtRef.current = Date.now();
    }
    if (
      e.pointerType === 'touch' &&
      Date.now() - strokeStartedAtRef.current < 150
    ) {
      cancelLocalStroke();
      return;
    }
    finishStroke();
  };

  return (
    <div className="relative w-full aspect-[3/2] bg-white rounded-3xl border-[3px] border-[#1E1B4B] shadow-[0_6px_0_#1E1B4B] overflow-hidden select-none touch-none">
      <canvas
        ref={visibleCanvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
        className={`w-full h-full block bg-white touch-none select-none ${
          isDrawer
            ? tool === 'fill'
              ? 'cursor-cell'
              : 'cursor-crosshair'
            : 'cursor-default'
        }`}
      />
    </div>
  );
};
