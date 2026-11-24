import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { io as ioClient, Socket } from 'socket.io-client';
import {
  AckResult,
  RoomStateView,
  SCRABBLE_RACK_SIZE,
  StrokeOperation,
  WORD_BANK,
  generateScrabbleTiles,
  normalizeWord,
} from '@drawsomething/shared';
import { RoomManager } from './roomManager.js';
import { createDrawServer } from './index.js';

test('normalizeWord preserves Ñ and strips accents across word bank', () => {
  assert.equal(normalizeWord('piña'), 'PIÑA');
  assert.equal(normalizeWord('León'), 'LEÓN'.replace('Ó', 'O'));
  assert.equal(normalizeWord('pingüino'), 'PINGUINO');
  assert.equal(normalizeWord('  árbol '), 'ARBOL');

  assert.ok(WORD_BANK.es.easy.length >= 150, 'Spanish easy bank >= 150');
  assert.ok(WORD_BANK.es.hard.length >= 150, 'Spanish hard bank >= 150');
  assert.ok(WORD_BANK.en.easy.length >= 150, 'English easy bank >= 150');
  assert.ok(WORD_BANK.en.hard.length >= 150, 'English hard bank >= 150');

  for (const lang of ['es', 'en'] as const) {
    const seen = new Set<string>();
    const categories = new Set<string>();
    for (const diff of ['easy', 'hard'] as const) {
      for (const entry of WORD_BANK[lang][diff]) {
        assert.ok(
          entry.normalized.length >= 3 && entry.normalized.length <= 10,
          `Invalid word length: ${entry.word} -> ${entry.normalized}`
        );
        assert.match(entry.normalized, /^[A-ZÑ]+$/);
        assert.equal(
          seen.has(entry.normalized),
          false,
          `Duplicate word in ${lang}: ${entry.word} (${entry.normalized})`
        );
        seen.add(entry.normalized);
        categories.add(entry.category);
      }
    }
    assert.ok(
      categories.has(lang === 'es' ? 'Personajes' : 'Characters'),
      `Missing characters category in ${lang}`
    );
  }
});

test('generateScrabbleTiles creates 12 tiles covering all letters with duplicates', () => {
  const tiles = generateScrabbleTiles('PIÑA', 'es');
  assert.equal(tiles.length, SCRABBLE_RACK_SIZE);

  const counts = new Map<string, number>();
  for (const t of tiles) {
    counts.set(t.letter, (counts.get(t.letter) ?? 0) + 1);
    assert.equal(t.eliminated, false);
  }
  assert.ok((counts.get('P') ?? 0) >= 1);
  assert.ok((counts.get('I') ?? 0) >= 1);
  assert.ok((counts.get('Ñ') ?? 0) >= 1);
  assert.ok((counts.get('A') ?? 0) >= 1);

  const dupTiles = generateScrabbleTiles('COCO', 'es');
  const cCount = dupTiles.filter((t) => t.letter === 'C').length;
  const oCount = dupTiles.filter((t) => t.letter === 'O').length;
  assert.ok(cCount >= 2);
  assert.ok(oCount >= 2);
});

test('RoomManager bomb logic preserves required duplicate letters and hides secret from guesser', () => {
  const rm = new RoomManager({
    wordPickDurationMs: 60_000,
    roundAutoAdvanceMs: 60_000,
  });

  try {
    const { roomCode } = rm.createRoom('p1', 'Ana');
    const joinRes = rm.joinRoom(roomCode, 'p2', 'Luis');
    assert.equal(joinRes.ok, true);

    assert.equal(rm.startGame(roomCode, 'p1').ok, true);

    const drawerChoosing = rm.getStateView(roomCode, 'p1')!;
    const guesserChoosing = rm.getStateView(roomCode, 'p2')!;
    assert.equal(drawerChoosing.phase, 'choosing_word');
    assert.equal(drawerChoosing.wordChoices?.length, 2);
    assert.equal(guesserChoosing.wordChoices, null);
    assert.equal(guesserChoosing.currentWord, null);

    // Reroll once works, second reroll fails
    assert.equal(rm.rerollWords(roomCode, 'p1').ok, true);
    assert.equal(rm.rerollWords(roomCode, 'p1').ok, false);

    const choicesAfterReroll = rm.getStateView(roomCode, 'p1')!.wordChoices!;
    const picked = choicesAfterReroll[1]; // hard word
    assert.equal(rm.pickWord(roomCode, 'p1', picked.normalized).ok, true);

    const guesserDrawing = rm.getStateView(roomCode, 'p2')!;
    assert.equal(guesserDrawing.phase, 'drawing');
    assert.equal(guesserDrawing.currentWord, null);
    assert.equal(guesserDrawing.wordLength, picked.normalized.length);
    assert.equal(guesserDrawing.tiles.length, 12);

    // Use bomb once
    const bombRes = rm.useBomb(roomCode, 'p2');
    assert.equal(bombRes.ok, true);
    if (bombRes.ok) {
      const eliminatedCount = bombRes.tiles.filter((t) => t.eliminated).length;
      const maxDistractors = 12 - picked.normalized.length;
      assert.equal(eliminatedCount, Math.min(4, maxDistractors));

      // Verify remaining non-eliminated tiles still form the word
      const remainingCounts = new Map<string, number>();
      for (const t of bombRes.tiles.filter((t) => !t.eliminated)) {
        remainingCounts.set(t.letter, (remainingCounts.get(t.letter) ?? 0) + 1);
      }
      for (const ch of picked.normalized) {
        const cur = remainingCounts.get(ch) ?? 0;
        assert.ok(cur > 0, `Missing required letter ${ch} after bomb`);
        remainingCounts.set(ch, cur - 1);
      }
    }

    // Cannot use bomb twice
    assert.equal(rm.useBomb(roomCode, 'p2').ok, false);

    // Wrong guess then right guess
    const wrong = rm.submitGuess(roomCode, 'p2', 'ZZZZZZ');
    assert.equal(wrong.ok, true);
    if (wrong.ok) assert.equal(wrong.correct, false);

    const right = rm.submitGuess(roomCode, 'p2', picked.word);
    assert.equal(right.ok, true);
    if (right.ok) assert.equal(right.correct, true);

    const endView = rm.getStateView(roomCode, 'p2')!;
    assert.equal(endView.phase, 'round_end');
    assert.equal(endView.lastRoundResult?.guessed, true);
    assert.equal(endView.lastRoundResult?.bombUsed, true);
    assert.ok(endView.players.find((p) => p.id === 'p2')!.score > 0);
    assert.ok(endView.players.find((p) => p.id === 'p1')!.score > 0);
  } finally {
    rm.dispose();
  }
});

test('Full 2-player Socket.IO game flow from lobby through game_over gallery and rematch', async () => {
  const { server, io, roomManager } = createDrawServer({
    wordPickDurationMs: 60_000,
    roundAutoAdvanceMs: 60_000,
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://localhost:${port}`;

  const c1: Socket = ioClient(url, { transports: ['websocket'] });
  const c2: Socket = ioClient(url, { transports: ['websocket'] });

  let latest1: RoomStateView | null = null;
  let latest2: RoomStateView | null = null;
  c1.on('room:state', (s: RoomStateView) => {
    latest1 = s;
  });
  c2.on('room:state', (s: RoomStateView) => {
    latest2 = s;
  });

  const emitAck = <T = undefined>(
    socket: Socket,
    event: string,
    payload?: unknown
  ): Promise<AckResult<T>> =>
    new Promise((resolve) => {
      if (payload === undefined) {
        socket.emit(event, resolve);
      } else {
        socket.emit(event, payload, resolve);
      }
    });

  const waitFor = async (predicate: () => boolean) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 3000) {
        throw new Error('Timed out waiting for state');
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  };

  try {
    await Promise.all([
      new Promise<void>((r) => c1.once('connect', r)),
      new Promise<void>((r) => c2.once('connect', r)),
    ]);

    const created = await emitAck<{ roomCode: string }>(c1, 'room:create', {
      playerToken: 'tok-1',
      nickname: 'Sofi',
      avatarColor: '#FF4D6D',
    });
    assert.equal(created.ok, true);
    const roomCode = created.data!.roomCode;

    const joined = await emitAck(c2, 'room:join', {
      roomCode,
      playerToken: 'tok-2',
      nickname: 'Mateo',
    });
    assert.equal(joined.ok, true);

    // Update rounds to 4 for faster full-match test
    const upd = await emitAck(c1, 'room:update_settings', {
      totalRounds: 4,
      turnDurationSec: 60,
      language: 'es',
    });
    assert.equal(upd.ok, true);

    const started = await emitAck(c1, 'game:start');
    assert.equal(started.ok, true);

    for (let round = 1; round <= 4; round++) {
      await waitFor(
        () =>
          latest1?.phase === 'choosing_word' &&
          latest2?.phase === 'choosing_word' &&
          latest1?.currentRound === round
      );

      const drawerSocket = latest1!.drawerId === 'tok-1' ? c1 : c2;
      const guesserSocket = latest1!.drawerId === 'tok-1' ? c2 : c1;
      const drawerState = latest1!.drawerId === 'tok-1' ? latest1! : latest2!;
      const guesserState = latest1!.drawerId === 'tok-1' ? latest2! : latest1!;

      assert.equal(guesserState.wordChoices, null);
      const chosen = drawerState.wordChoices![0];

      const picked = await emitAck(drawerSocket, 'word:pick', {
        normalized: chosen.normalized,
      });
      assert.equal(picked.ok, true);

      await waitFor(
        () =>
          latest1?.phase === 'drawing' &&
          latest2?.phase === 'drawing' &&
          latest1?.currentRound === round
      );

      // Verify guesser never sees secret word during drawing
      const gView = latest1!.drawerId === 'tok-1' ? latest2! : latest1!;
      assert.equal(gView.currentWord, null);
      assert.equal(gView.wordLength, chosen.normalized.length);

      // Drawer commits a stroke (with stylus pressure) + undo + redo
      const op: StrokeOperation = {
        id: `op-${round}`,
        type: 'stroke',
        tool: 'pencil',
        color: '#111827',
        size: 6,
        points: [
          { x: 100, y: 100, p: 0.35 },
          { x: 200, y: 150, p: 0.92 },
        ],
        seed: 42,
      };
      const committed = await emitAck(drawerSocket, 'draw:stroke_commit', {
        operation: op,
      });
      assert.equal(committed.ok, true);

      if (round === 1) {
        assert.equal((await emitAck(drawerSocket, 'draw:undo')).ok, true);
        await waitFor(() => (latest1?.operations.length ?? -1) === 0);
        assert.equal((await emitAck(drawerSocket, 'draw:redo')).ok, true);
        await waitFor(() => (latest1?.operations.length ?? 0) === 1);

        // Clear updates BOTH drawer and guesser states, and undo restores it
        const clearOp = { id: 'clear-1', type: 'clear' as const };
        assert.equal(
          (await emitAck(drawerSocket, 'draw:clear', { operation: clearOp })).ok,
          true
        );
        await waitFor(
          () =>
            latest1?.operations.length === 2 &&
            latest2?.operations.length === 2 &&
            latest1.operations[1].type === 'clear' &&
            latest2.operations[1].type === 'clear'
        );
        assert.equal((await emitAck(drawerSocket, 'draw:undo')).ok, true);
        await waitFor(
          () =>
            latest1?.operations.length === 1 &&
            latest2?.operations.length === 1
        );
      }

      // Guesser submits wrong guess then correct guess
      const wrong = await emitAck<{ correct: boolean }>(
        guesserSocket,
        'guess:submit',
        { guess: 'XXXX' }
      );
      assert.equal(wrong.ok, true);
      assert.equal(wrong.data?.correct, false);

      const right = await emitAck<{ correct: boolean }>(
        guesserSocket,
        'guess:submit',
        { guess: chosen.normalized }
      );
      assert.equal(right.ok, true);
      assert.equal(right.data?.correct, true);

      await waitFor(() => latest1?.phase === 'round_end');
      const next = await emitAck(drawerSocket, 'round:next');
      assert.equal(next.ok, true);
    }

    await waitFor(
      () => latest1?.phase === 'game_over' && latest2?.phase === 'game_over'
    );
    assert.equal(latest1!.history.length, 4);
    assert.equal(latest1!.history[0].operations.length, 1);
    const savedStroke = latest1!.history[0].operations[0] as StrokeOperation;
    assert.equal(savedStroke.points[0].p, 0.35);
    assert.equal(savedStroke.points[1].p, 0.92);

    // Rematch resets to round 1 choosing_word
    const rematch = await emitAck(c2, 'game:rematch');
    assert.equal(rematch.ok, true);
    await waitFor(
      () => latest1?.phase === 'choosing_word' && latest1?.currentRound === 1
    );
  } finally {
    c1.disconnect();
    c2.disconnect();
    roomManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
