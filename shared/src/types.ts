export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 640;
export const SCRABBLE_RACK_SIZE = 12;
export const WORD_PICK_DURATION_SEC = 15;
export const ROUND_RESULT_AUTO_ADVANCE_SEC = 6;

export type Language = 'es' | 'en';
export type WordDifficulty = 'easy' | 'hard';

export type ToolType =
  | 'pencil'
  | 'pen'
  | 'marker'
  | 'spray'
  | 'calligraphy'
  | 'eraser'
  | 'fill';

export type StrokeToolType = Exclude<ToolType, 'fill'>;

export interface Point {
  x: number;
  y: number;
  p?: number;
}

export interface StrokeOperation {
  id: string;
  type: 'stroke';
  tool: StrokeToolType;
  color: string;
  size: number;
  points: Point[];
  seed: number;
}

export interface FillOperation {
  id: string;
  type: 'fill';
  x: number;
  y: number;
  color: string;
}

export interface ClearOperation {
  id: string;
  type: 'clear';
}

export type DrawOperation = StrokeOperation | FillOperation | ClearOperation;

export interface WordEntry {
  word: string;
  normalized: string;
  category: string;
  difficulty: WordDifficulty;
  points: number;
}

export interface ManagedWord extends WordEntry {
  id: string;
  language: Language;
}

export interface WordInput {
  word: string;
  category: string;
  language: Language;
  difficulty: WordDifficulty;
}

export interface WordBankStats {
  total: number;
  byLanguage: Record<Language, { easy: number; hard: number; total: number }>;
  categories: Record<Language, string[]>;
}

export type WordBankMap = Record<Language, { easy: WordEntry[]; hard: WordEntry[] }>;

export interface ScrabbleTile {
  id: string;
  letter: string;
  eliminated: boolean;
}

export interface RoomSettings {
  totalRounds: 4 | 6 | 8 | 10;
  turnDurationSec: 60 | 90 | 120;
  language: Language;
}

export interface PlayerInfo {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  connected: boolean;
  isHost: boolean;
}

export type RoomPhase =
  | 'lobby'
  | 'choosing_word'
  | 'drawing'
  | 'round_end'
  | 'game_over';

export interface RoundRecord {
  roundNumber: number;
  drawerId: string;
  guesserId: string;
  word: string;
  normalizedWord: string;
  category: string;
  difficulty: WordDifficulty;
  guessed: boolean;
  gaveUp: boolean;
  bombUsed: boolean;
  guesserPoints: number;
  drawerPoints: number;
  basePoints: number;
  speedBonus: number;
  durationUsedSec: number;
  operations: DrawOperation[];
}

export interface RoomStateView {
  roomCode: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerInfo[];
  meId: string;
  currentRound: number;
  drawerId: string | null;
  guesserId: string | null;
  phaseEndsAt: number | null;
  wordChoices: WordEntry[] | null;
  rerollUsed: boolean;
  currentWord: WordEntry | null;
  wordLength: number;
  wordCategory: string | null;
  wordDifficulty: WordDifficulty | null;
  wordPoints: number | null;
  tiles: ScrabbleTile[];
  bombUsed: boolean;
  lastWrongGuess: string | null;
  operations: DrawOperation[];
  canRedo: boolean;
  lastRoundResult: RoundRecord | null;
  history: RoundRecord[];
}

export interface StrokeStartPayload {
  id: string;
  tool: StrokeToolType;
  color: string;
  size: number;
  point: Point;
  seed: number;
}

export interface StrokePointsPayload {
  id: string;
  points: Point[];
}

export interface StrokeCommitPayload {
  operation: StrokeOperation;
}

export interface FillPayload {
  operation: FillOperation;
}

export interface ClearPayload {
  operation: ClearOperation;
}

export interface GuessResultPayload {
  correct: boolean;
  guess: string;
}

export interface AckResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const AVATAR_COLORS = [
  '#FF4D6D',
  '#FF9F1C',
  '#2EC4B6',
  '#3A86FF',
  '#8338EC',
  '#06D6A0',
] as const;

export const PRESET_PALETTE = [
  '#111827', // Ink Black
  '#FFFFFF', // White
  '#9CA3AF', // Gray
  '#7C2D12', // Brown
  '#EF4444', // Red
  '#F97316', // Orange
  '#FACC15', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#FDBA74', // Peach / Skin
  '#A3E635', // Lime
] as const;
