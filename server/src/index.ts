import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import {
  AckResult,
  ClearPayload,
  FillPayload,
  RoomSettings,
  StrokeCommitPayload,
  StrokePointsPayload,
  StrokeStartPayload,
} from '@drawsomething/shared';
import { RoomManager, RoomManagerOptions } from './roomManager.js';
import { AdminAuth } from './adminAuth.js';
import { createAdminRouter } from './adminRoutes.js';
import { WordStore } from './wordStore.js';

interface SocketMeta {
  roomCode: string;
  playerToken: string;
}

export interface CreateDrawServerOptions extends RoomManagerOptions {
  wordsFilePath?: string | null;
  adminPassword?: string;
  disableLoginRateLimit?: boolean;
}

export function createDrawServer(options: CreateDrawServerOptions = {}) {
  const app = express();
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }
  app.use(cors());
  app.use(express.json());

  const wordStore =
    options.wordStore ?? new WordStore({ filePath: options.wordsFilePath });
  const adminAuth = new AdminAuth({
    password: options.adminPassword,
    disableRateLimit: options.disableLoginRateLimit,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/admin', createAdminRouter(wordStore, adminAuth));
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint no encontrado.' });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const socketMetaById = new Map<string, SocketMeta>();
  const socketsByPlayerKey = new Map<string, Set<string>>();

  const playerKey = (roomCode: string, token: string) => `${roomCode}:${token}`;

  let roomManager: RoomManager;

  const broadcastRoomState = (roomCode: string) => {
    const tokens = roomManager.getRoomPlayerTokens(roomCode);
    for (const token of tokens) {
      const view = roomManager.getStateView(roomCode, token);
      if (!view) continue;
      const socketIds = socketsByPlayerKey.get(playerKey(roomCode, token));
      if (!socketIds) continue;
      for (const sid of socketIds) {
        io.to(sid).emit('room:state', view);
      }
    }
  };

  roomManager = new RoomManager({
    ...options,
    wordStore,
    onRoomUpdated: (roomCode) => {
      broadcastRoomState(roomCode);
    },
  });

  const bindSocketToRoom = (
    socket: Socket,
    roomCode: string,
    playerToken: string
  ) => {
    const prev = socketMetaById.get(socket.id);
    if (prev) {
      socket.leave(prev.roomCode);
      const prevSet = socketsByPlayerKey.get(
        playerKey(prev.roomCode, prev.playerToken)
      );
      prevSet?.delete(socket.id);
    }

    socketMetaById.set(socket.id, { roomCode, playerToken });
    socket.join(roomCode);
    const key = playerKey(roomCode, playerToken);
    let set = socketsByPlayerKey.get(key);
    if (!set) {
      set = new Set();
      socketsByPlayerKey.set(key, set);
    }
    set.add(socket.id);
  };

  const unbindSocket = (socket: Socket) => {
    const meta = socketMetaById.get(socket.id);
    if (!meta) return null;
    socketMetaById.delete(socket.id);
    socket.leave(meta.roomCode);
    const key = playerKey(meta.roomCode, meta.playerToken);
    const set = socketsByPlayerKey.get(key);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        socketsByPlayerKey.delete(key);
      }
    }
    return meta;
  };

  io.on('connection', (socket) => {
    socket.on(
      'room:create',
      (
        payload: { playerToken: string; nickname: string; avatarColor?: string },
        ack?: (res: AckResult<{ roomCode: string }>) => void
      ) => {
        try {
          if (!payload?.playerToken) {
            ack?.({ ok: false, error: 'Token de jugador requerido.' });
            return;
          }
          const { roomCode } = roomManager.createRoom(
            payload.playerToken,
            payload.nickname ?? 'Jugador',
            payload.avatarColor
          );
          bindSocketToRoom(socket, roomCode, payload.playerToken);
          broadcastRoomState(roomCode);
          ack?.({ ok: true, data: { roomCode } });
        } catch {
          ack?.({ ok: false, error: 'Error al crear la sala.' });
        }
      }
    );

    socket.on(
      'room:join',
      (
        payload: {
          roomCode: string;
          playerToken: string;
          nickname: string;
          avatarColor?: string;
        },
        ack?: (res: AckResult<{ roomCode: string; reconnected: boolean }>) => void
      ) => {
        if (!payload?.roomCode || !payload?.playerToken) {
          ack?.({ ok: false, error: 'Código y token requeridos.' });
          return;
        }
        const res = roomManager.joinRoom(
          payload.roomCode,
          payload.playerToken,
          payload.nickname ?? 'Jugador',
          payload.avatarColor
        );
        if (!res.ok) {
          ack?.({ ok: false, error: res.error });
          return;
        }
        bindSocketToRoom(socket, res.roomCode, payload.playerToken);
        broadcastRoomState(res.roomCode);
        ack?.({
          ok: true,
          data: { roomCode: res.roomCode, reconnected: res.reconnected },
        });
      }
    );

    socket.on('room:leave', (ack?: (res: AckResult) => void) => {
      const meta = unbindSocket(socket);
      if (!meta) {
        ack?.({ ok: true });
        return;
      }
      const { deleted } = roomManager.leaveRoom(meta.roomCode, meta.playerToken);
      if (!deleted) {
        broadcastRoomState(meta.roomCode);
      }
      ack?.({ ok: true });
    });

    socket.on(
      'room:update_settings',
      (settings: Partial<RoomSettings>, ack?: (res: AckResult) => void) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.updateSettings(
          meta.roomCode,
          meta.playerToken,
          settings
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });
        broadcastRoomState(meta.roomCode);
        ack?.({ ok: true });
      }
    );

    socket.on('game:start', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.startGame(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('word:reroll', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.rerollWords(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on(
      'word:pick',
      (payload: { normalized: string }, ack?: (res: AckResult) => void) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.pickWord(
          meta.roomCode,
          meta.playerToken,
          payload?.normalized ?? ''
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });
        broadcastRoomState(meta.roomCode);
        ack?.({ ok: true });
      }
    );

    socket.on('draw:stroke_start', (payload: StrokeStartPayload) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta || !roomManager.isActiveDrawer(meta.roomCode, meta.playerToken)) {
        return;
      }
      socket.to(meta.roomCode).emit('draw:stroke_start', payload);
    });

    socket.on('draw:stroke_points', (payload: StrokePointsPayload) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta || !roomManager.isActiveDrawer(meta.roomCode, meta.playerToken)) {
        return;
      }
      socket.to(meta.roomCode).emit('draw:stroke_points', payload);
    });

    socket.on(
      'draw:stroke_commit',
      (payload: StrokeCommitPayload, ack?: (res: AckResult) => void) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.commitOperation(
          meta.roomCode,
          meta.playerToken,
          payload.operation
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });
        socket.to(meta.roomCode).emit('draw:op_committed', payload.operation);
        ack?.({ ok: true });
      }
    );

    socket.on(
      'draw:fill',
      (payload: FillPayload, ack?: (res: AckResult) => void) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.commitOperation(
          meta.roomCode,
          meta.playerToken,
          payload.operation
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });
        socket.to(meta.roomCode).emit('draw:op_committed', payload.operation);
        ack?.({ ok: true });
      }
    );

    socket.on(
      'draw:clear',
      (payload: ClearPayload, ack?: (res: AckResult) => void) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.commitOperation(
          meta.roomCode,
          meta.playerToken,
          payload.operation
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });
        broadcastRoomState(meta.roomCode);
        ack?.({ ok: true });
      }
    );

    socket.on('draw:undo', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.undo(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('draw:redo', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.redo(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('guess:use_bomb', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.useBomb(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on(
      'guess:submit',
      (
        payload: { guess: string },
        ack?: (res: AckResult<{ correct: boolean; guess: string }>) => void
      ) => {
        const meta = socketMetaById.get(socket.id);
        if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
        const res = roomManager.submitGuess(
          meta.roomCode,
          meta.playerToken,
          payload?.guess ?? ''
        );
        if (!res.ok) return ack?.({ ok: false, error: res.error });

        if (!res.correct) {
          io.to(meta.roomCode).emit('guess:wrong', {
            guess: res.normalizedGuess,
          });
        }
        broadcastRoomState(meta.roomCode);
        ack?.({
          ok: true,
          data: { correct: res.correct, guess: res.normalizedGuess },
        });
      }
    );

    socket.on('guess:give_up', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.giveUp(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('round:next', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.advanceRound(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('game:rematch', (ack?: (res: AckResult) => void) => {
      const meta = socketMetaById.get(socket.id);
      if (!meta) return ack?.({ ok: false, error: 'No estás en una sala.' });
      const res = roomManager.rematch(meta.roomCode, meta.playerToken);
      if (!res.ok) return ack?.({ ok: false, error: res.error });
      broadcastRoomState(meta.roomCode);
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const meta = unbindSocket(socket);
      if (!meta) return;
      const stillHasSocket = socketsByPlayerKey.has(
        playerKey(meta.roomCode, meta.playerToken)
      );
      if (!stillHasSocket) {
        roomManager.markDisconnected(meta.roomCode, meta.playerToken);
        broadcastRoomState(meta.roomCode);
      }
    });
  });

  // Serve built client in production when client/dist exists
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDistDir = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  return { app, server, io, roomManager, wordStore, adminAuth };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(__dirname, '../../.env');
  const loadEnvFile = (
    process as { loadEnvFile?: (filePath?: string) => void }
  ).loadEnvFile;
  if (typeof loadEnvFile === 'function' && fs.existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const port = Number(process.env.PORT ?? 3001);
  const { server, adminAuth } = createDrawServer();
  if (adminAuth.isDefaultPassword) {
    console.warn(
      '[Admin] Usando contraseña de administrador por defecto ("admin123"). Configura ADMIN_PASSWORD en producción.'
    );
  }
  server.listen(port, () => {
    console.log(`DrawSomething server listening on http://localhost:${port}`);
  });
}
