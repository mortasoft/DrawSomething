import type {
  Language,
  ManagedWord,
  WordBankStats,
  WordDifficulty,
  WordInput,
} from '@drawsomething/shared';

const ADMIN_TOKEN_STORAGE_KEY = 'drawsomething_admin_token';

export class AdminUnauthorizedError extends Error {
  constructor(message = 'Sesión de administrador expirada o inválida.') {
    super(message);
    this.name = 'AdminUnauthorizedError';
  }
}

export function getStoredAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function clearStoredAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

function storeAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  requireAuth = true
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (requireAuth) {
    const token = getStoredAdminToken();
    if (!token) {
      throw new AdminUnauthorizedError();
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers,
  });

  const data = await parseJsonSafe(res);

  if (res.status === 401 && requireAuth) {
    clearStoredAdminToken();
    throw new AdminUnauthorizedError(
      typeof data.error === 'string' ? data.error : undefined
    );
  }

  if (!res.ok || data.ok === false) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Error de servidor (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export interface AdminLoginResponse {
  ok: true;
  token: string;
  expiresAt: number;
  usingDefaultPassword: boolean;
}

export async function adminLogin(
  password: string
): Promise<AdminLoginResponse> {
  const data = await adminFetch<AdminLoginResponse>(
    '/login',
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
    false
  );
  storeAdminToken(data.token);
  return data;
}

export async function adminCheckSession(): Promise<{
  ok: true;
  authenticated: true;
  usingDefaultPassword: boolean;
}> {
  return adminFetch('/session', { method: 'GET' });
}

export interface WordFiltersQuery {
  language?: Language | '';
  difficulty?: WordDifficulty | '';
  category?: string;
  search?: string;
}

export async function adminListWords(
  filters: WordFiltersQuery = {}
): Promise<{ words: ManagedWord[]; stats: WordBankStats }> {
  const params = new URLSearchParams();
  if (filters.language) params.set('language', filters.language);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.category) params.set('category', filters.category);
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  const qs = params.toString();
  return adminFetch(`/words${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function adminCreateWord(
  input: WordInput
): Promise<{ word: ManagedWord; stats: WordBankStats }> {
  return adminFetch('/words', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function adminUpdateWord(
  id: string,
  input: Partial<WordInput>
): Promise<{ word: ManagedWord; stats: WordBankStats }> {
  return adminFetch(`/words/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function adminDeleteWord(
  id: string
): Promise<{ deleted: ManagedWord; stats: WordBankStats }> {
  return adminFetch(`/words/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export interface BulkCreateResult {
  added: ManagedWord[];
  skipped: Array<{ word: string; reason: string }>;
  stats: WordBankStats;
}

export async function adminBulkCreateWords(
  words: WordInput[]
): Promise<BulkCreateResult> {
  return adminFetch('/words/bulk', {
    method: 'POST',
    body: JSON.stringify({ words }),
  });
}

export async function adminResetWords(): Promise<{
  words: ManagedWord[];
  stats: WordBankStats;
}> {
  return adminFetch('/words/reset', {
    method: 'POST',
  });
}
