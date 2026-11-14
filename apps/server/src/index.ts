import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';
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

const app = express();
app.use(cors({ origin: corsOriginOption }));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', game: 'DodSnake' });
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
  cors: {
    origin: corsOriginOption,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager({
  emitToRoom: (roomCode, event, payload) => {
    io.to(roomCode).emit(event, payload);
  },
  emitToSocket: (socketId, event, payload) => {
    io.to(socketId).emit(event, payload);
  },
});

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
    const message = e instanceof Error ? e.message : 'Terjadi kesalahan pada server.';
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
    roomManager.handleDisconnect(socket.id, false);
  });
});

server.listen(PORT, () => {
  console.log(`Server DodSnake aktif di http://localhost:${PORT}`);
});
