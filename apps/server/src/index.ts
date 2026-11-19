import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';
import { ZodError } from 'zod';
import {
  ChallengeChooseOpponentSchema,
  ChallengeSubmitSchema,
  EmoteSendSchema,
  ItemUseSchema,
  PlayerCustomizeSchema,
  PlayerReadySchema,
  RoomAddBotSchema,
  RoomCreateSchema,
  RoomJoinSchema,
  RoomRemoveBotSchema,
  RoomSettingsSchema,
  TurnRollSchema,
  TurnSelectDiceSchema,
} from '@doodle-dash/shared';
import { RoomManager } from './roomManager.js';

const PORT = Number(process.env.PORT ?? 3001);
const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOriginOption = corsOrigins && corsOrigins.length > 0 ? corsOrigins : '*';

const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 24);
const ipConnectionCounts = new Map<string, number>();

function resolveSocketIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : undefined;
  return (firstForwarded?.trim() || socket.handshake.address || 'unknown').slice(0, 64);
}

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss: https:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self'",
  );
  next();
});
app.use(cors({ origin: corsOriginOption }));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', game: 'DodSnakes' });
});

// Serve built client static files in production if present
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  pingTimeout: 20_000,
  pingInterval: 25_000,
  cors: {
    origin: corsOriginOption,
    methods: ['GET', 'POST'],
  },
});

io.use((socket, next) => {
  const ip = resolveSocketIp(socket);
  const current = ipConnectionCounts.get(ip) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_IP) {
    next(new Error('Terlalu banyak koneksi aktif dari alamat IP ini.'));
    return;
  }
  ipConnectionCounts.set(ip, current + 1);
  socket.data.clientIp = ip;
  next();
});

const roomManager = new RoomManager(
  {
    emitToRoom: (roomCode, event, payload) => {
      io.to(roomCode).emit(event, payload);
    },
    emitToSocket: (socketId, event, payload) => {
      io.to(socketId).emit(event, payload);
    },
  },
  {
    allowDebugDice: process.env.ALLOW_DEBUG_DICE === '1',
  },
);

function withGuard(
  socket: Socket,
  fn: () => void,
  ack?: (resp: { ok: boolean; error?: string; data?: unknown }) => void,
): void {
  if (!roomManager.checkRateLimit(socket.id)) {
    const err = { code: 'RATE_LIMIT', message: 'Terlalu cepat! Pelan-pelan ya.' };
    socket.emit('error', err);
    ack?.({ ok: false, error: err.message });
    return;
  }
  try {
    fn();
  } catch (e) {
    const message =
      e instanceof ZodError
        ? e.issues[0]?.message ?? 'Format data tidak valid.'
        : e instanceof Error
          ? e.message
          : 'Terjadi kesalahan pada server.';
    socket.emit('error', { code: 'ACTION_FAILED', message });
    roomManager.syncToSocket(socket.id);
    ack?.({ ok: false, error: message });
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', (raw, ack) => {
    withGuard(
      socket,
      () => {
        const parsed = RoomCreateSchema.parse(raw);
        const res = roomManager.createRoom(socket.id, parsed);
        void socket.join(res.roomCode);
        socket.emit('room:joined', res);
        ack?.({ ok: true, data: res });
      },
      ack,
    );
  });

  socket.on('room:join', (raw, ack) => {
    withGuard(
      socket,
      () => {
        const parsed = RoomJoinSchema.parse(raw);
        const res = roomManager.joinRoom(socket.id, parsed);
        void socket.join(res.roomCode);
        socket.emit('room:joined', res);
        ack?.({ ok: true, data: res });
      },
      ack,
    );
  });

  socket.on('player:ready', (raw) => {
    withGuard(socket, () => {
      const parsed = PlayerReadySchema.parse(raw);
      roomManager.setPlayerReady(socket.id, parsed.ready);
    });
  });

  socket.on('player:customize', (raw) => {
    withGuard(socket, () => {
      const parsed = PlayerCustomizeSchema.parse(raw);
      roomManager.customizePlayer(socket.id, parsed);
    });
  });

  socket.on('room:add_bot', (raw) => {
    withGuard(socket, () => {
      const parsed = RoomAddBotSchema.parse(raw ?? {});
      roomManager.addBot(socket.id, parsed.botDifficulty);
    });
  });

  socket.on('room:remove_bot', (raw) => {
    withGuard(socket, () => {
      const parsed = RoomRemoveBotSchema.parse(raw);
      roomManager.removeBot(socket.id, parsed.botId);
    });
  });

  socket.on('room:settings', (raw) => {
    withGuard(socket, () => {
      const parsed = RoomSettingsSchema.parse(raw);
      roomManager.setRoomSettings(socket.id, parsed.rulePreset);
    });
  });

  socket.on('game:start', () => {
    withGuard(socket, () => {
      roomManager.startRoomGame(socket.id);
    });
  });

  socket.on('room:rematch', () => {
    withGuard(socket, () => {
      roomManager.rematchRoom(socket.id);
    });
  });

  socket.on('turn:roll', (raw) => {
    withGuard(socket, () => {
      const parsed = TurnRollSchema.parse(raw ?? {});
      roomManager.roll(socket.id, parsed.forcedDice);
    });
  });

  socket.on('turn:select_dice', (raw) => {
    withGuard(socket, () => {
      const parsed = TurnSelectDiceSchema.parse(raw);
      roomManager.selectDice(socket.id, parsed.choiceIndex);
    });
  });

  socket.on('item:use', (raw) => {
    withGuard(socket, () => {
      const parsed = ItemUseSchema.parse(raw);
      roomManager.useItem(socket.id, parsed.itemIndex);
    });
  });

  socket.on('item:buy', () => {
    withGuard(socket, () => {
      roomManager.buyStarItem(socket.id);
    });
  });

  socket.on('challenge:choose_opponent', (raw) => {
    withGuard(socket, () => {
      const parsed = ChallengeChooseOpponentSchema.parse(raw);
      roomManager.chooseDuelOpponent(socket.id, parsed.opponentId);
    });
  });

  socket.on('challenge:submit', (raw) => {
    withGuard(socket, () => {
      const parsed = ChallengeSubmitSchema.parse(raw);
      roomManager.submitChallenge(socket.id, parsed);
    });
  });

  socket.on('emote:send', (raw) => {
    withGuard(socket, () => {
      const parsed = EmoteSendSchema.parse(raw);
      roomManager.sendEmote(socket.id, parsed.emoteId);
    });
  });

  socket.on('game:sync_request', () => {
    roomManager.syncToSocket(socket.id);
  });

  socket.on('room:leave', () => {
    roomManager.handleDisconnect(socket.id, true);
  });

  socket.on('disconnect', () => {
    const ip = socket.data.clientIp as string | undefined;
    if (ip) {
      const nextCount = (ipConnectionCounts.get(ip) ?? 1) - 1;
      if (nextCount <= 0) ipConnectionCounts.delete(ip);
      else ipConnectionCounts.set(ip, nextCount);
    }
    roomManager.handleDisconnect(socket.id, false);
  });
});

server.listen(PORT, () => {
  console.log(`Server DodSnakes aktif di http://localhost:${PORT}`);
});
