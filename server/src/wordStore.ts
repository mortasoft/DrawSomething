import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Language,
  ManagedWord,
  WORD_BANK,
  WordBankMap,
  WordBankStats,
  WordDifficulty,
  WordEntry,
  WordInput,
  getPointsForDifficulty,
  normalizeWord,
  validateWordInput,
} from '@drawsomething/shared';

export interface WordStoreOptions {
  /**
   * Path to JSON file for persistence.
   * Pass `null` for in-memory only mode.
   * Omit to use `WORDS_DATA_PATH` env var or `<root>/data/words.json`.
   */
  filePath?: string | null;
}

export interface WordListFilters {
  language?: Language;
  difficulty?: WordDifficulty;
  category?: string;
  search?: string;
}

export interface BulkSkipItem {
  word: string;
  reason: string;
}

interface PersistedWordsFile {
  version: number;
  words: ManagedWord[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORDS_PATH = path.resolve(__dirname, '../../data/words.json');

function buildDefaultWords(): ManagedWord[] {
  const result: ManagedWord[] = [];
  for (const language of ['es', 'en'] as const) {
    for (const difficulty of ['easy', 'hard'] as const) {
      for (const entry of WORD_BANK[language][difficulty]) {
        result.push({
          id: crypto.randomUUID(),
          language,
          word: entry.word,
          normalized: entry.normalized,
          category: entry.category,
          difficulty: entry.difficulty,
          points: entry.points,
        });
      }
    }
  }
  return result;
}

function hydratePersistedWord(raw: Partial<ManagedWord>): ManagedWord | null {
  if (!raw || typeof raw.word !== 'string' || typeof raw.category !== 'string') {
    return null;
  }
  const language: Language = raw.language === 'en' ? 'en' : 'es';
  const difficulty: WordDifficulty = raw.difficulty === 'hard' ? 'hard' : 'easy';
  const normalized = normalizeWord(raw.word);
  if (!normalized) return null;

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : crypto.randomUUID(),
    language,
    word: raw.word.trim().toLocaleUpperCase('es-ES'),
    normalized,
    category: raw.category.trim() || 'General',
    difficulty,
    points: getPointsForDifficulty(difficulty),
  };
}

/**
 * Persistent word bank manager used by both the admin REST API and live game rooms.
 */
export class WordStore {
  private readonly filePath: string | null;
  private words: ManagedWord[];

  constructor(options: WordStoreOptions = {}) {
    if (options.filePath === null) {
      this.filePath = null;
    } else if (typeof options.filePath === 'string') {
      this.filePath = options.filePath;
    } else {
      this.filePath = process.env.WORDS_DATA_PATH || DEFAULT_WORDS_PATH;
    }

    this.words = this.loadInitialWords();
  }

  private loadInitialWords(): ManagedWord[] {
    if (this.filePath && fs.existsSync(this.filePath)) {
      const rawContent = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(rawContent) as Partial<PersistedWordsFile>;
      if (Array.isArray(parsed.words)) {
        const hydrated = parsed.words
          .map((item) => hydratePersistedWord(item))
          .filter((item): item is ManagedWord => item !== null);
        if (hydrated.length > 0) {
          return hydrated;
        }
      }
    }
    return buildDefaultWords();
  }

  private persist(): void {
    if (this.filePath === null) return;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    const payload: PersistedWordsFile = {
      version: 1,
      words: this.words,
    };
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  private countInBucket(language: Language, difficulty: WordDifficulty): number {
    let count = 0;
    for (const w of this.words) {
      if (w.language === language && w.difficulty === difficulty) {
        count++;
      }
    }
    return count;
  }

  private hasDuplicate(
    language: Language,
    normalized: string,
    excludeId?: string
  ): boolean {
    return this.words.some(
      (w) =>
        w.language === language &&
        w.normalized === normalized &&
        w.id !== excludeId
    );
  }

  public getFilePath(): string | null {
    return this.filePath;
  }

  public getBank(): WordBankMap {
    const bank: WordBankMap = {
      es: { easy: [], hard: [] },
      en: { easy: [], hard: [] },
    };

    for (const w of this.words) {
      const entry: WordEntry = {
        word: w.word,
        normalized: w.normalized,
        category: w.category,
        difficulty: w.difficulty,
        points: w.points,
      };
      bank[w.language][w.difficulty].push(entry);
    }

    return bank;
  }

  public getStats(): WordBankStats {
    const byLanguage: WordBankStats['byLanguage'] = {
      es: { easy: 0, hard: 0, total: 0 },
      en: { easy: 0, hard: 0, total: 0 },
    };
    const catSets: Record<Language, Set<string>> = {
      es: new Set<string>(),
      en: new Set<string>(),
    };

    for (const w of this.words) {
      byLanguage[w.language][w.difficulty] += 1;
      byLanguage[w.language].total += 1;
      catSets[w.language].add(w.category);
    }

    return {
      total: this.words.length,
      byLanguage,
      categories: {
        es: Array.from(catSets.es).sort((a, b) => a.localeCompare(b, 'es')),
        en: Array.from(catSets.en).sort((a, b) => a.localeCompare(b, 'en')),
      },
    };
  }

  public list(filters: WordListFilters = {}): ManagedWord[] {
    const searchRaw = filters.search?.trim() ?? '';
    const searchLower = searchRaw.toLocaleLowerCase('es-ES');
    const searchNorm = normalizeWord(searchRaw);
    const categoryLower = filters.category?.trim().toLocaleLowerCase('es-ES') ?? '';

    return this.words
      .filter((w) => {
        if (filters.language && w.language !== filters.language) return false;
        if (filters.difficulty && w.difficulty !== filters.difficulty) return false;
        if (
          categoryLower &&
          w.category.toLocaleLowerCase('es-ES') !== categoryLower
        ) {
          return false;
        }
        if (searchLower) {
          const matchesDisplay = w.word
            .toLocaleLowerCase('es-ES')
            .includes(searchLower);
          const matchesNorm =
            searchNorm.length > 0 && w.normalized.includes(searchNorm);
          const matchesCategory = w.category
            .toLocaleLowerCase('es-ES')
            .includes(searchLower);
          if (!matchesDisplay && !matchesNorm && !matchesCategory) {
            return false;
          }
        }
        return true;
      })
      .map((w) => ({ ...w }))
      .sort((a, b) => a.word.localeCompare(b.word, 'es'));
  }

  public getById(id: string): ManagedWord | undefined {
    const found = this.words.find((w) => w.id === id);
    return found ? { ...found } : undefined;
  }

  public create(
    input: Partial<WordInput>
  ):
    | { ok: true; word: ManagedWord }
    | { ok: false; status: 400 | 409; error: string } {
    const validation = validateWordInput(input);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation.error };
    }

    const { word, normalized, category, language, difficulty, points } =
      validation.value;

    if (this.hasDuplicate(language, normalized)) {
      return {
        ok: false,
        status: 409,
        error: 'Esa palabra ya existe en este idioma.',
      };
    }

    const created: ManagedWord = {
      id: crypto.randomUUID(),
      word,
      normalized,
      category,
      language,
      difficulty,
      points,
    };

    this.words.push(created);
    this.persist();
    return { ok: true, word: { ...created } };
  }

  public update(
    id: string,
    patch: Partial<WordInput>
  ):
    | { ok: true; word: ManagedWord }
    | { ok: false; status: 400 | 404 | 409; error: string } {
    const idx = this.words.findIndex((w) => w.id === id);
    if (idx === -1) {
      return { ok: false, status: 404, error: 'Palabra no encontrada.' };
    }

    const existing = this.words[idx];
    const merged: Partial<WordInput> = {
      word: patch.word !== undefined ? patch.word : existing.word,
      category: patch.category !== undefined ? patch.category : existing.category,
      language: patch.language !== undefined ? patch.language : existing.language,
      difficulty:
        patch.difficulty !== undefined ? patch.difficulty : existing.difficulty,
    };

    const validation = validateWordInput(merged);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation.error };
    }

    const { word, normalized, category, language, difficulty, points } =
      validation.value;

    if (this.hasDuplicate(language, normalized, id)) {
      return {
        ok: false,
        status: 409,
        error: 'Esa palabra ya existe en este idioma.',
      };
    }

    const movesBucket =
      language !== existing.language || difficulty !== existing.difficulty;
    if (
      movesBucket &&
      this.countInBucket(existing.language, existing.difficulty) <= 1
    ) {
      return {
        ok: false,
        status: 400,
        error:
          'Debe quedar al menos 1 palabra en cada idioma y dificultad para poder jugar.',
      };
    }

    const updated: ManagedWord = {
      id: existing.id,
      word,
      normalized,
      category,
      language,
      difficulty,
      points,
    };

    this.words[idx] = updated;
    this.persist();
    return { ok: true, word: { ...updated } };
  }

  public delete(
    id: string
  ):
    | { ok: true; deleted: ManagedWord }
    | { ok: false; status: 400 | 404; error: string } {
    const idx = this.words.findIndex((w) => w.id === id);
    if (idx === -1) {
      return { ok: false, status: 404, error: 'Palabra no encontrada.' };
    }

    const existing = this.words[idx];
    if (this.countInBucket(existing.language, existing.difficulty) <= 1) {
      return {
        ok: false,
        status: 400,
        error:
          'Debe quedar al menos 1 palabra en cada idioma y dificultad para poder jugar.',
      };
    }

    const [deleted] = this.words.splice(idx, 1);
    this.persist();
    return { ok: true, deleted: { ...deleted } };
  }

  public bulkCreate(
    inputs: Partial<WordInput>[]
  ):
    | { ok: true; added: ManagedWord[]; skipped: BulkSkipItem[] }
    | { ok: false; status: 400; error: string } {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return {
        ok: false,
        status: 400,
        error: 'Envía al menos una palabra para importar.',
      };
    }

    if (inputs.length > 500) {
      return {
        ok: false,
        status: 400,
        error: 'Puedes importar un máximo de 500 palabras por lote.',
      };
    }

    const existingKeys = new Set(
      this.words.map((w) => `${w.language}:${w.normalized}`)
    );
    const added: ManagedWord[] = [];
    const skipped: BulkSkipItem[] = [];

    for (const item of inputs) {
      const label =
        typeof item?.word === 'string' && item.word.trim()
          ? item.word.trim()
          : '(vacía)';
      const validation = validateWordInput(item ?? {});
      if (!validation.ok) {
        skipped.push({ word: label, reason: validation.error });
        continue;
      }

      const { word, normalized, category, language, difficulty, points } =
        validation.value;
      const key = `${language}:${normalized}`;

      if (existingKeys.has(key)) {
        skipped.push({
          word,
          reason: 'Palabra duplicada en este idioma.',
        });
        continue;
      }

      existingKeys.add(key);
      const created: ManagedWord = {
        id: crypto.randomUUID(),
        word,
        normalized,
        category,
        language,
        difficulty,
        points,
      };
      this.words.push(created);
      added.push({ ...created });
    }

    if (added.length > 0) {
      this.persist();
    }

    return { ok: true, added, skipped };
  }

  public resetToDefaults(): ManagedWord[] {
    this.words = buildDefaultWords();
    this.persist();
    return this.list();
  }
}
