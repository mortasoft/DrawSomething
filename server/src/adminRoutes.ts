import express from 'express';
import type { Language, WordDifficulty, WordInput } from '@drawsomething/shared';
import { AdminAuth } from './adminAuth.js';
import { WordStore } from './wordStore.js';

function parseLanguage(raw: unknown): Language | undefined {
  return raw === 'es' || raw === 'en' ? raw : undefined;
}

function parseDifficulty(raw: unknown): WordDifficulty | undefined {
  return raw === 'easy' || raw === 'hard' ? raw : undefined;
}

/**
 * Creates the Express router mounted at `/api/admin` for word bank management.
 */
export function createAdminRouter(
  wordStore: WordStore,
  adminAuth: AdminAuth
): express.Router {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (adminAuth.isRateLimited(clientIp)) {
      res.status(429).json({
        ok: false,
        error:
          'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.',
      });
      return;
    }

    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';
    if (!adminAuth.verifyPassword(password)) {
      adminAuth.recordFailedAttempt(clientIp);
      res.status(401).json({
        ok: false,
        error: 'Contraseña de administrador incorrecta.',
      });
      return;
    }

    adminAuth.clearFailedAttempts(clientIp);
    const { token, expiresAt } = adminAuth.issueToken();
    res.json({
      ok: true,
      token,
      expiresAt,
      usingDefaultPassword: adminAuth.isDefaultPassword,
    });
  });

  router.use(adminAuth.requireAdmin);

  router.get('/session', (_req, res) => {
    res.json({
      ok: true,
      authenticated: true,
      usingDefaultPassword: adminAuth.isDefaultPassword,
    });
  });

  router.get('/words', (req, res) => {
    const language = parseLanguage(req.query.language);
    const difficulty = parseDifficulty(req.query.difficulty);
    const category =
      typeof req.query.category === 'string' ? req.query.category : undefined;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;

    const words = wordStore.list({ language, difficulty, category, search });
    const stats = wordStore.getStats();
    res.json({ ok: true, words, stats });
  });

  router.post('/words', (req, res) => {
    const result = wordStore.create((req.body ?? {}) as Partial<WordInput>);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.status(201).json({
      ok: true,
      word: result.word,
      stats: wordStore.getStats(),
    });
  });

  router.post('/words/bulk', (req, res) => {
    const rawWords = req.body?.words as Partial<WordInput>[];
    const result = wordStore.bulkCreate(rawWords);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      stats: wordStore.getStats(),
    });
  });

  router.post('/words/reset', (_req, res) => {
    const words = wordStore.resetToDefaults();
    res.json({
      ok: true,
      words,
      stats: wordStore.getStats(),
    });
  });

  router.put('/words/:id', (req, res) => {
    const result = wordStore.update(
      req.params.id,
      (req.body ?? {}) as Partial<WordInput>
    );
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      word: result.word,
      stats: wordStore.getStats(),
    });
  });

  router.delete('/words/:id', (req, res) => {
    const result = wordStore.delete(req.params.id);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      deleted: result.deleted,
      stats: wordStore.getStats(),
    });
  });

  return router;
}
