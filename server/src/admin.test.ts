import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { ManagedWord, WORD_BANK, WordBankStats } from '@drawsomething/shared';
import { WordStore } from './wordStore.js';
import { createDrawServer } from './index.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drawsomething-words-'));
}

test('WordStore persists words, normalizes accents/Ñ, enforces uniqueness and bucket integrity', () => {
  const tmpDir = makeTempDir();
  const filePath = path.join(tmpDir, 'words.json');

  try {
    const store = new WordStore({ filePath });
    const expectedTotal =
      WORD_BANK.es.easy.length +
      WORD_BANK.es.hard.length +
      WORD_BANK.en.easy.length +
      WORD_BANK.en.hard.length;
    assert.equal(store.getStats().total, expectedTotal);
    assert.equal(fs.existsSync(filePath), false, 'Does not write before first mutation');

    // Create word with Ñ
    const created = store.create({
      word: 'piñatero',
      category: 'Lugares',
      language: 'es',
      difficulty: 'easy',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.word.word, 'PIÑATERO');
    assert.equal(created.word.normalized, 'PIÑATERO');
    assert.equal(fs.existsSync(filePath), true);

    // Reload from disk in a fresh WordStore instance
    const reloaded = new WordStore({ filePath });
    assert.equal(reloaded.getStats().total, expectedTotal + 1);
    const found = reloaded.getById(created.word.id);
    assert.ok(found);
    assert.equal(found.word, 'PIÑATERO');

    // PINATERO is distinct from PIÑATERO because Ñ is preserved
    const cabanaRes = reloaded.create({
      word: 'pinatero',
      category: 'Lugares',
      language: 'es',
      difficulty: 'easy',
    });
    assert.equal(cabanaRes.ok, true);

    // Duplicate ignoring accents (arbol vs ÁRBOL already in WORD_BANK.es.easy)
    const dupAccent = reloaded.create({
      word: 'arbol',
      category: 'Naturaleza',
      language: 'es',
      difficulty: 'easy',
    });
    assert.equal(dupAccent.ok, false);
    if (!dupAccent.ok) {
      assert.equal(dupAccent.status, 409);
    }

    // Invalid inputs: 1 letter, >12 letters, spaces, numbers
    for (const invalid of ['A', 'SUPERPALABRAS', 'DOS PALABRAS', 'CASA1']) {
      const res = reloaded.create({
        word: invalid,
        category: 'Test',
        language: 'es',
        difficulty: 'easy',
      });
      assert.equal(res.ok, false, `Expected ${invalid} to fail validation`);
      if (!res.ok) assert.equal(res.status, 400);
    }

    // Update word
    const updated = reloaded.update(created.word.id, {
      word: 'piñatita',
      category: 'Hogar',
      difficulty: 'hard',
    });
    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.word.word, 'PIÑATITA');
      assert.equal(updated.word.normalized, 'PIÑATITA');
      assert.equal(updated.word.points, 200);
      assert.equal(updated.word.category, 'Hogar');
    }

    // Delete word
    const deleted = reloaded.delete(created.word.id);
    assert.equal(deleted.ok, true);
    assert.equal(reloaded.getById(created.word.id), undefined);

    // Bulk create with mix of valid, duplicate, and invalid entries
    const bulk = reloaded.bulkCreate([
      { word: 'wombat', category: 'Animales', language: 'es', difficulty: 'easy' },
      { word: 'wombat', category: 'Animales', language: 'es', difficulty: 'easy' }, // dup in batch
      { word: 'ÁRBOL', category: 'Naturaleza', language: 'es', difficulty: 'easy' }, // existing dup
      { word: '123', category: 'Bad', language: 'es', difficulty: 'easy' }, // invalid
    ]);
    assert.equal(bulk.ok, true);
    if (bulk.ok) {
      assert.equal(bulk.added.length, 1);
      assert.equal(bulk.added[0].word, 'WOMBAT');
      assert.equal(bulk.skipped.length, 3);
    }

    // Reset to defaults
    const resetWords = reloaded.resetToDefaults();
    assert.equal(resetWords.length, expectedTotal);

    // Bucket integrity guard: cannot delete or move the last word in a bucket
    const minimalFile = path.join(tmpDir, 'minimal.json');
    fs.writeFileSync(
      minimalFile,
      JSON.stringify({
        version: 1,
        words: [
          {
            id: 'es-e',
            language: 'es',
            word: 'SOL',
            normalized: 'SOL',
            category: 'Naturaleza',
            difficulty: 'easy',
            points: 100,
          },
          {
            id: 'es-h',
            language: 'es',
            word: 'VOLCÁN',
            normalized: 'VOLCAN',
            category: 'Naturaleza',
            difficulty: 'hard',
            points: 200,
          },
          {
            id: 'en-e',
            language: 'en',
            word: 'SUN',
            normalized: 'SUN',
            category: 'Nature',
            difficulty: 'easy',
            points: 100,
          },
          {
            id: 'en-h',
            language: 'en',
            word: 'VOLCANO',
            normalized: 'VOLCANO',
            category: 'Nature',
            difficulty: 'hard',
            points: 200,
          },
        ],
      }),
      'utf8'
    );
    const minStore = new WordStore({ filePath: minimalFile });
    const delLast = minStore.delete('es-e');
    assert.equal(delLast.ok, false);
    if (!delLast.ok) assert.equal(delLast.status, 400);

    const moveLast = minStore.update('es-e', { difficulty: 'hard' });
    assert.equal(moveLast.ok, false);
    if (!moveLast.ok) assert.equal(moveLast.status, 400);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Admin REST API enforces auth, executes full CRUD, and RoomManager uses live updates', async () => {
  const tmpDir = makeTempDir();
  const filePath = path.join(tmpDir, 'api-words.json');

  // Seed a minimal word bank so we can verify RoomManager picks newly added words deterministically
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      version: 1,
      words: [
        {
          id: 'seed-es-easy',
          language: 'es',
          word: 'SOL',
          normalized: 'SOL',
          category: 'Naturaleza',
          difficulty: 'easy',
          points: 100,
        },
        {
          id: 'seed-es-hard',
          language: 'es',
          word: 'PINGÜINO',
          normalized: 'PINGUINO',
          category: 'Animales',
          difficulty: 'hard',
          points: 200,
        },
        {
          id: 'seed-en-easy',
          language: 'en',
          word: 'SUN',
          normalized: 'SUN',
          category: 'Nature',
          difficulty: 'easy',
          points: 100,
        },
        {
          id: 'seed-en-hard',
          language: 'en',
          word: 'VOLCANO',
          normalized: 'VOLCANO',
          category: 'Nature',
          difficulty: 'hard',
          points: 200,
        },
      ],
    }),
    'utf8'
  );

  const { server, io, roomManager } = createDrawServer({
    wordsFilePath: filePath,
    adminPassword: 'super-secret-password',
    disableLoginRateLimit: true,
    wordPickDurationMs: 60_000,
    roundAutoAdvanceMs: 60_000,
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Unauthenticated requests rejected with 401
    const unauthWords = await fetch(`${baseUrl}/api/admin/words`);
    assert.equal(unauthWords.status, 401);

    const unauthSession = await fetch(`${baseUrl}/api/admin/session`);
    assert.equal(unauthSession.status, 401);

    // 2. Non-existent API endpoint returns JSON 404
    const notFound = await fetch(`${baseUrl}/api/no-existe`);
    assert.equal(notFound.status, 404);
    const notFoundJson = (await notFound.json()) as { ok: boolean };
    assert.equal(notFoundJson.ok, false);

    // 3. Wrong password rejected with 401
    const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    assert.equal(badLogin.status, 401);

    // 4. Correct password returns token
    const goodLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-secret-password' }),
    });
    assert.equal(goodLogin.status, 200);
    const loginData = (await goodLogin.json()) as {
      ok: boolean;
      token: string;
      usingDefaultPassword: boolean;
    };
    assert.equal(loginData.ok, true);
    assert.ok(loginData.token);
    assert.equal(loginData.usingDefaultPassword, false);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.token}`,
    };

    // 5. Session check succeeds
    const sessionRes = await fetch(`${baseUrl}/api/admin/session`, {
      headers: authHeaders,
    });
    assert.equal(sessionRes.status, 200);

    // 6. Create word via HTTP
    const createRes = await fetch(`${baseUrl}/api/admin/words`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        word: 'cometa',
        category: 'Espacio',
        language: 'es',
        difficulty: 'easy',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdPayload = (await createRes.json()) as {
      ok: boolean;
      word: ManagedWord;
      stats: WordBankStats;
    };
    assert.equal(createdPayload.word.word, 'COMETA');
    assert.equal(createdPayload.stats.total, 5);

    // 7. List with filters (language, difficulty, search)
    const filteredRes = await fetch(
      `${baseUrl}/api/admin/words?language=es&difficulty=easy&search=com`,
      { headers: authHeaders }
    );
    assert.equal(filteredRes.status, 200);
    const filteredData = (await filteredRes.json()) as {
      ok: boolean;
      words: ManagedWord[];
    };
    assert.equal(filteredData.words.length, 1);
    assert.equal(filteredData.words[0].id, createdPayload.word.id);

    // 8. Update word via HTTP
    const updateRes = await fetch(
      `${baseUrl}/api/admin/words/${createdPayload.word.id}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          word: 'asteroide',
          difficulty: 'hard',
        }),
      }
    );
    assert.equal(updateRes.status, 200);
    const updatedData = (await updateRes.json()) as {
      ok: boolean;
      word: ManagedWord;
    };
    assert.equal(updatedData.word.word, 'ASTEROIDE');
    assert.equal(updatedData.word.points, 200);

    // 9. Delete original seed-es-hard so ONLY ASTEROIDE remains in es/hard,
    //    then confirm RoomManager picks ASTEROIDE live without restart!
    const delSeedRes = await fetch(`${baseUrl}/api/admin/words/seed-es-hard`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(delSeedRes.status, 200);

    const { roomCode } = roomManager.createRoom('p1', 'Ana');
    roomManager.joinRoom(roomCode, 'p2', 'Luis');
    assert.equal(roomManager.startGame(roomCode, 'p1').ok, true);
    const state = roomManager.getStateView(roomCode, 'p1')!;
    assert.equal(state.wordChoices?.[0].normalized, 'SOL');
    assert.equal(state.wordChoices?.[1].normalized, 'ASTEROIDE');

    // 10. Bulk import via HTTP
    const bulkRes = await fetch(`${baseUrl}/api/admin/words/bulk`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        words: [
          { word: 'planeta', category: 'Espacio', language: 'es', difficulty: 'easy' },
          { word: 'SOL', category: 'Naturaleza', language: 'es', difficulty: 'easy' },
        ],
      }),
    });
    assert.equal(bulkRes.status, 200);
    const bulkData = (await bulkRes.json()) as {
      ok: boolean;
      added: ManagedWord[];
      skipped: Array<{ word: string; reason: string }>;
    };
    assert.equal(bulkData.added.length, 1);
    assert.equal(bulkData.skipped.length, 1);

    // 11. Reset to defaults via HTTP
    const resetRes = await fetch(`${baseUrl}/api/admin/words/reset`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(resetRes.status, 200);
    const resetData = (await resetRes.json()) as {
      ok: boolean;
      stats: WordBankStats;
    };
    assert.equal(
      resetData.stats.total,
      WORD_BANK.es.easy.length +
        WORD_BANK.es.hard.length +
        WORD_BANK.en.easy.length +
        WORD_BANK.en.hard.length
    );
  } finally {
    roomManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
