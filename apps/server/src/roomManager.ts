import { randomBytes } from 'node:crypto';
import {
  BOARD_LAYOUT,
  PAWN_META,
  SeededRng,
  TILES,
  applyChallengeResult,
  applyItem,
  buyStarItem as engineBuyStarItem,
  chooseBotGoldenDiceIndex,
  chooseDice,
  createInitialGameState,
  decideBotPreRollItemIndex,
  hashSeed,
  nextTurn,
  recordChallengeSubmission,
  resolveTile,
  rollDice,
  shouldBotBuyStarItem,
  simulateBotChallengeSubmission,
  startGame,
  type ActiveChallenge,
  type BotDifficulty,
  type ChallengeSubmission,
  type EmoteId,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type LobbyPlayerInfo,
  type PawnId,
  type PlayerColorId,
  type RoomStatePayload,
} from '@doodle-dash/shared';

export interface ServerPlayerSlot {
  id: string;
  socketId: string | null;
  reconnectToken: string;
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  lastEmoteAt: number;
}

export interface RoomEmitHooks {
  emitToRoom: (roomCode: string, event: string, payload: unknown) => void;
  emitToSocket: (socketId: string, event: string, payload: unknown) => void;
}

export interface RoomInstance {
  code: string;
  hostId: string;
  rulePreset: GameModePreset;
  players: ServerPlayerSlot[];
  spectatorSocketIds: Set<string>;
  inGame: boolean;
  state: GameState | null;
  turnTimer?: ReturnType<typeof setTimeout>;
  challengeTimer?: ReturnType<typeof setTimeout>;
  botTimer?: ReturnType<typeof setTimeout>;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude I, O for readability
const ALL_PAWNS: PawnId[] = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'];
const ALL_COLORS: PlayerColorId[] = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'];

export class RoomManager {
  private readonly rooms = new Map<string, RoomInstance>();
  private readonly socketToRoom = new Map<string, { roomCode: string; playerId: string | null }>();
  private readonly socketRateLimits = new Map<string, number[]>();
  private readonly hooks: RoomEmitHooks;
  public readonly reconnectGraceMs: number;
  public readonly turnTimeoutMs: number;
  public readonly botDelayMs: number;

  constructor(
    hooks: RoomEmitHooks,
    options?: { reconnectGraceMs?: number; turnTimeoutMs?: number; botDelayMs?: number },
  ) {
    this.hooks = hooks;
    this.reconnectGraceMs = options?.reconnectGraceMs ?? 60_000;
    this.turnTimeoutMs = options?.turnTimeoutMs ?? 30_000;
    this.botDelayMs = options?.botDelayMs ?? 900;
  }

  public checkRateLimit(socketId: string, maxPerSec = 18): boolean {
    const now = Date.now();
    const list = (this.socketRateLimits.get(socketId) ?? []).filter((t) => now - t < 1000);
    if (list.length >= maxPerSec) return false;
    list.push(now);
    this.socketRateLimits.set(socketId, list);
    return true;
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Math.floor(100 + Math.random() * 899)}`;
  }

  private newId(prefix: string): string {
    return `${prefix}_${randomBytes(4).toString('hex')}`;
  }

  public getRoomStatePayload(room: RoomInstance): RoomStatePayload {
    const players: LobbyPlayerInfo[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      pawn: p.pawn,
      color: p.color,
      ready: p.ready,
      connected: p.connected,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
    }));
    return {
      roomCode: room.code,
      hostId: room.hostId,
      inGame: room.inGame,
      rulePreset: room.rulePreset,
      players,
      spectatorCount: room.spectatorSocketIds.size,
    };
  }

  private broadcastRoomState(room: RoomInstance): void {
    this.hooks.emitToRoom(room.code, 'room:state', this.getRoomStatePayload(room));
  }

  public createRoom(
    socketId: string,
    payload: { playerName: string; pawn: PawnId; color: PlayerColorId },
  ): { roomCode: string; playerId: string; reconnectToken: string } {
    const code = this.generateRoomCode();
    const playerId = this.newId('p');
    const reconnectToken = randomBytes(16).toString('hex');

    const host: ServerPlayerSlot = {
      id: playerId,
      socketId,
      reconnectToken,
      name: payload.playerName,
      pawn: payload.pawn,
      color: payload.color,
      ready: true,
      connected: true,
      isBot: false,
      botDifficulty: 'pintar',
      lastEmoteAt: 0,
    };

    const room: RoomInstance = {
      code,
      hostId: playerId,
      rulePreset: 'klasik',
      players: [host],
      spectatorSocketIds: new Set(),
      inGame: false,
      state: null,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, { roomCode: code, playerId });
    this.broadcastRoomState(room);
    return { roomCode: code, playerId, reconnectToken };
  }

  public joinRoom(
    socketId: string,
    payload: {
      roomCode: string;
      playerName: string;
      pawn: PawnId;
      color: PlayerColorId;
      reconnectToken?: string;
      asSpectator?: boolean;
    },
  ): {
    roomCode: string;
    playerId: string | null;
    reconnectToken?: string;
    reconnected?: boolean;
    asSpectator?: boolean;
  } {
    const code = payload.roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error(`Room ${code} tidak ditemukan.`);
    }

    // 1. Check reconnect token first
    if (payload.reconnectToken) {
      const existing = room.players.find((p) => p.reconnectToken === payload.reconnectToken);
      if (existing) {
        if (existing.reconnectTimer) {
          clearTimeout(existing.reconnectTimer);
          existing.reconnectTimer = undefined;
        }
        existing.socketId = socketId;
        existing.connected = true;
        existing.isBot = false;
        if (room.state) {
          const stPlayer = room.state.players.find((p) => p.id === existing.id);
          if (stPlayer) {
            stPlayer.connected = true;
            stPlayer.isBot = false;
          }
        }
        this.socketToRoom.set(socketId, { roomCode: code, playerId: existing.id });
        this.broadcastRoomState(room);
        if (room.state) {
          this.hooks.emitToSocket(socketId, 'game:snapshot', { state: room.state });
          if (room.state.activeChallenge) {
            this.hooks.emitToSocket(socketId, 'challenge:begin', {
              challenge: room.state.activeChallenge,
            });
          }
        }
        return {
          roomCode: code,
          playerId: existing.id,
          reconnectToken: existing.reconnectToken,
          reconnected: true,
        };
      }
    }

    // 2. Join as spectator if requested or game already started
    if (payload.asSpectator || room.inGame) {
      room.spectatorSocketIds.add(socketId);
      this.socketToRoom.set(socketId, { roomCode: code, playerId: null });
      this.broadcastRoomState(room);
      if (room.state) {
        this.hooks.emitToSocket(socketId, 'game:snapshot', { state: room.state });
      }
      return { roomCode: code, playerId: null, asSpectator: true };
    }

    if (room.players.length >= 6) {
      throw new Error('Room sudah penuh (maksimal 6 pemain).');
    }

    const usedPawns = new Set(room.players.map((p) => p.pawn));
    const usedColors = new Set(room.players.map((p) => p.color));
    const pawn = usedPawns.has(payload.pawn)
      ? ALL_PAWNS.find((x) => !usedPawns.has(x)) ?? payload.pawn
      : payload.pawn;
    const color = usedColors.has(payload.color)
      ? ALL_COLORS.find((x) => !usedColors.has(x)) ?? payload.color
      : payload.color;

    const playerId = this.newId('p');
    const reconnectToken = randomBytes(16).toString('hex');

    const slot: ServerPlayerSlot = {
      id: playerId,
      socketId,
      reconnectToken,
      name: payload.playerName,
      pawn,
      color,
      ready: false,
      connected: true,
      isBot: false,
      botDifficulty: 'pintar',
      lastEmoteAt: 0,
    };

    room.players.push(slot);
    this.socketToRoom.set(socketId, { roomCode: code, playerId });
    this.broadcastRoomState(room);

    return { roomCode: code, playerId, reconnectToken, reconnected: false };
  }

  private getContext(socketId: string): { room: RoomInstance; player: ServerPlayerSlot | null } {
    const link = this.socketToRoom.get(socketId);
    if (!link) throw new Error('Kamu belum bergabung ke room.');
    const room = this.rooms.get(link.roomCode);
    if (!room) throw new Error('Room sudah ditutup.');
    const player = link.playerId
      ? room.players.find((p) => p.id === link.playerId) ?? null
      : null;
    return { room, player };
  }

  public setPlayerReady(socketId: string, ready: boolean): void {
    const { room, player } = this.getContext(socketId);
    if (!player || room.inGame) return;
    player.ready = ready;
    this.broadcastRoomState(room);
  }

  public customizePlayer(
    socketId: string,
    patch: { playerName?: string; pawn?: PawnId; color?: PlayerColorId },
  ): void {
    const { room, player } = this.getContext(socketId);
    if (!player || room.inGame) return;
    if (patch.playerName) player.name = patch.playerName;
    if (patch.pawn) player.pawn = patch.pawn;
    if (patch.color) player.color = patch.color;
    this.broadcastRoomState(room);
  }

  public addBot(socketId: string, botDifficulty: BotDifficulty): void {
    const { room, player } = this.getContext(socketId);
    if (!player || player.id !== room.hostId) {
      throw new Error('Hanya host yang bisa menambah bot.');
    }
    if (room.inGame) throw new Error('Tidak bisa menambah bot saat game berlangsung.');
    if (room.players.length >= 6) throw new Error('Room sudah maksimal 6 pemain.');

    const usedPawns = new Set(room.players.map((p) => p.pawn));
    const usedColors = new Set(room.players.map((p) => p.color));
    const pawn = ALL_PAWNS.find((x) => !usedPawns.has(x)) ?? 'dino';
    const color = ALL_COLORS.find((x) => !usedColors.has(x)) ?? 'oranye';
    const baseName = PAWN_META[pawn].shortName;
    const tag = botDifficulty === 'juara' ? 'Juara' : botDifficulty === 'santai' ? 'Santai' : 'Bot';

    room.players.push({
      id: this.newId('bot'),
      socketId: null,
      reconnectToken: '',
      name: `${baseName} (${tag})`,
      pawn,
      color,
      ready: true,
      connected: true,
      isBot: true,
      botDifficulty,
      lastEmoteAt: 0,
    });
    this.broadcastRoomState(room);
  }

  public removeBot(socketId: string, botId: string): void {
    const { room, player } = this.getContext(socketId);
    if (!player || player.id !== room.hostId) {
      throw new Error('Hanya host yang bisa menghapus bot.');
    }
    if (room.inGame) throw new Error('Tidak bisa menghapus bot saat game berlangsung.');
    const target = room.players.find((p) => p.id === botId);
    if (!target || !target.isBot) {
      throw new Error('Bot tidak ditemukan di room ini.');
    }
    room.players = room.players.filter((p) => p.id !== botId);
    this.broadcastRoomState(room);
  }

  public setRoomSettings(socketId: string, rulePreset: GameModePreset): void {
    const { room, player } = this.getContext(socketId);
    if (!player || player.id !== room.hostId) {
      throw new Error('Hanya host yang bisa mengubah aturan permainan.');
    }
    if (room.inGame) throw new Error('Aturan tidak dapat diubah saat game berlangsung.');
    room.rulePreset = rulePreset;
    this.broadcastRoomState(room);
  }

  public startRoomGame(socketId: string, customSeed?: number): void {
    const { room, player } = this.getContext(socketId);
    if (!player || player.id !== room.hostId) {
      throw new Error('Hanya host yang bisa memulai permainan.');
    }
    if (room.inGame) return;
    if (room.players.length < 2) {
      throw new Error('Minimal 2 pemain untuk memulai (boleh tambah bot!).');
    }
    const allHumansReady = room.players
      .filter((p) => !p.isBot && p.id !== room.hostId)
      .every((p) => p.ready);
    if (!allHumansReady) {
      throw new Error('Tunggu semua pemain menekan tombol Siap!');
    }

    const matchSeed = customSeed ?? Math.floor(Math.random() * 1_000_000_000);
    const initial = createInitialGameState({
      matchSeed,
      board: BOARD_LAYOUT,
      rulePreset: room.rulePreset,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        pawn: p.pawn,
        color: p.color,
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
      })),
    });

    const started = startGame(initial, Date.now() + this.turnTimeoutMs);
    room.inGame = true;
    room.state = started.state;

    this.broadcastRoomState(room);
    this.hooks.emitToRoom(room.code, 'game:snapshot', { state: room.state });
    this.emitGameEvents(room, started.events);
    this.scheduleTurnActions(room);
  }

  public rematchRoom(socketId: string): void {
    const { room, player } = this.getContext(socketId);
    if (!player || player.id !== room.hostId) {
      throw new Error('Hanya host yang bisa memulai ulang.');
    }
    this.clearRoomTimers(room);
    room.inGame = false;
    room.state = null;
    for (const p of room.players) {
      p.ready = p.id === room.hostId || p.isBot;
    }
    this.broadcastRoomState(room);
  }

  private emitGameEvents(room: RoomInstance, events: GameEvent[]): void {
    if (!room.state || events.length === 0) return;
    this.hooks.emitToRoom(room.code, 'game:events', {
      stateVersion: room.state.stateVersion,
      events,
    });
  }

  private clearRoomTimers(room: RoomInstance): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.challengeTimer) clearTimeout(room.challengeTimer);
    if (room.botTimer) clearTimeout(room.botTimer);
    room.turnTimer = undefined;
    room.challengeTimer = undefined;
    room.botTimer = undefined;
  }

  private scheduleTurnActions(room: RoomInstance): void {
    this.clearRoomTimers(room);
    const state = room.state;
    if (!state || state.phase === 'GAME_OVER') return;

    const activeId = state.turnOrder[state.currentTurnIndex];
    const activePlayer = state.players.find((p) => p.id === activeId);
    if (!activePlayer) return;

    if (state.phase === 'TURN_BEGIN') {
      if (activePlayer.isBot) {
        room.botTimer = setTimeout(() => {
          this.performBotTurnRoll(room);
        }, this.botDelayMs);
      } else {
        room.turnTimer = setTimeout(() => {
          // 30-second turn timeout: auto roll!
          this.executeRoll(room, activePlayer.id);
        }, this.turnTimeoutMs);
      }
    } else if (state.phase === 'ROLL') {
      if (activePlayer.isBot) {
        room.botTimer = setTimeout(() => {
          const vals = state.pendingRoll?.diceValues ?? [1, 1];
          const choiceIdx = chooseBotGoldenDiceIndex(state, activePlayer, vals);
          this.executeSelectDice(room, activePlayer.id, choiceIdx);
        }, this.botDelayMs);
      } else {
        room.turnTimer = setTimeout(() => {
          this.executeSelectDice(room, activePlayer.id, 0);
        }, 12_000);
      }
    }
  }

  private performBotTurnRoll(room: RoomInstance): void {
    const state = room.state;
    if (!state || state.phase !== 'TURN_BEGIN') return;
    const activeId = state.turnOrder[state.currentTurnIndex];
    const active = state.players.find((p) => p.id === activeId);
    if (!active) return;

    // Smart shared bot star shop + item check
    const botRng = new SeededRng(hashSeed(state.matchSeed, state.eventSeq + 1, 'bot_pre_roll'));
    if (shouldBotBuyStarItem(state, active, botRng)) {
      const bought = engineBuyStarItem(room.state!, active.id);
      room.state = bought.state;
      this.emitGameEvents(room, bought.events);
    }

    const updatedActive = room.state!.players.find((p) => p.id === activeId);
    if (updatedActive && updatedActive.items.length > 0) {
      const chosenIdx = decideBotPreRollItemIndex(room.state!, updatedActive, botRng);
      if (chosenIdx !== null) {
        this.executeUseItem(room, updatedActive.id, chosenIdx);
      }
    }
    this.executeRoll(room, active.id);
  }

  public buyStarItem(socketId: string): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state) throw new Error('Game belum dimulai.');
    const res = engineBuyStarItem(room.state, player.id);
    room.state = res.state;
    this.emitGameEvents(room, res.events);
  }

  public useItem(socketId: string, itemIndex: number): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state) throw new Error('Game belum dimulai.');
    this.executeUseItem(room, player.id, itemIndex);
  }

  private executeUseItem(room: RoomInstance, playerId: string, itemIndex: number): void {
    if (!room.state) return;
    const res = applyItem(room.state, playerId, itemIndex);
    room.state = res.state;
    this.emitGameEvents(room, res.events);
  }

  public roll(socketId: string, forcedDice?: number): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state) throw new Error('Game belum dimulai.');
    const activeId = room.state.turnOrder[room.state.currentTurnIndex];
    if (activeId !== player.id) {
      throw new Error('Bukan giliranmu!');
    }
    // Only allow forcedDice in non-production debug mode
    const allowForced = process.env.NODE_ENV !== 'production' ? forcedDice : undefined;
    this.executeRoll(room, player.id, allowForced);
  }

  public selectDice(socketId: string, choiceIndex: 0 | 1): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state) throw new Error('Game belum dimulai.');
    this.executeSelectDice(room, player.id, choiceIndex);
  }

  private executeRoll(room: RoomInstance, playerId: string, forcedDice?: number): void {
    if (!room.state || room.state.phase !== 'TURN_BEGIN') return;
    this.clearRoomTimers(room);

    const rolled = rollDice(room.state, playerId, forcedDice);
    room.state = rolled.state;
    this.emitGameEvents(room, rolled.events);

    if (room.state.phase === 'ROLL') {
      this.scheduleTurnActions(room);
      return;
    }

    this.proceedAfterMove(room);
  }

  private executeSelectDice(room: RoomInstance, playerId: string, choiceIndex: 0 | 1): void {
    if (!room.state || room.state.phase !== 'ROLL') return;
    this.clearRoomTimers(room);

    const chosen = chooseDice(room.state, playerId, choiceIndex);
    room.state = chosen.state;
    this.emitGameEvents(room, chosen.events);
    this.proceedAfterMove(room);
  }

  private proceedAfterMove(room: RoomInstance): void {
    if (!room.state || room.state.phase !== 'TILE_CHECK') return;

    const tileRes = resolveTile(room.state, TILES, Date.now());
    room.state = tileRes.state;
    this.emitGameEvents(room, tileRes.events);

    if (room.state.phase === 'CHALLENGE' && room.state.activeChallenge) {
      const challenge = room.state.activeChallenge;
      this.hooks.emitToRoom(room.code, 'challenge:begin', { challenge });
      this.scheduleChallengeResolution(room, challenge);
    } else if (room.state.phase === 'TURN_END' || room.state.phase === 'EXTRA_ROLL') {
      const nxt = nextTurn(room.state, Date.now() + this.turnTimeoutMs);
      room.state = nxt.state;
      this.emitGameEvents(room, nxt.events);
      this.scheduleTurnActions(room);
    }
  }

  private scheduleChallengeResolution(room: RoomInstance, challenge: ActiveChallenge): void {
    // Pre-fill bot participants
    for (const pid of challenge.participantIds) {
      const p = room.state!.players.find((x) => x.id === pid);
      if (p?.isBot) {
        const botRng = new SeededRng(hashSeed(challenge.seed, pid, 'bot_srv'));
        const sub = simulateBotChallengeSubmission(challenge, pid, p.botDifficulty, botRng);
        room.state = recordChallengeSubmission(room.state!, sub);
      }
    }

    const humanParticipants = challenge.participantIds.filter((pid) => {
      const p = room.state!.players.find((x) => x.id === pid);
      return p && !p.isBot && p.connected;
    });

    if (humanParticipants.length === 0 || challenge.archetype === 'gift_trap') {
      const delay = challenge.archetype === 'gift_trap' ? 1600 : this.botDelayMs + 500;
      room.challengeTimer = setTimeout(() => {
        this.finalizeChallenge(room);
      }, delay);
      return;
    }

    // Wait up to challenge duration + grace
    const waitMs = Math.max(3500, challenge.durationMs + 2500);
    room.challengeTimer = setTimeout(() => {
      this.finalizeChallenge(room);
    }, waitMs);
  }

  public chooseDuelOpponent(socketId: string, opponentId: string): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state?.activeChallenge) return;
    const ch = room.state.activeChallenge;
    if (ch.ownerPlayerId !== player.id || ch.mode !== 'duel') return;
    const exists = room.state.players.some((p) => p.id === opponentId && p.id !== player.id);
    if (!exists) return;

    ch.opponentId = opponentId;
    ch.participantIds = [player.id, opponentId];
    // Reset submissions & re-populate bot if new opponent is bot
    ch.submissions = {};
    const opp = room.state.players.find((p) => p.id === opponentId);
    if (opp?.isBot) {
      const botRng = new SeededRng(hashSeed(ch.seed, opp.id, 'bot_srv'));
      ch.submissions[opp.id] = simulateBotChallengeSubmission(ch, opp.id, opp.botDifficulty, botRng);
    }
    this.hooks.emitToRoom(room.code, 'challenge:begin', { challenge: ch });
  }

  public submitChallenge(socketId: string, submission: Omit<ChallengeSubmission, 'playerId'> & { tileId: number }): void {
    const { room, player } = this.getContext(socketId);
    if (!player || !room.state || room.state.phase !== 'CHALLENGE' || !room.state.activeChallenge) {
      throw new Error('Tidak ada tantangan aktif.');
    }
    const ch = room.state.activeChallenge;
    if (ch.tileId !== submission.tileId) {
      throw new Error('Tile tantangan tidak cocok.');
    }
    if (!ch.participantIds.includes(player.id)) {
      throw new Error('Kamu tidak termasuk peserta tantangan ini.');
    }

    room.state = recordChallengeSubmission(room.state, {
      playerId: player.id,
      claimedSuccess: submission.claimedSuccess,
      score: submission.score,
      inputLog: submission.inputLog,
    });

    const allSubmitted = ch.participantIds.every((pid) => Boolean(room.state!.activeChallenge?.submissions[pid]));
    if (allSubmitted) {
      if (room.challengeTimer) clearTimeout(room.challengeTimer);
      this.finalizeChallenge(room);
    }
  }

  private finalizeChallenge(room: RoomInstance): void {
    if (!room.state || room.state.phase !== 'CHALLENGE') return;
    if (room.challengeTimer) {
      clearTimeout(room.challengeTimer);
      room.challengeTimer = undefined;
    }

    const res = applyChallengeResult(room.state);
    room.state = res.state;
    this.emitGameEvents(room, res.events);

    if (room.state.phase === 'GAME_OVER') {
      this.clearRoomTimers(room);
      return;
    }

    const nxt = nextTurn(room.state, Date.now() + this.turnTimeoutMs);
    room.state = nxt.state;
    this.emitGameEvents(room, nxt.events);
    this.scheduleTurnActions(room);
  }

  public sendEmote(socketId: string, emoteId: EmoteId): void {
    const { room, player } = this.getContext(socketId);
    if (!player) return;
    const now = Date.now();
    if (now - player.lastEmoteAt < 1200) {
      throw new Error('Tunggu sebentar sebelum kirim stiker lagi!');
    }
    player.lastEmoteAt = now;
    this.hooks.emitToRoom(room.code, 'emote:broadcast', {
      playerId: player.id,
      emoteId,
      sentAt: now,
    });
  }

  public handleDisconnect(socketId: string, intentionalLeave = false): void {
    const link = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    this.socketRateLimits.delete(socketId);
    if (!link) return;

    const room = this.rooms.get(link.roomCode);
    if (!room) return;

    if (room.spectatorSocketIds.has(socketId)) {
      room.spectatorSocketIds.delete(socketId);
      this.broadcastRoomState(room);
      return;
    }

    const player = room.players.find((p) => p.id === link.playerId);
    if (!player) return;

    // Lobby leave: remove completely
    if (!room.inGame) {
      room.players = room.players.filter((p) => p.id !== player.id);
      const remainingHumans = room.players.filter((p) => !p.isBot && p.connected);
      if (remainingHumans.length === 0) {
        this.clearRoomTimers(room);
        this.rooms.delete(room.code);
        return;
      }
      if (room.hostId === player.id) {
        room.hostId = remainingHumans[0].id;
      }
      this.broadcastRoomState(room);
      return;
    }

    // In-game disconnect: transfer host if needed, give 60s grace before bot takeover
    player.connected = false;
    player.socketId = null;
    if (room.state) {
      const sp = room.state.players.find((p) => p.id === player.id);
      if (sp) sp.connected = false;
    }

    if (room.hostId === player.id) {
      const nextHost = room.players.find((p) => !p.isBot && p.connected && p.id !== player.id);
      if (nextHost) room.hostId = nextHost.id;
    }

    this.broadcastRoomState(room);

    const promoteToBot = () => {
      player.isBot = true;
      player.botDifficulty = 'pintar';
      if (room.state) {
        const sp = room.state.players.find((p) => p.id === player.id);
        if (sp) {
          sp.isBot = true;
          sp.botDifficulty = 'pintar';
        }
        this.hooks.emitToRoom(room.code, 'game:snapshot', { state: room.state });
      }
      this.broadcastRoomState(room);
      // If all humans gone, clean up room
      if (room.players.every((p) => p.isBot || !p.connected)) {
        // Keep alive briefly if no connected spectators, or close when empty
        if (room.spectatorSocketIds.size === 0 && room.players.every((p) => !p.connected)) {
          this.clearRoomTimers(room);
          this.rooms.delete(room.code);
          return;
        }
      }
      if (room.state && room.state.phase !== 'GAME_OVER') {
        this.scheduleTurnActions(room);
      }
    };

    if (intentionalLeave) {
      promoteToBot();
    } else {
      player.reconnectTimer = setTimeout(promoteToBot, this.reconnectGraceMs);
    }
  }

  public getRoom(code: string): RoomInstance | undefined {
    return this.rooms.get(code.toUpperCase());
  }
}
