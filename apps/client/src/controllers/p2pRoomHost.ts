import {
  ARCHETYPE_REGISTRY,
  BOARD_LAYOUT,
  ChallengeChooseOpponentSchema,
  ChallengeSubmitSchema,
  EmoteSendSchema,
  ItemUseSchema,
  PAWN_META,
  PlayerCustomizeSchema,
  PlayerReadySchema,
  RoomAddBotSchema,
  RoomCreateSchema,
  RoomJoinSchema,
  RoomRemoveBotSchema,
  RoomSettingsSchema,
  SeededRng,
  TILES,
  TurnRollSchema,
  TurnSelectDiceSchema,
  applyChallengeResult,
  applyItem,
  buyStarItem,
  chooseBotGoldenDiceIndex,
  chooseDice,
  createInitialGameState,
  decideBotPreRollItemIndex,
  hashSeed,
  nextTurn,
  recordChallengeSubmission,
  redactChallengeForClient,
  redactGameStateForClient,
  resolveTile,
  rollDice,
  selectDuelOpponent,
  shouldBotBuyStarItem,
  simulateBotChallengeSubmission,
  startGame,
  validateUsername,
  type AccessoryId,
  type BotDifficulty,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type PawnId,
  type PlayerColorId,
  type RoomCreatePayload,
  type RoomStatePayload,
} from '@doodle-dash/shared';

interface HostPlayerSlot {
  id: string;
  peerId: string | null;
  reconnectToken: string;
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  accessory: AccessoryId;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  lastEmoteAt: number;
}

export interface P2pHostOptions {
  roomCode: string;
  hostPeerId: string;
  hostCreate: RoomCreatePayload;
  emit: (event: string, payload: unknown, targetId?: string) => void;
  delayScale?: number;
  allowDebugDice?: boolean;
  maxSpectators?: number;
}

function safeTokenEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const ALL_PAWNS: PawnId[] = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'];
const ALL_COLORS: PlayerColorId[] = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'];
const BOT_ACCESSORIES: AccessoryId[] = ['scarf', 'glasses', 'headset', 'flower', 'backpack', 'crown'];

export class P2pRoomHost {
  public readonly roomCode: string;
  public readonly hostPeerId: string;
  public readonly hostPlayerId: string;
  public readonly hostReconnectToken: string;
  public readonly allowDebugDice: boolean;
  public readonly maxSpectators: number;

  private readonly emit: (event: string, payload: unknown, targetId?: string) => void;
  private readonly delayScale: number;

  private rulePreset: GameModePreset = 'klasik';
  private inGame = false;
  private players: HostPlayerSlot[] = [];
  private spectators = new Map<string, string>();
  private peerToPlayer = new Map<string, string | null>();
  private peerRateLimits = new Map<string, number[]>();
  private gameState: GameState | null = null;
  private disposed = false;

  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private challengeTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: P2pHostOptions) {
    const parsed = RoomCreateSchema.parse(options.hostCreate);
    const nameCheck = validateUsername(parsed.playerName);
    if (!nameCheck.ok) {
      throw new Error(nameCheck.error ?? 'Username tidak diizinkan.');
    }

    this.roomCode = options.roomCode.toUpperCase();
    this.hostPeerId = options.hostPeerId;
    this.emit = options.emit;
    this.delayScale = options.delayScale ?? 1;
    this.allowDebugDice =
      options.allowDebugDice ?? Boolean(options.delayScale !== undefined && options.delayScale < 1);
    this.maxSpectators = options.maxSpectators ?? 32;

    this.hostPlayerId = this.newId('p');
    this.hostReconnectToken = this.newToken();

    this.players.push({
      id: this.hostPlayerId,
      peerId: options.hostPeerId,
      reconnectToken: this.hostReconnectToken,
      name: nameCheck.sanitized,
      pawn: parsed.pawn,
      color: parsed.color,
      accessory: parsed.accessory ?? 'none',
      ready: true,
      connected: true,
      isBot: false,
      botDifficulty: 'pintar',
      lastEmoteAt: 0,
    });
    this.peerToPlayer.set(options.hostPeerId, this.hostPlayerId);
  }

  public getRoomState(): RoomStatePayload {
    return {
      roomCode: this.roomCode,
      hostId: this.hostPlayerId,
      inGame: this.inGame,
      rulePreset: this.rulePreset,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        pawn: p.pawn,
        color: p.color,
        accessory: p.accessory,
        ready: p.ready,
        connected: p.connected,
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
      })),
      spectatorCount: this.spectators.size,
    };
  }

  public getGameState(): GameState | null {
    return this.gameState;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    this.emit('room:closed', { reason: 'Host menutup room.' }, '*');
  }

  public checkPeerRateLimit(senderId: string, maxPerSec = 18): boolean {
    const now = Date.now();
    if (this.peerRateLimits.size > 500) {
      for (const [pid, times] of this.peerRateLimits.entries()) {
        if (times.length === 0 || now - times[times.length - 1] > 10_000) {
          this.peerRateLimits.delete(pid);
        }
      }
    }
    const list = (this.peerRateLimits.get(senderId) ?? []).filter((t) => now - t < 1000);
    if (list.length >= maxPerSec) return false;
    list.push(now);
    this.peerRateLimits.set(senderId, list);
    return true;
  }

  public handlePeerMessage(senderId: string, event: string, rawPayload: unknown): void {
    if (this.disposed) return;
    if (!senderId || typeof senderId !== 'string' || senderId.length > 64) return;
    if (!this.checkPeerRateLimit(senderId)) {
      this.emit(
        'error',
        { code: 'RATE_LIMIT', message: 'Terlalu cepat! Pelan-pelan ya.' },
        senderId,
      );
      return;
    }
    try {
      switch (event) {
        case 'rpc:join':
          this.handleJoin(senderId, rawPayload);
          break;
        case 'rpc:sync_request':
          this.emit('room:state', this.getRoomState(), senderId);
          if (this.gameState) {
            this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, senderId);
          }
          break;
        case 'player:ready': {
          const parsed = PlayerReadySchema.parse(rawPayload);
          this.setPlayerReady(senderId, parsed.ready);
          break;
        }
        case 'player:customize': {
          const parsed = PlayerCustomizeSchema.parse(rawPayload);
          this.customizePlayer(senderId, parsed);
          break;
        }
        case 'room:add_bot': {
          const parsed = RoomAddBotSchema.parse(rawPayload ?? {});
          this.addBot(senderId, parsed.botDifficulty);
          break;
        }
        case 'room:remove_bot': {
          const parsed = RoomRemoveBotSchema.parse(rawPayload);
          this.removeBot(senderId, parsed.botId);
          break;
        }
        case 'room:settings': {
          const parsed = RoomSettingsSchema.parse(rawPayload);
          this.setRoomSettings(senderId, parsed.rulePreset);
          break;
        }
        case 'game:start':
          this.startRoomGame(senderId);
          break;
        case 'room:rematch':
          this.rematchRoom(senderId);
          break;
        case 'turn:roll': {
          const parsed = TurnRollSchema.parse(rawPayload ?? {});
          this.roll(senderId, parsed.forcedDice);
          break;
        }
        case 'turn:select_dice': {
          const parsed = TurnSelectDiceSchema.parse(rawPayload);
          this.selectDice(senderId, parsed.choiceIndex);
          break;
        }
        case 'item:use': {
          const parsed = ItemUseSchema.parse(rawPayload);
          this.useItem(senderId, parsed.itemIndex);
          break;
        }
        case 'item:buy':
          this.buyStar(senderId);
          break;
        case 'challenge:choose_opponent': {
          const parsed = ChallengeChooseOpponentSchema.parse(rawPayload);
          this.chooseDuelOpponent(senderId, parsed.opponentId);
          break;
        }
        case 'challenge:submit': {
          const parsed = ChallengeSubmitSchema.parse(rawPayload);
          this.submitChallenge(senderId, parsed);
          break;
        }
        case 'emote:send': {
          const parsed = EmoteSendSchema.parse(rawPayload);
          this.sendEmote(senderId, parsed.emoteId);
          break;
        }
        case 'game:sync_request':
          if (this.inGame && this.gameState) {
            this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, senderId);
          }
          break;
        case 'room:leave':
          this.handlePeerLeave(senderId);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aksi gagal diproses.';
      this.emit('error', { code: 'ACTION_FAILED', message }, senderId);
      if (this.inGame && this.gameState) {
        this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, senderId);
      }
    }
  }

  private handleJoin(senderId: string, rawPayload: unknown): void {
    const parsed = RoomJoinSchema.parse(rawPayload);
    if (parsed.roomCode !== this.roomCode) {
      this.emit('error', { code: 'NOT_FOUND', message: `Room "${parsed.roomCode}" tidak ditemukan.` }, senderId);
      return;
    }

    const nameCheck = validateUsername(parsed.playerName);
    if (!nameCheck.ok) {
      throw new Error(nameCheck.error ?? 'Username tidak diizinkan.');
    }

    const existingByPeer = this.peerToPlayer.get(senderId);
    if (existingByPeer) {
      const slot = this.players.find((p) => p.id === existingByPeer);
      if (slot) {
        slot.connected = true;
        slot.peerId = senderId;
        this.sendJoinSuccess(senderId, slot.id, slot.reconnectToken, true);
        return;
      }
    }

    if (parsed.reconnectToken) {
      const reconnectSlot = this.players.find((p) =>
        safeTokenEquals(p.reconnectToken, parsed.reconnectToken!),
      );
      if (reconnectSlot) {
        reconnectSlot.peerId = senderId;
        reconnectSlot.connected = true;
        this.peerToPlayer.set(senderId, reconnectSlot.id);
        this.broadcastRoomState();
        this.sendJoinSuccess(senderId, reconnectSlot.id, reconnectSlot.reconnectToken, true);
        return;
      }
    }

    if (this.inGame || parsed.asSpectator || this.players.length >= 6) {
      if (!this.spectators.has(senderId) && this.spectators.size >= this.maxSpectators) {
        throw new Error('Kursi penonton di room ini sudah penuh.');
      }
      this.spectators.set(senderId, nameCheck.sanitized);
      this.peerToPlayer.set(senderId, null);
      this.broadcastRoomState();
      this.sendJoinSuccess(senderId, null, '', false);
      return;
    }

    const usedPawns = new Set(this.players.map((p) => p.pawn));
    const usedColors = new Set(this.players.map((p) => p.color));
    const pawn = usedPawns.has(parsed.pawn)
      ? ALL_PAWNS.find((x) => !usedPawns.has(x)) ?? parsed.pawn
      : parsed.pawn;
    const color = usedColors.has(parsed.color)
      ? ALL_COLORS.find((x) => !usedColors.has(x)) ?? parsed.color
      : parsed.color;

    const playerId = this.newId('p');
    const reconnectToken = this.newToken();
    this.players.push({
      id: playerId,
      peerId: senderId,
      reconnectToken,
      name: nameCheck.sanitized,
      pawn,
      color,
      accessory: parsed.accessory ?? 'none',
      ready: false,
      connected: true,
      isBot: false,
      botDifficulty: 'pintar',
      lastEmoteAt: 0,
    });
    this.peerToPlayer.set(senderId, playerId);
    this.broadcastRoomState();
    this.sendJoinSuccess(senderId, playerId, reconnectToken, false);
  }

  private sendJoinSuccess(
    targetPeerId: string,
    playerId: string | null,
    reconnectToken: string,
    reconnected: boolean,
  ): void {
    this.emit(
      'room:joined',
      {
        roomCode: this.roomCode,
        playerId,
        reconnectToken,
        reconnected,
        roomState: this.getRoomState(),
        gameState: this.gameState ? redactGameStateForClient(this.gameState) : null,
      },
      targetPeerId,
    );
  }

  private getSlot(senderId: string): HostPlayerSlot {
    const pid = this.peerToPlayer.get(senderId);
    if (!pid) {
      throw new Error('Hanya pemain aktif di room yang bisa melakukan aksi ini.');
    }
    const slot = this.players.find((p) => p.id === pid);
    if (!slot) {
      throw new Error('Pemain tidak ditemukan di room.');
    }
    return slot;
  }

  private setPlayerReady(senderId: string, ready: boolean): void {
    if (this.inGame) return;
    const slot = this.getSlot(senderId);
    slot.ready = ready;
    this.broadcastRoomState();
  }

  private customizePlayer(
    senderId: string,
    patch: { playerName?: string; pawn?: PawnId; color?: PlayerColorId; accessory?: AccessoryId },
  ): void {
    if (this.inGame) return;
    const slot = this.getSlot(senderId);
    if (patch.playerName !== undefined) {
      const check = validateUsername(patch.playerName);
      if (!check.ok) throw new Error(check.error ?? 'Username tidak diizinkan.');
      slot.name = check.sanitized;
    }
    if (patch.pawn) slot.pawn = patch.pawn;
    if (patch.color) slot.color = patch.color;
    if (patch.accessory !== undefined) slot.accessory = patch.accessory;
    this.broadcastRoomState();
  }

  private addBot(senderId: string, botDifficulty: BotDifficulty): void {
    const slot = this.getSlot(senderId);
    if (slot.id !== this.hostPlayerId) throw new Error('Hanya host yang bisa menambah bot.');
    if (this.inGame) throw new Error('Tidak bisa menambah bot saat game berlangsung.');
    if (this.players.length >= 6) throw new Error('Room sudah maksimal 6 pemain.');

    const usedPawns = new Set(this.players.map((p) => p.pawn));
    const usedColors = new Set(this.players.map((p) => p.color));
    const pawn = ALL_PAWNS.find((x) => !usedPawns.has(x)) ?? 'dino';
    const color = ALL_COLORS.find((x) => !usedColors.has(x)) ?? 'oranye';
    const accessory = BOT_ACCESSORIES[this.players.length % BOT_ACCESSORIES.length];
    const baseName = PAWN_META[pawn].shortName;
    const tag = botDifficulty === 'juara' ? 'Juara' : botDifficulty === 'santai' ? 'Santai' : 'Bot';

    this.players.push({
      id: this.newId('bot'),
      peerId: null,
      reconnectToken: '',
      name: `${baseName} (${tag})`,
      pawn,
      color,
      accessory,
      ready: true,
      connected: true,
      isBot: true,
      botDifficulty,
      lastEmoteAt: 0,
    });
    this.broadcastRoomState();
  }

  private removeBot(senderId: string, botId: string): void {
    const slot = this.getSlot(senderId);
    if (slot.id !== this.hostPlayerId) throw new Error('Hanya host yang bisa menghapus bot.');
    if (this.inGame) throw new Error('Tidak bisa menghapus bot saat game berlangsung.');
    const idx = this.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      this.broadcastRoomState();
    }
  }

  private setRoomSettings(senderId: string, preset: GameModePreset): void {
    const slot = this.getSlot(senderId);
    if (slot.id !== this.hostPlayerId) throw new Error('Hanya host yang bisa mengubah aturan.');
    if (this.inGame) throw new Error('Tidak bisa mengubah aturan saat game berlangsung.');
    this.rulePreset = preset;
    this.broadcastRoomState();
  }

  private startRoomGame(senderId: string): void {
    const slot = this.getSlot(senderId);
    if (slot.id !== this.hostPlayerId) throw new Error('Hanya host yang bisa memulai game.');
    if (this.inGame) return;
    if (this.players.length < 2) {
      throw new Error('Butuh minimal 2 pemain atau bot untuk memulai.');
    }
    const notReady = this.players.find((p) => !p.isBot && p.id !== this.hostPlayerId && !p.ready);
    if (notReady) {
      throw new Error(`${notReady.name} belum menekan Siap.`);
    }

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const init = createInitialGameState({
      matchSeed: seed,
      board: BOARD_LAYOUT,
      rulePreset: this.rulePreset,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        pawn: p.pawn,
        color: p.color,
        accessory: p.accessory,
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
      })),
    });
    const started = startGame(init, Date.now() + 28_000);
    this.gameState = started.state;
    this.inGame = true;
    this.broadcastRoomState();
    this.emit('game:started', { state: redactGameStateForClient(started.state) }, '*');
    this.scheduleTurnOrBot();
  }

  private rematchRoom(senderId: string): void {
    const slot = this.getSlot(senderId);
    if (slot.id !== this.hostPlayerId) throw new Error('Hanya host yang bisa mulai ulang.');
    this.clearTimers();
    this.inGame = false;
    this.gameState = null;
    for (const p of this.players) {
      p.ready = true;
    }
    this.startRoomGame(senderId);
  }

  private roll(senderId: string, forcedDice?: number): void {
    if (!this.gameState || !this.inGame) return;
    const slot = this.getSlot(senderId);
    const activeId = this.gameState.turnOrder[this.gameState.currentTurnIndex];
    if (activeId !== slot.id) {
      throw new Error('Bukan giliranmu!');
    }
    if (this.gameState.phase !== 'TURN_BEGIN') {
      throw new Error('Belum siap lempar dadu pada fase ini.');
    }
    this.clearTimers();
    const allowForced = this.allowDebugDice ? forcedDice : undefined;
    const res = rollDice(this.gameState, slot.id, allowForced);
    this.gameState = res.state;
    this.emitGameEvents(res.events);
    this.afterMoveEvents(res.events);
  }

  private selectDice(senderId: string, choiceIndex: 0 | 1): void {
    if (!this.gameState || !this.inGame) return;
    const slot = this.getSlot(senderId);
    const res = chooseDice(this.gameState, slot.id, choiceIndex);
    this.gameState = res.state;
    this.emitGameEvents(res.events);
    this.afterMoveEvents(res.events);
  }

  private useItem(senderId: string, itemIndex: number): void {
    if (!this.gameState || !this.inGame) return;
    const slot = this.getSlot(senderId);
    const res = applyItem(this.gameState, slot.id, itemIndex);
    this.gameState = res.state;
    this.emitGameEvents(res.events);
  }

  private buyStar(senderId: string): void {
    if (!this.gameState || !this.inGame) return;
    const slot = this.getSlot(senderId);
    const res = buyStarItem(this.gameState, slot.id);
    this.gameState = res.state;
    this.emitGameEvents(res.events);
  }

  private chooseDuelOpponent(senderId: string, opponentId: string): void {
    if (!this.gameState || !this.inGame || !this.gameState.activeChallenge) return;
    const slot = this.getSlot(senderId);
    const ch = this.gameState.activeChallenge;
    if (ch.mode !== 'duel' || ch.ownerPlayerId !== slot.id) return;
    if (!ch.awaitingDuelPick && Object.keys(ch.submissions).length > 0) return;
    if (opponentId === slot.id) return;
    const exists = this.gameState.players.some((p) => p.id === opponentId);
    if (!exists) return;

    this.gameState = selectDuelOpponent(this.gameState, slot.id, opponentId, Date.now());
    const updated = this.gameState.activeChallenge!;
    this.emit('challenge:begin', { challenge: redactChallengeForClient(updated) }, '*');
    this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, '*');
    this.scheduleChallengeResolution();
  }

  private submitChallenge(
    senderId: string,
    submission: {
      tileId: number;
      claimedSuccess: boolean;
      score: number;
      inputLog: Parameters<typeof recordChallengeSubmission>[1]['inputLog'];
    },
  ): void {
    if (!this.gameState || !this.inGame) return;
    const slot = this.getSlot(senderId);
    const ch = this.gameState.activeChallenge;
    if (!ch || ch.tileId !== submission.tileId || ch.awaitingDuelPick) return;
    const allowedParticipant =
      ch.participantIds.includes(slot.id) &&
      (ch.mode === 'duel'
        ? slot.id === ch.ownerPlayerId || slot.id === ch.opponentId
        : ch.mode === 'solo'
          ? slot.id === ch.ownerPlayerId
          : true);
    if (!allowedParticipant || ch.submissions[slot.id]) return;

    this.gameState = recordChallengeSubmission(this.gameState, {
      playerId: slot.id,
      claimedSuccess: submission.claimedSuccess,
      score: submission.score,
      inputLog: submission.inputLog,
    });
    this.emit('challenge:submitted', { playerId: slot.id }, '*');

    const chAfter = this.gameState.activeChallenge;
    if (chAfter && chAfter.participantIds.every((pid) => Boolean(chAfter.submissions[pid]))) {
      this.finalizeChallenge();
    }
  }

  private sendEmote(senderId: string, emoteId: string): void {
    const slot = this.getSlot(senderId);
    const now = Date.now();
    if (now - slot.lastEmoteAt < 1800) return;
    slot.lastEmoteAt = now;
    this.emit('emote:received', { playerId: slot.id, emoteId }, '*');
  }

  private handlePeerLeave(senderId: string): void {
    if (senderId === this.hostPeerId) {
      this.dispose();
      return;
    }
    this.peerRateLimits.delete(senderId);
    const playerId = this.peerToPlayer.get(senderId);
    this.peerToPlayer.delete(senderId);
    if (playerId === undefined) return;
    if (playerId === null) {
      this.spectators.delete(senderId);
      this.broadcastRoomState();
      return;
    }
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    if (!this.inGame) {
      this.players.splice(idx, 1);
      this.broadcastRoomState();
      return;
    }

    const slot = this.players[idx];
    slot.connected = false;
    slot.peerId = null;
    slot.isBot = true;
    if (this.gameState) {
      this.gameState = {
        ...this.gameState,
        players: this.gameState.players.map((p) =>
          p.id === slot.id ? { ...p, isBot: true, connected: false } : p,
        ),
      };
      this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, '*');
    }
    this.broadcastRoomState();
    this.scheduleTurnOrBot();
  }

  private afterMoveEvents(events: GameEvent[]): void {
    if (!this.gameState) return;
    if (this.gameState.phase === 'GAME_OVER') {
      this.clearTimers();
      return;
    }

    const moved = events.find((e) => e.type === 'PawnMoved');
    if (moved && this.gameState.phase === 'TILE_CHECK') {
      const delay = 520 * this.delayScale;
      this.turnTimer = globalThis.setTimeout(() => {
        if (this.disposed || !this.gameState) return;
        const resolved = resolveTile(this.gameState, TILES, Date.now());
        this.gameState = resolved.state;
        this.emitGameEvents(resolved.events);

        if (this.gameState.phase === 'CHALLENGE' && this.gameState.activeChallenge) {
          this.scheduleChallengeResolution();
        } else if (this.gameState.phase === 'TURN_END' || this.gameState.phase === 'EXTRA_ROLL') {
          this.advanceTurnAfterDelay();
        } else {
          this.scheduleTurnOrBot();
        }
      }, delay);
      return;
    }

    this.scheduleTurnOrBot();
  }

  private scheduleChallengeResolution(): void {
    if (this.challengeTimer !== null) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
    if (this.disposed || !this.gameState?.activeChallenge) return;
    const ch = this.gameState.activeChallenge;

    if (ch.mode === 'duel' && ch.awaitingDuelPick) {
      const owner = this.gameState.players.find((p) => p.id === ch.ownerPlayerId);
      const pickTimeoutMs = (owner?.isBot ? 650 : 12_000) * this.delayScale;
      this.challengeTimer = globalThis.setTimeout(() => {
        if (this.disposed || !this.gameState?.activeChallenge?.awaitingDuelPick) return;
        this.gameState = selectDuelOpponent(this.gameState, ch.ownerPlayerId, undefined, Date.now());
        const updated = this.gameState.activeChallenge!;
        this.emit('challenge:begin', { challenge: redactChallengeForClient(updated) }, '*');
        this.emit('game:sync', { state: redactGameStateForClient(this.gameState) }, '*');
        this.scheduleChallengeResolution();
      }, pickTimeoutMs);
      return;
    }

    const spec = ARCHETYPE_REGISTRY[ch.archetype];

    // Pre-populate any bot participants cleanly
    let botChanged = false;
    for (const pid of ch.participantIds) {
      const player = this.gameState.players.find((p) => p.id === pid);
      if (!player?.isBot || ch.submissions[pid]) continue;
      const botRng = new SeededRng(hashSeed(ch.seed, pid, 'p2p_bot'));
      ch.submissions[pid] = simulateBotChallengeSubmission(ch, pid, player.botDifficulty, botRng);
      botChanged = true;
    }

    if (botChanged && ch.participantIds.every((pid) => Boolean(ch.submissions[pid]))) {
      this.challengeTimer = globalThis.setTimeout(() => {
        this.finalizeChallenge();
      }, 650 * this.delayScale);
      return;
    }

    const durationMs = Math.max(3000, (ch.durationMs || spec.baseDurationMs) + 3000) * this.delayScale;
    this.challengeTimer = globalThis.setTimeout(() => {
      if (this.disposed || !this.gameState?.activeChallenge) return;
      this.finalizeChallenge();
    }, durationMs);
  }

  private finalizeChallenge(): void {
    if (this.disposed || !this.gameState?.activeChallenge) return;
    if (this.challengeTimer !== null) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
    const res = applyChallengeResult(this.gameState);
    this.gameState = res.state;
    this.emitGameEvents(res.events);
    if (this.gameState.phase === 'GAME_OVER') {
      this.clearTimers();
      return;
    }
    this.advanceTurnAfterDelay();
  }

  private advanceTurnAfterDelay(): void {
    if (this.disposed || !this.gameState) return;
    const delay = 480 * this.delayScale;
    this.turnTimer = globalThis.setTimeout(() => {
      if (this.disposed || !this.gameState || this.gameState.phase === 'GAME_OVER') return;
      const nxt = nextTurn(this.gameState, Date.now() + 28_000);
      this.gameState = nxt.state;
      this.emitGameEvents(nxt.events);
      this.scheduleTurnOrBot();
    }, delay);
  }

  private scheduleTurnOrBot(): void {
    this.clearTimers();
    if (this.disposed || !this.gameState || !this.inGame || this.gameState.phase === 'GAME_OVER') {
      return;
    }

    if (this.gameState.phase === 'CHALLENGE' && this.gameState.activeChallenge) {
      this.scheduleChallengeResolution();
      return;
    }

    const activeId = this.gameState.turnOrder[this.gameState.currentTurnIndex];
    const active = this.gameState.players.find((p) => p.id === activeId);
    if (!active) return;

    if (active.isBot) {
      this.botTimer = globalThis.setTimeout(() => {
        this.runBotTurn(active.id);
      }, 650 * this.delayScale);
      return;
    }

    this.turnTimer = globalThis.setTimeout(() => {
      if (this.disposed || !this.gameState) return;
      const curId = this.gameState.turnOrder[this.gameState.currentTurnIndex];
      if (curId !== activeId) return;
      if (this.gameState.phase === 'TURN_BEGIN') {
        const res = rollDice(this.gameState, activeId);
        this.gameState = res.state;
        this.emitGameEvents(res.events);
        this.afterMoveEvents(res.events);
      } else if (this.gameState.phase === 'ROLL' && this.gameState.pendingRoll) {
        const res = chooseDice(this.gameState, activeId, 0);
        this.gameState = res.state;
        this.emitGameEvents(res.events);
        this.afterMoveEvents(res.events);
      }
    }, 30_000);
  }

  private runBotTurn(botId: string): void {
    if (this.disposed || !this.gameState || this.gameState.phase === 'GAME_OVER') return;
    const state = this.gameState;
    const bot = state.players.find((p) => p.id === botId);
    if (!bot) return;

    if (state.phase === 'ROLL' && state.pendingRoll) {
      const idx = chooseBotGoldenDiceIndex(state, bot, state.pendingRoll.diceValues);
      const res = chooseDice(state, botId, idx);
      this.gameState = res.state;
      this.emitGameEvents(res.events);
      this.afterMoveEvents(res.events);
      return;
    }

    if (state.phase === 'TURN_BEGIN') {
      const turnRng = new SeededRng(hashSeed(state.matchSeed, state.turnNumber, bot.id, 'p2p_turn'));
      if (shouldBotBuyStarItem(state, bot, turnRng)) {
        const bought = buyStarItem(state, botId);
        this.gameState = bought.state;
        this.emitGameEvents(bought.events);
      }
      const updatedBot = this.gameState.players.find((p) => p.id === botId) ?? bot;
      const itemIdx = decideBotPreRollItemIndex(this.gameState, updatedBot, turnRng);
      if (itemIdx !== null) {
        const used = applyItem(this.gameState, botId, itemIdx);
        this.gameState = used.state;
        this.emitGameEvents(used.events);
      }
      const rolled = rollDice(this.gameState, botId);
      this.gameState = rolled.state;
      this.emitGameEvents(rolled.events);
      if (this.gameState.phase === 'ROLL' && this.gameState.pendingRoll) {
        this.botTimer = globalThis.setTimeout(() => {
          this.runBotTurn(botId);
        }, 420 * this.delayScale);
        return;
      }
      this.afterMoveEvents(rolled.events);
    }
  }

  private broadcastRoomState(): void {
    this.emit('room:state', this.getRoomState(), '*');
  }

  private emitGameEvents(events: GameEvent[]): void {
    if (!this.gameState) return;
    const clientState = redactGameStateForClient(this.gameState);
    this.emit(
      'game:events',
      {
        turnNumber: this.gameState.turnNumber,
        events,
        activeChallenge: clientState.activeChallenge,
        state: clientState,
      },
      '*',
    );
  }

  private clearTimers(): void {
    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.challengeTimer !== null) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  private newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private newToken(): string {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return `tok_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  }
}
