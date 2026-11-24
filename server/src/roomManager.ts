import {
  AVATAR_COLORS,
  ClearOperation,
  DrawOperation,
  FillOperation,
  PlayerInfo,
  ROUND_RESULT_AUTO_ADVANCE_SEC,
  RoomPhase,
  RoomSettings,
  RoomStateView,
  RoundRecord,
  ScrabbleTile,
  StrokeOperation,
  WORD_PICK_DURATION_SEC,
  WordEntry,
  generateScrabbleTiles,
  normalizeWord,
  pickWordPair,
  shuffleArray,
} from '@drawsomething/shared';
import type { WordStore } from './wordStore.js';

interface InternalPlayer extends PlayerInfo {
  token: string;
}

interface InternalRoom {
  roomCode: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: InternalPlayer[];
  currentRound: number;
  drawerId: string | null;
  guesserId: string | null;
  phaseEndsAt: number | null;
  roundStartedAt: number | null;
  wordChoices: WordEntry[] | null;
  rerollUsed: boolean;
  currentWord: WordEntry | null;
  tiles: ScrabbleTile[];
  bombUsed: boolean;
  lastWrongGuess: string | null;
  operations: DrawOperation[];
  redoStack: DrawOperation[];
  usedWords: Set<string>;
  lastRoundResult: RoundRecord | null;
  history: RoundRecord[];
  phaseTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  lastActivityAt: number;
}

export interface RoomManagerOptions {
  wordPickDurationMs?: number;
  roundAutoAdvanceMs?: number;
  roomCleanupGraceMs?: number;
  wordStore?: WordStore;
  onRoomUpdated?: (roomCode: string) => void;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function sanitizeNickname(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 18) || 'Jugador';
}

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private readonly wordPickDurationMs: number;
  private readonly roundAutoAdvanceMs: number;
  private readonly roomCleanupGraceMs: number;
  private readonly wordStore?: WordStore;
  private readonly onRoomUpdated?: (roomCode: string) => void;

  constructor(options: RoomManagerOptions = {}) {
    this.wordPickDurationMs =
      options.wordPickDurationMs ?? WORD_PICK_DURATION_SEC * 1000;
    this.roundAutoAdvanceMs =
      options.roundAutoAdvanceMs ?? ROUND_RESULT_AUTO_ADVANCE_SEC * 1000;
    this.roomCleanupGraceMs = options.roomCleanupGraceMs ?? 10 * 60 * 1000;
    this.wordStore = options.wordStore;
    this.onRoomUpdated = options.onRoomUpdated;
  }

  private clearPhaseTimer(room: InternalRoom): void {
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
  }

  private clearCleanupTimer(room: InternalRoom): void {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = createRoomCode();
      if (!this.rooms.has(code)) return code;
    }
    return createRoomCode() + String(Date.now()).slice(-2);
  }

  private findPlayer(
    room: InternalRoom,
    playerToken: string
  ): InternalPlayer | undefined {
    return room.players.find((p) => p.token === playerToken);
  }

  private notify(roomCode: string): void {
    this.onRoomUpdated?.(roomCode);
  }

  public dispose(): void {
    for (const room of this.rooms.values()) {
      this.clearPhaseTimer(room);
      this.clearCleanupTimer(room);
    }
    this.rooms.clear();
  }

  public getRoomPlayerTokens(roomCode: string): string[] {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return [];
    return room.players.map((p) => p.token);
  }

  public createRoom(
    playerToken: string,
    nickname: string,
    avatarColor?: string
  ): { roomCode: string } {
    const roomCode = this.generateUniqueCode();
    const color =
      avatarColor && AVATAR_COLORS.includes(avatarColor as (typeof AVATAR_COLORS)[number])
        ? avatarColor
        : AVATAR_COLORS[0];

    const host: InternalPlayer = {
      id: playerToken,
      token: playerToken,
      nickname: sanitizeNickname(nickname),
      avatarColor: color,
      score: 0,
      connected: true,
      isHost: true,
    };

    const room: InternalRoom = {
      roomCode,
      phase: 'lobby',
      settings: {
        totalRounds: 6,
        turnDurationSec: 90,
        language: 'es',
      },
      players: [host],
      currentRound: 0,
      drawerId: null,
      guesserId: null,
      phaseEndsAt: null,
      roundStartedAt: null,
      wordChoices: null,
      rerollUsed: false,
      currentWord: null,
      tiles: [],
      bombUsed: false,
      lastWrongGuess: null,
      operations: [],
      redoStack: [],
      usedWords: new Set(),
      lastRoundResult: null,
      history: [],
      phaseTimer: null,
      cleanupTimer: null,
      lastActivityAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    return { roomCode };
  }

  public joinRoom(
    rawRoomCode: string,
    playerToken: string,
    nickname: string,
    avatarColor?: string
  ): { ok: true; roomCode: string; reconnected: boolean } | { ok: false; error: string } {
    const roomCode = rawRoomCode.trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: 'Sala no encontrada. Verifica el código.' };
    }

    room.lastActivityAt = Date.now();
    this.clearCleanupTimer(room);

    const existing = this.findPlayer(room, playerToken);
    if (existing) {
      existing.connected = true;
      if (room.phase === 'lobby' && nickname.trim()) {
        existing.nickname = sanitizeNickname(nickname);
        if (avatarColor) existing.avatarColor = avatarColor;
      }
      return { ok: true, roomCode, reconnected: true };
    }

    if (room.players.length >= 2) {
      return { ok: false, error: 'La sala ya está llena (máximo 2 jugadores).' };
    }

    const usedColor = room.players[0]?.avatarColor;
    const fallbackColor =
      AVATAR_COLORS.find((c) => c !== usedColor) ?? AVATAR_COLORS[1];
    const chosenColor =
      avatarColor && avatarColor !== usedColor ? avatarColor : fallbackColor;

    room.players.push({
      id: playerToken,
      token: playerToken,
      nickname: sanitizeNickname(nickname),
      avatarColor: chosenColor,
      score: 0,
      connected: true,
      isHost: false,
    });

    return { ok: true, roomCode, reconnected: false };
  }

  public markDisconnected(roomCode: string, playerToken: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = this.findPlayer(room, playerToken);
    if (!player) return;
    player.connected = false;

    const anyoneConnected = room.players.some((p) => p.connected);
    if (!anyoneConnected) {
      this.clearCleanupTimer(room);
      room.cleanupTimer = setTimeout(() => {
        const latest = this.rooms.get(roomCode);
        if (latest && !latest.players.some((p) => p.connected)) {
          this.clearPhaseTimer(latest);
          this.rooms.delete(roomCode);
        }
      }, this.roomCleanupGraceMs);
    }
  }

  public leaveRoom(roomCode: string, playerToken: string): { deleted: boolean } {
    const room = this.rooms.get(roomCode);
    if (!room) return { deleted: true };

    const idx = room.players.findIndex((p) => p.token === playerToken);
    if (idx === -1) return { deleted: false };

    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      this.clearPhaseTimer(room);
      this.clearCleanupTimer(room);
      this.rooms.delete(roomCode);
      return { deleted: true };
    }

    room.players[0].isHost = true;

    if (room.phase !== 'lobby') {
      this.clearPhaseTimer(room);
      room.phase = 'lobby';
      room.currentRound = 0;
      room.drawerId = null;
      room.guesserId = null;
      room.phaseEndsAt = null;
      room.roundStartedAt = null;
      room.wordChoices = null;
      room.currentWord = null;
      room.tiles = [];
      room.operations = [];
      room.redoStack = [];
      room.lastRoundResult = null;
      room.players[0].score = 0;
    }

    return { deleted: false };
  }

  public updateSettings(
    roomCode: string,
    playerToken: string,
    partial: Partial<RoomSettings>
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };

    const player = this.findPlayer(room, playerToken);
    if (!player?.isHost) {
      return { ok: false, error: 'Solo el anfitrión puede cambiar los ajustes.' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'No puedes cambiar ajustes durante la partida.' };
    }

    if (
      partial.totalRounds &&
      ([4, 6, 8, 10] as const).includes(partial.totalRounds)
    ) {
      room.settings.totalRounds = partial.totalRounds;
    }
    if (
      partial.turnDurationSec &&
      ([60, 90, 120] as const).includes(partial.turnDurationSec)
    ) {
      room.settings.turnDurationSec = partial.turnDurationSec;
    }
    if (partial.language && (partial.language === 'es' || partial.language === 'en')) {
      room.settings.language = partial.language;
    }

    room.lastActivityAt = Date.now();
    return { ok: true };
  }

  public startGame(
    roomCode: string,
    playerToken: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };

    const player = this.findPlayer(room, playerToken);
    if (!player?.isHost) {
      return { ok: false, error: 'Solo el anfitrión puede iniciar la partida.' };
    }
    if (room.players.length < 2) {
      return { ok: false, error: 'Se necesitan 2 jugadores para empezar.' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'La partida ya está en curso.' };
    }

    this.resetMatchState(room);
    this.beginChoosingWord(room);
    return { ok: true };
  }

  public rematch(
    roomCode: string,
    playerToken: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (!this.findPlayer(room, playerToken)) {
      return { ok: false, error: 'No perteneces a esta sala.' };
    }
    if (room.players.length < 2) {
      return { ok: false, error: 'Se necesitan 2 jugadores para la revancha.' };
    }
    if (room.phase !== 'game_over') {
      return { ok: false, error: 'La partida aún no ha terminado.' };
    }

    this.resetMatchState(room);
    this.beginChoosingWord(room);
    return { ok: true };
  }

  private resetMatchState(room: InternalRoom): void {
    this.clearPhaseTimer(room);
    for (const p of room.players) {
      p.score = 0;
    }
    room.currentRound = 1;
    room.drawerId = room.players[0].id;
    room.guesserId = room.players[1].id;
    room.usedWords = new Set();
    room.history = [];
    room.lastRoundResult = null;
  }

  private beginChoosingWord(room: InternalRoom): void {
    this.clearPhaseTimer(room);
    room.phase = 'choosing_word';
    const pair = pickWordPair(
      room.settings.language,
      room.usedWords,
      Math.random,
      this.wordStore?.getBank()
    );
    room.wordChoices = pair;
    room.rerollUsed = false;
    room.currentWord = null;
    room.tiles = [];
    room.bombUsed = false;
    room.lastWrongGuess = null;
    room.operations = [];
    room.redoStack = [];
    room.lastRoundResult = null;
    room.roundStartedAt = null;
    room.phaseEndsAt = Date.now() + this.wordPickDurationMs;
    room.lastActivityAt = Date.now();

    room.phaseTimer = setTimeout(() => {
      if (room.phase === 'choosing_word' && room.wordChoices?.[0] && room.drawerId) {
        this.pickWord(room.roomCode, room.drawerId, room.wordChoices[0].normalized);
        this.notify(room.roomCode);
      }
    }, this.wordPickDurationMs);
  }

  public rerollWords(
    roomCode: string,
    playerToken: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'choosing_word') {
      return { ok: false, error: 'No estás eligiendo palabra.' };
    }
    if (room.drawerId !== playerToken) {
      return { ok: false, error: 'Solo el dibujante puede cambiar palabras.' };
    }
    if (room.rerollUsed) {
      return { ok: false, error: 'Ya usaste el cambio de palabras en este turno.' };
    }

    const tempUsed = new Set(room.usedWords);
    for (const w of room.wordChoices ?? []) {
      tempUsed.add(w.normalized);
    }

    room.wordChoices = pickWordPair(
      room.settings.language,
      tempUsed,
      Math.random,
      this.wordStore?.getBank()
    );
    room.rerollUsed = true;
    room.lastActivityAt = Date.now();
    return { ok: true };
  }

  public pickWord(
    roomCode: string,
    playerToken: string,
    normalizedChoice: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'choosing_word') {
      return { ok: false, error: 'El turno ya comenzó.' };
    }
    if (room.drawerId !== playerToken) {
      return { ok: false, error: 'Solo el dibujante puede elegir la palabra.' };
    }

    const target = normalizeWord(normalizedChoice);
    const selected = room.wordChoices?.find((w) => w.normalized === target);
    if (!selected) {
      return { ok: false, error: 'Palabra inválida.' };
    }

    this.clearPhaseTimer(room);
    room.currentWord = selected;
    room.usedWords.add(selected.normalized);
    room.wordChoices = null;
    room.tiles = generateScrabbleTiles(
      selected.normalized,
      room.settings.language
    );
    room.phase = 'drawing';
    room.roundStartedAt = Date.now();
    const durationMs = room.settings.turnDurationSec * 1000;
    room.phaseEndsAt = Date.now() + durationMs;
    room.lastActivityAt = Date.now();

    room.phaseTimer = setTimeout(() => {
      if (room.phase === 'drawing') {
        this.finishRound(room, false, false);
        this.notify(room.roomCode);
      }
    }, durationMs);

    return { ok: true };
  }

  public isActiveDrawer(roomCode: string, playerToken: string): boolean {
    const room = this.rooms.get(roomCode);
    return Boolean(
      room && room.phase === 'drawing' && room.drawerId === playerToken
    );
  }

  public commitOperation(
    roomCode: string,
    playerToken: string,
    op: StrokeOperation | FillOperation | ClearOperation
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.drawerId !== playerToken) {
      return { ok: false, error: 'No tienes permiso para dibujar ahora.' };
    }

    room.operations.push(op);
    room.redoStack = [];
    room.lastActivityAt = Date.now();
    return { ok: true };
  }

  public undo(
    roomCode: string,
    playerToken: string
  ): { ok: true; operations: DrawOperation[]; canRedo: boolean } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.drawerId !== playerToken) {
      return { ok: false, error: 'Solo el dibujante puede deshacer.' };
    }

    const popped = room.operations.pop();
    if (popped) {
      room.redoStack.push(popped);
    }
    room.lastActivityAt = Date.now();
    return {
      ok: true,
      operations: room.operations,
      canRedo: room.redoStack.length > 0,
    };
  }

  public redo(
    roomCode: string,
    playerToken: string
  ): { ok: true; operations: DrawOperation[]; canRedo: boolean } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.drawerId !== playerToken) {
      return { ok: false, error: 'Solo el dibujante puede rehacer.' };
    }

    const restored = room.redoStack.pop();
    if (restored) {
      room.operations.push(restored);
    }
    room.lastActivityAt = Date.now();
    return {
      ok: true,
      operations: room.operations,
      canRedo: room.redoStack.length > 0,
    };
  }

  public useBomb(
    roomCode: string,
    playerToken: string
  ): { ok: true; tiles: ScrabbleTile[] } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.guesserId !== playerToken) {
      return { ok: false, error: 'Solo quien adivina puede usar la bomba.' };
    }
    if (room.bombUsed || !room.currentWord) {
      return { ok: false, error: 'La bomba ya fue usada en este turno.' };
    }

    const requiredCounts = new Map<string, number>();
    for (const ch of room.currentWord.normalized) {
      requiredCounts.set(ch, (requiredCounts.get(ch) ?? 0) + 1);
    }

    const distractorIndices: number[] = [];
    room.tiles.forEach((tile, idx) => {
      const rem = requiredCounts.get(tile.letter) ?? 0;
      if (rem > 0) {
        requiredCounts.set(tile.letter, rem - 1);
      } else {
        distractorIndices.push(idx);
      }
    });

    const toEliminate = shuffleArray(distractorIndices).slice(0, 4);
    for (const idx of toEliminate) {
      room.tiles[idx] = { ...room.tiles[idx], eliminated: true };
    }

    room.bombUsed = true;
    room.lastActivityAt = Date.now();
    return { ok: true, tiles: room.tiles };
  }

  public submitGuess(
    roomCode: string,
    playerToken: string,
    rawGuess: string
  ):
    | { ok: true; correct: boolean; normalizedGuess: string }
    | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.guesserId !== playerToken) {
      return { ok: false, error: 'No puedes adivinar en este momento.' };
    }
    if (!room.currentWord) {
      return { ok: false, error: 'No hay palabra activa.' };
    }

    const normalizedGuess = normalizeWord(rawGuess);
    if (!normalizedGuess) {
      return { ok: false, error: 'Ingresa una palabra válida.' };
    }

    room.lastActivityAt = Date.now();

    if (normalizedGuess === room.currentWord.normalized) {
      this.finishRound(room, true, false);
      return { ok: true, correct: true, normalizedGuess };
    }

    room.lastWrongGuess = normalizedGuess;
    return { ok: true, correct: false, normalizedGuess };
  }

  public giveUp(
    roomCode: string,
    playerToken: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (room.phase !== 'drawing' || room.guesserId !== playerToken) {
      return { ok: false, error: 'Solo quien adivina puede rendirse.' };
    }

    this.finishRound(room, false, true);
    return { ok: true };
  }

  private finishRound(
    room: InternalRoom,
    guessed: boolean,
    gaveUp: boolean
  ): void {
    this.clearPhaseTimer(room);
    if (!room.currentWord || !room.drawerId || !room.guesserId) return;

    const now = Date.now();
    const totalMs = room.settings.turnDurationSec * 1000;
    const remainingMs = guessed ? Math.max(0, (room.phaseEndsAt ?? now) - now) : 0;
    const durationUsedSec = room.roundStartedAt
      ? Math.min(
          room.settings.turnDurationSec,
          Math.max(1, Math.round((now - room.roundStartedAt) / 1000))
        )
      : room.settings.turnDurationSec;

    const basePoints = guessed ? room.currentWord.points : 0;
    const speedBonus = guessed
      ? Math.round((remainingMs / totalMs) * 100)
      : 0;
    const guesserPoints = guessed
      ? Math.round((basePoints + speedBonus) * (room.bombUsed ? 0.75 : 1))
      : 0;
    const drawerPoints = guessed
      ? Math.round(basePoints * 0.75 + speedBonus * 0.5)
      : 0;

    const guesser = room.players.find((p) => p.id === room.guesserId);
    const drawer = room.players.find((p) => p.id === room.drawerId);
    if (guesser) guesser.score += guesserPoints;
    if (drawer) drawer.score += drawerPoints;

    const record: RoundRecord = {
      roundNumber: room.currentRound,
      drawerId: room.drawerId,
      guesserId: room.guesserId,
      word: room.currentWord.word,
      normalizedWord: room.currentWord.normalized,
      category: room.currentWord.category,
      difficulty: room.currentWord.difficulty,
      guessed,
      gaveUp,
      bombUsed: room.bombUsed,
      guesserPoints,
      drawerPoints,
      basePoints,
      speedBonus,
      durationUsedSec,
      operations: room.operations.map((op) => ({ ...op })),
    };

    room.history.push(record);
    room.lastRoundResult = record;
    room.phase = 'round_end';
    room.phaseEndsAt = Date.now() + this.roundAutoAdvanceMs;
    room.lastActivityAt = Date.now();

    room.phaseTimer = setTimeout(() => {
      if (room.phase === 'round_end') {
        this.advanceAfterRoundEnd(room);
        this.notify(room.roomCode);
      }
    }, this.roundAutoAdvanceMs);
  }

  public advanceRound(
    roomCode: string,
    playerToken: string
  ): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: 'Sala no encontrada.' };
    if (!this.findPlayer(room, playerToken)) {
      return { ok: false, error: 'No perteneces a esta sala.' };
    }
    if (room.phase !== 'round_end') {
      return { ok: false, error: 'No estás en resumen de ronda.' };
    }

    this.advanceAfterRoundEnd(room);
    return { ok: true };
  }

  private advanceAfterRoundEnd(room: InternalRoom): void {
    this.clearPhaseTimer(room);
    if (room.currentRound >= room.settings.totalRounds) {
      room.phase = 'game_over';
      room.phaseEndsAt = null;
      room.lastActivityAt = Date.now();
      return;
    }

    room.currentRound += 1;
    const prevDrawer = room.drawerId;
    room.drawerId = room.guesserId;
    room.guesserId = prevDrawer;
    this.beginChoosingWord(room);
  }

  public getStateView(
    rawRoomCode: string,
    playerToken: string
  ): RoomStateView | null {
    const room = this.rooms.get(rawRoomCode.toUpperCase());
    if (!room) return null;

    const me = this.findPlayer(room, playerToken);
    if (!me) return null;

    const isDrawer = me.id === room.drawerId;
    const hideSecret =
      !isDrawer && (room.phase === 'choosing_word' || room.phase === 'drawing');

    return {
      roomCode: room.roomCode,
      phase: room.phase,
      settings: { ...room.settings },
      players: room.players.map(({ token: _t, ...pub }) => ({ ...pub })),
      meId: me.id,
      currentRound: room.currentRound,
      drawerId: room.drawerId,
      guesserId: room.guesserId,
      phaseEndsAt: room.phaseEndsAt,
      wordChoices: hideSecret ? null : room.wordChoices,
      rerollUsed: room.rerollUsed,
      currentWord: hideSecret ? null : room.currentWord,
      wordLength: room.currentWord ? room.currentWord.normalized.length : 0,
      wordCategory: room.currentWord ? room.currentWord.category : null,
      wordDifficulty: room.currentWord ? room.currentWord.difficulty : null,
      wordPoints: room.currentWord ? room.currentWord.points : null,
      tiles: room.tiles,
      bombUsed: room.bombUsed,
      lastWrongGuess: room.lastWrongGuess,
      operations: room.operations,
      canRedo: isDrawer && room.redoStack.length > 0,
      lastRoundResult: room.lastRoundResult,
      history: room.phase === 'game_over' ? room.history : [],
    };
  }
}
