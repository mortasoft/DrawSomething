import { io, Socket } from 'socket.io-client';
import { AckResult } from '@drawsomething/shared';

const TOKEN_STORAGE_KEY = 'drawsomething_player_token';

export function getPlayerToken(): string {
  let token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    token =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  return token;
}

export const socket: Socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

export function emitWithAck<T = undefined>(
  event: string,
  payload?: unknown
): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (payload === undefined) {
      socket.emit(event, (res: AckResult<T>) => resolve(res));
    } else {
      socket.emit(event, payload, (res: AckResult<T>) => resolve(res));
    }
  });
}
