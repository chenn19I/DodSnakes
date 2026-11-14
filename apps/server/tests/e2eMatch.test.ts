import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { Server, type Socket as ServerSocket } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  ARCHETYPE_REGISTRY,
  ChallengeChooseOpponentSchema,
  ChallengeSubmitSchema,
  QUIZ_BANK,
  RoomCreateSchema,
  RoomJoinSchema,
  SeededRng,
  TurnRollSchema,
  TurnSelectDiceSchema,
  type ActiveChallenge,
  type GameEvent,
  type GameState,
} from '@doodle-dash/shared';
import { RoomManager } from '../src/roomManager.js';

function buildValidClientInput(ch: ActiveChallenge, playerId: string) {
  const spec = ARCHETYPE_REGISTRY[ch.archetype];
  const sim = spec.simulateBot(ch.params, 'juara', new SeededRng(ch.seed + 7));
  if (ch.archetype === 'tap_timing') {
    sim.needlePos = Number(ch.params.zoneCenter);
    sim.reactionMs = 420;
  } else if (ch.archetype === 'quick_quiz') {
    const q = QUIZ_BANK.find((x) => x.id === Number(ch.params.questionId))!;
    sim.answerIndex = q.correctIndex;
    sim.reactionMs = 520;
  } else if (
    ch.archetype === 'shadow_match' ||
    ch.archetype === 'quick_math' ||
    ch.archetype === 'stroop_color' ||
    ch.archetype === 'color_count' ||
    ch.archetype === 'odd_one_out' ||
    ch.archetype === 'pattern_next' ||
    ch.archetype === 'math_compare'
  ) {
    sim.answerIndex = Number(ch.params.correctIndex);
    sim.reactionMs = 450;
  } else if (ch.archetype === 'pair_flip') {
    const pairCount = Number(ch.params.pairCount ?? 3);
    sim.sequenceIndices = Array.from({ length: pairCount * 2 }, (_, i) => i);
    sim.extra = { pairsMatched: pairCount };
    sim.reactionMs = 2400;
  } else if (ch.archetype === 'number_order') {
    sim.sequenceIndices = [...((ch.params.expectedIndices as number[]) ?? [0, 1, 2, 3, 4])];
    sim.reactionMs = 1500;
  } else if (ch.archetype === 'bubble_pop') {
    const targetPops = Number(ch.params.targetPops ?? 5);
    sim.tapTimestamps = Array.from({ length: targetPops }, (_, i) => 400 + i * 240);
    sim.hitsTaken = 0;
    sim.extra = { goodPopped: targetPops };
    sim.reactionMs = 400;
  } else if (ch.archetype === 'rhythm_clap') {
    sim.tapTimestamps = [...((ch.params.beatTargetsMs as number[]) ?? [1050, 1900, 2750, 3600])];
    sim.reactionMs = 950;
  } else if (ch.archetype === 'balance_bar') {
    sim.tapTimestamps = [450, 1100, 1900, 2700];
    sim.hitsTaken = 0;
    sim.extra = { balanceRatio: 0.88 };
    sim.reactionMs = 450;
  } else if (ch.archetype === 'memory_doodle') {
    sim.sequenceIndices = [...(ch.params.sequence as number[])];
    sim.reactionMs = 1500;
  } else if (ch.archetype === 'spam_tap') {
    const target = Number(ch.params.targetTaps);
    sim.tapTimestamps = Array.from({ length: target + 2 }, (_, i) => 100 + i * 110);
  } else if (ch.archetype === 'swipe_dodge') {
    sim.hitsTaken = 0;
  } else if (ch.archetype === 'word_scramble') {
    sim.answerText = String(ch.params.word);
    sim.reactionMs = 700;
  } else if (ch.archetype === 'trace_line') {
    sim.pathAccuracy = 0.95;
    sim.extra = { pointsCount: 20 };
    sim.reactionMs = 900;
  } else if (ch.archetype === 'quick_duel') {
    sim.reactionMs = 200;
  } else if (ch.archetype === 'target_sum') {
    sim.sequenceIndices = [...((ch.params.validPair as number[]) ?? [0, 1])];
    sim.reactionMs = 700;
  } else if (ch.archetype === 'arrow_blitz') {
    sim.sequenceIndices = [...((ch.params.sequence as number[]) ?? [0, 1, 2, 3])];
    sim.reactionMs = 750;
  } else if (ch.archetype === 'boss_doodle') {
    const math = ch.params.math as { correctIndex: number };
    const timing = ch.params.timing as { zoneCenter: number };
    sim.extra = { mathIndex: math.correctIndex, needlePos: timing.zoneCenter };
    sim.tapTimestamps = Array.from({ length: 10 }, (_, i) => 100 + i * 110);
    sim.reactionMs = 500;
  }

  return {
    tileId: ch.tileId,
    claimedSuccess: true,
    score: 100,
    inputLog: {
      startedAt: 0,
      completedAt: Math.max(550, sim.reactionMs ?? 550),
      reactionMs: sim.reactionMs ?? 550,
      tapTimestamps: sim.tapTimestamps,
      answerIndex: sim.answerIndex,
      answerText: sim.answerText,
      sequenceIndices: sim.sequenceIndices,
      pathAccuracy: sim.pathAccuracy,
      hitsTaken: sim.hitsTaken,
      needlePos: sim.needlePos,
      extra: sim.extra,
    },
  };
}

describe('End-to-end 4-player online Socket.IO match', () => {
  it('plays a complete 4-player online match from lobby to podium without errors', async () => {
    const httpServer = http.createServer();
    const io = new Server(httpServer);
    const mgr = new RoomManager(
      {
        emitToRoom: (roomCode, event, payload) => io.to(roomCode).emit(event, payload),
        emitToSocket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
      },
      { reconnectGraceMs: 3000, turnTimeoutMs: 15_000, botDelayMs: 20 },
    );

    io.on('connection', (socket: ServerSocket) => {
      socket.on('room:create', (raw) => {
        const parsed = RoomCreateSchema.parse(raw);
        const res = mgr.createRoom(socket.id, parsed);
        void socket.join(res.roomCode);
        socket.emit('room:joined', res);
      });
      socket.on('room:join', (raw) => {
        const parsed = RoomJoinSchema.parse(raw);
        const res = mgr.joinRoom(socket.id, parsed);
        void socket.join(res.roomCode);
        socket.emit('room:joined', res);
      });
      socket.on('player:ready', (raw) => mgr.setPlayerReady(socket.id, Boolean(raw?.ready)));
      socket.on('game:start', () => mgr.startRoomGame(socket.id, 777777));
      socket.on('turn:roll', (raw) => mgr.roll(socket.id, TurnRollSchema.parse(raw ?? {}).forcedDice));
      socket.on('turn:select_dice', (raw) =>
        mgr.selectDice(socket.id, TurnSelectDiceSchema.parse(raw).choiceIndex),
      );
      socket.on('challenge:choose_opponent', (raw) =>
        mgr.chooseDuelOpponent(socket.id, ChallengeChooseOpponentSchema.parse(raw).opponentId),
      );
      socket.on('challenge:submit', (raw) =>
        mgr.submitChallenge(socket.id, ChallengeSubmitSchema.parse(raw)),
      );
      socket.on('disconnect', () => mgr.handleDisconnect(socket.id, false));
    });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const addr = httpServer.address() as { port: number };
    const url = `http://localhost:${addr.port}`;

    const clients: ClientSocket[] = [];
    const playerIds = new Map<ClientSocket, string>();
    const errors: string[] = [];
    let latestState: GameState | null = null;
    let roomCode = '';

    const connectClient = () =>
      new Promise<ClientSocket>((resolve) => {
        const c = ioClient(url, { transports: ['websocket'] });
        c.on('error', (e: { message?: string }) => errors.push(e.message ?? 'unknown'));
        c.on('connect', () => resolve(c));
        clients.push(c);
      });

    const c1 = await connectClient();
    const c2 = await connectClient();
    const c3 = await connectClient();
    const c4 = await connectClient();

    await new Promise<void>((resolve) => {
      c1.once('room:joined', (d: { roomCode: string; playerId: string }) => {
        roomCode = d.roomCode;
        playerIds.set(c1, d.playerId);
        resolve();
      });
      c1.emit('room:create', { playerName: 'Host', pawn: 'kucing', color: 'pink' });
    });

    for (const [c, name, pawn, color] of [
      [c2, 'Ani', 'kodok', 'mint'],
      [c3, 'Budi', 'bebek', 'kuning'],
      [c4, 'Caca', 'panda', 'biru'],
    ] as const) {
      await new Promise<void>((resolve) => {
        c.once('room:joined', (d: { playerId: string }) => {
          playerIds.set(c, d.playerId);
          resolve();
        });
        c.emit('room:join', { roomCode, playerName: name, pawn, color });
      });
      c.emit('player:ready', { ready: true });
    }

    const wonPromise = new Promise<GameEvent>((resolve) => {
      c1.on('game:events', ({ events }: { events: GameEvent[] }) => {
        for (const ev of events) {
          if (ev.type === 'GameWon') resolve(ev);
        }
      });
    });

    c1.on('game:snapshot', ({ state }: { state: GameState }) => {
      latestState = state;
    });

    // React to challenges & turns automatically across all 4 online sockets
    for (const c of clients) {
      c.on('challenge:begin', ({ challenge }: { challenge: ActiveChallenge }) => {
        const pid = playerIds.get(c)!;
        if (challenge.mode === 'duel' && challenge.awaitingDuelPick && pid === challenge.ownerPlayerId) {
          const oppClient = clients.find((oc) => playerIds.get(oc) !== pid)!;
          c.emit('challenge:choose_opponent', { opponentId: playerIds.get(oppClient)! });
          return;
        }
        if (!challenge.awaitingDuelPick && challenge.participantIds.includes(pid)) {
          const sub = buildValidClientInput(challenge, pid);
          c.emit('challenge:submit', sub);
        }
      });
    }

    c1.on('game:events', ({ events }: { events: GameEvent[] }) => {
      for (const ev of events) {
        if (ev.type === 'TurnStarted') {
          const targetClient = clients.find((c) => playerIds.get(c) === ev.playerId);
          targetClient?.emit('turn:roll', {});
        } else if (ev.type === 'DiceRolled' && ev.needsChoice) {
          const targetClient = clients.find((c) => playerIds.get(c) === ev.playerId);
          targetClient?.emit('turn:select_dice', { choiceIndex: 0 });
        }
      }
    });

    c1.emit('game:start');
    const wonEv = await wonPromise;
    expect(wonEv.type).toBe('GameWon');
    if (wonEv.type === 'GameWon') {
      expect(wonEv.podium).toHaveLength(4);
      expect(wonEv.podium[0].rank).toBe(1);
    }
    expect(errors).toEqual([]);
    expect(latestState).not.toBeNull();

    clients.forEach((c) => c.disconnect());
    io.close();
    httpServer.close();
  });
});
