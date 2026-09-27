// Singleton Socket.IO client. Created lazily with the current auth token so the
// server can authenticate the handshake.

import { io } from 'socket.io-client';
import { API_URL } from './client';

let socket = null;

export function getSocket() {
  const token = localStorage.getItem('bingo_token');
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
