import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DrawOperation,
  Point,
  StrokeOperation,
} from './types.js';

/**
 * Deterministic PRNG so pencil & spray textures render identically on both clients.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [17, 24, 39];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hexToRgbaString(hex: string, alpha: number): string {
  const [r, g, b] = parseHexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function clearCanvasWhite(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();
}

function drawSmoothRoundPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  size: number,
  pressureRange: [number, number] = [0.35, 0.9]
): void {
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hasPressure = points.some((pt) => pt.p !== undefined);
  const [minFactor, spanFactor] = pressureRange;

  if (points.length === 1) {
    const p = points[0].p;
    const width =
      p !== undefined
        ? Math.max(1.2, size * (minFactor + spanFactor * p))
        : size;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (hasPressure) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const avgP = ((a.p ?? 0.7) + (b.p ?? 0.7)) / 2;
      ctx.lineWidth = Math.max(1.2, size * (minFactor + spanFactor * avgP));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function drawPencilStroke(
  ctx: CanvasRenderingContext2D,
  op: StrokeOperation
): void {
  const rng = mulberry32(op.seed);
  const points = op.points;
  if (points.length === 0) return;

  ctx.save();
  const radius = Math.max(0.9, op.size * 0.42);
  const stepDist = Math.max(1.2, op.size * 0.25);

  const stampDab = (x: number, y: number, pressure?: number) => {
    const p = pressure ?? 0.7;
    const hasP = pressure !== undefined;
    const rScale = hasP ? 0.55 + 0.65 * p : 1;
    const aScale = hasP ? 0.45 + 0.78 * p : 1;
    const grainCount = Math.max(2, Math.ceil(op.size * 0.45));
    for (let g = 0; g < grainCount; g++) {
      const jitterRange = Math.max(0.8, op.size * 0.35);
      const jx = x + (rng() - 0.5) * jitterRange;
      const jy = y + (rng() - 0.5) * jitterRange;
      const alpha = Math.min(0.95, (0.32 + rng() * 0.48) * aScale);
      const dabR = Math.max(0.7, radius * (0.45 + rng() * 0.55) * rScale);
      ctx.fillStyle = hexToRgbaString(op.color, alpha);
      ctx.beginPath();
      ctx.arc(jx, jy, dabR, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (points.length === 1) {
    stampDab(points[0].x, points[0].y, points[0].p);
    ctx.restore();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / stepDist));
    const hasP = p0.p !== undefined || p1.p !== undefined;
    const pr0 = p0.p ?? 0.7;
    const pr1 = p1.p ?? 0.7;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stampDab(
        p0.x + dx * t,
        p0.y + dy * t,
        hasP ? pr0 + (pr1 - pr0) * t : undefined
      );
    }
  }

  ctx.restore();
}

function drawSprayStroke(
  ctx: CanvasRenderingContext2D,
  op: StrokeOperation
): void {
  const rng = mulberry32(op.seed);
  const points = op.points;
  if (points.length === 0) return;

  ctx.save();
  ctx.fillStyle = hexToRgbaString(op.color, 0.72);
  const spread = Math.max(6, op.size * 1.45);
  const density = Math.max(10, Math.round(op.size * 1.6));
  const stepDist = Math.max(3, op.size * 0.45);

  const sprayAt = (cx: number, cy: number, pressure?: number) => {
    const pFactor = pressure !== undefined ? 0.6 + 0.65 * pressure : 1;
    const localSpread = spread * pFactor;
    const localDensity = Math.max(4, Math.round(density * pFactor));
    for (let i = 0; i < localDensity; i++) {
      const angle = rng() * Math.PI * 2;
      // Bias slightly toward the center for a realistic airbrush falloff
      const r = Math.pow(rng(), 0.75) * localSpread;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      const dotSize = 0.8 + rng() * 1.3;
      ctx.fillRect(px, py, dotSize, dotSize);
    }
  };

  if (points.length === 1) {
    sprayAt(points[0].x, points[0].y, points[0].p);
    ctx.restore();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / stepDist));
    const hasP = p0.p !== undefined || p1.p !== undefined;
    const pr0 = p0.p ?? 0.7;
    const pr1 = p1.p ?? 0.7;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      sprayAt(
        p0.x + dx * t,
        p0.y + dy * t,
        hasP ? pr0 + (pr1 - pr0) * t : undefined
      );
    }
  }
  const last = points[points.length - 1];
  sprayAt(last.x, last.y, last.p);

  ctx.restore();
}

function drawCalligraphyStroke(
  ctx: CanvasRenderingContext2D,
  op: StrokeOperation
): void {
  const points = op.points;
  if (points.length === 0) return;

  ctx.save();
  ctx.fillStyle = op.color;
  ctx.strokeStyle = op.color;
  ctx.lineWidth = 1;

  // 45-degree nib chisel vector
  const baseHalfNib = Math.max(2, op.size * 0.65);
  const angle = -Math.PI / 4;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const nibVector = (pt: Point): [number, number] => {
    const scale = pt.p !== undefined ? 0.45 + 0.85 * pt.p : 1;
    const h = baseHalfNib * scale;
    return [cosA * h, sinA * h];
  };

  const drawNibAt = (p: Point) => {
    const [nx, ny] = nibVector(p);
    ctx.beginPath();
    ctx.moveTo(p.x - nx, p.y - ny);
    ctx.lineTo(p.x + nx, p.y + ny);
    ctx.lineWidth = Math.max(1.5, op.size * 0.22);
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  if (points.length === 1) {
    drawNibAt(points[0]);
    ctx.restore();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const [ax, ay] = nibVector(a);
    const [bx, by] = nibVector(b);
    ctx.beginPath();
    ctx.moveTo(a.x - ax, a.y - ay);
    ctx.lineTo(a.x + ax, a.y + ay);
    ctx.lineTo(b.x + bx, b.y + by);
    ctx.lineTo(b.x - bx, b.y - by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function createOffscreenScratch(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  return canvas;
}

export function drawStrokeOperation(
  ctx: CanvasRenderingContext2D,
  op: StrokeOperation,
  scratchCanvas?: HTMLCanvasElement | null
): void {
  if (op.points.length === 0) return;

  switch (op.tool) {
    case 'pen':
      drawSmoothRoundPath(ctx, op.points, op.color, op.size, [0.35, 0.9]);
      break;
    case 'eraser':
      drawSmoothRoundPath(ctx, op.points, '#FFFFFF', op.size * 1.25, [0.7, 0.5]);
      break;
    case 'pencil':
      drawPencilStroke(ctx, op);
      break;
    case 'spray':
      drawSprayStroke(ctx, op);
      break;
    case 'calligraphy':
      drawCalligraphyStroke(ctx, op);
      break;
    case 'marker': {
      const scratch = scratchCanvas ?? createOffscreenScratch();
      if (!scratch) {
        drawSmoothRoundPath(
          ctx,
          op.points,
          hexToRgbaString(op.color, 0.4),
          op.size * 1.4
        );
        break;
      }
      const sctx = scratch.getContext('2d');
      if (!sctx) break;
      sctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawSmoothRoundPath(sctx, op.points, op.color, op.size * 1.45);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      break;
    }
  }
}

export function applyFloodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillHex: string
): void {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || x0 >= CANVAS_WIDTH || y0 < 0 || y0 >= CANVAS_HEIGHT) return;

  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = imageData.data;
  const [fillR, fillG, fillB] = parseHexToRgb(fillHex);

  const startIdx = (y0 * CANVAS_WIDTH + x0) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  // Guard: clicking on essentially the same color is a no-op
  if (
    Math.abs(targetR - fillR) <= 4 &&
    Math.abs(targetG - fillG) <= 4 &&
    Math.abs(targetB - fillB) <= 4 &&
    targetA >= 250
  ) {
    return;
  }

  const tolerance = 32;
  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);

  const matchesTarget = (pixelIndex: number): boolean => {
    if (visited[pixelIndex]) return false;
    const i = pixelIndex * 4;
    return (
      Math.abs(data[i] - targetR) <= tolerance &&
      Math.abs(data[i + 1] - targetG) <= tolerance &&
      Math.abs(data[i + 2] - targetB) <= tolerance &&
      Math.abs(data[i + 3] - targetA) <= tolerance
    );
  };

  const setPixel = (pixelIndex: number) => {
    visited[pixelIndex] = 1;
    const i = pixelIndex * 4;
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = 255;
  };

  const stack: number[] = [x0, y0];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    let lx = x;
    while (lx >= 0 && matchesTarget(y * CANVAS_WIDTH + lx)) {
      lx--;
    }
    lx++;

    let rx = x;
    while (rx < CANVAS_WIDTH && matchesTarget(y * CANVAS_WIDTH + rx)) {
      rx++;
    }
    rx--;

    if (lx > rx) continue;

    let spanAbove = false;
    let spanBelow = false;

    for (let cx = lx; cx <= rx; cx++) {
      const idx = y * CANVAS_WIDTH + cx;
      setPixel(idx);

      if (y > 0) {
        const aboveMatches = matchesTarget((y - 1) * CANVAS_WIDTH + cx);
        if (!spanAbove && aboveMatches) {
          stack.push(cx, y - 1);
          spanAbove = true;
        } else if (spanAbove && !aboveMatches) {
          spanAbove = false;
        }
      }

      if (y < CANVAS_HEIGHT - 1) {
        const belowMatches = matchesTarget((y + 1) * CANVAS_WIDTH + cx);
        if (!spanBelow && belowMatches) {
          stack.push(cx, y + 1);
          spanBelow = true;
        } else if (spanBelow && !belowMatches) {
          spanBelow = false;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawOperation(
  ctx: CanvasRenderingContext2D,
  op: DrawOperation,
  scratchCanvas?: HTMLCanvasElement | null
): void {
  if (op.type === 'clear') {
    clearCanvasWhite(ctx);
  } else if (op.type === 'fill') {
    applyFloodFill(ctx, op.x, op.y, op.color);
  } else {
    drawStrokeOperation(ctx, op, scratchCanvas);
  }
}

export function renderOperations(
  ctx: CanvasRenderingContext2D,
  operations: DrawOperation[],
  scratchCanvas?: HTMLCanvasElement | null
): void {
  clearCanvasWhite(ctx);
  for (const op of operations) {
    drawOperation(ctx, op, scratchCanvas);
  }
}
