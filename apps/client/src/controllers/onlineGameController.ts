import { io, type Socket } from 'socket.io-client';
import {
  PAWN_META,
  validateUsername,
  type AccessoryId,
  type ActiveChallenge,
  type BotDifficulty,
  type ChallengeSubmission,
  type EmoteId,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type PawnId,
  type PlayerColorId,
  type RoomStatePayload,
} from '@doodle-dash/shared';
import type { DoodleSceneManager } from '../scene/sceneManager.js';
import type { GameSessionController, SessionCallbacks } from './gameTypes.js';
import { RoomRelayChannel } from './realtimeTransport.js';
import { P2pRoomHost } from './p2pRoomHost.js';

const SESSION_STORAGE_KEY = 'dodsnake_online_session_v1';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

interface StoredSession {
  roomCode: string;
  reconnectToken: string;
  playerId: string | null;
  transport?: 'socketio' | 'relay';
}

export type OnlineTransportMode = 'socketio' | 'relay';

export class OnlineGameController implements GameSessionController {
  public readonly mode = 'online' as const;

  private readonly scene: DoodleSceneManager;
  private readonly callbacks: SessionCallbacks;
  private socket: Socket | null = null;
  private relay: RoomRelayChannel | null = null;
  private p2pHost: P2pRoomHost | null = null;
  private peerId = `peer_${Math.random().toString(36).slice(2, 10)}`;

  private transportMode: OnlineTransportMode;
  private relayStatus: 'connecting' | 'connected' | 'local_only' | 'closed' = 'connecting';
  private roomCode = '';
  private roomState: RoomStatePayload | null = null;
  private state: GameState | null = null;
  private localPlayerId: string | null = null;
  private spectator = false;
  private disposed = false;
  private joinedAcked = false;
  private joinRetryTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private stampCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private activeStampChallengeKey: string | null = null;

  private eventQueue: Promise<void> = Promise.resolve();

  constructor(scene: DoodleSceneManager, callbacks: SessionCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.transportMode = OnlineGameController.hasConfiguredServer() ? 'socketio' : 'relay';
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  public static getServerUrl(): string {
    const queryUrl =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('server') : null;
    if (queryUrl && queryUrl.trim().length > 0) return queryUrl.trim();
    const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) return envUrl.trim();
    if (typeof window !== 'undefined') {
      const { hostname, port, origin, protocol } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port === '3001' ? origin : `${protocol}//${hostname}:3001`;
      }
    }
    return '';
  }

  public static hasConfiguredServer(): boolean {
    const queryUrl =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('server') : null;
    if (queryUrl && queryUrl.trim().length > 0) return true;
    const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) return true;
    if (typeof window !== 'undefined') {
      return window.location.port === '3001';
    }
    return false;
  }

  public getTransportMode(): OnlineTransportMode {
    return this.transportMode;
  }

  public getConnectionLabel(): 'socketio' | 'connected' | 'local_only' | 'connecting' | 'closed' {
    if (this.transportMode === 'socketio') return 'socketio';
    return this.relayStatus;
  }

  public static getSavedSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  public static clearSavedSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  private readonly handleBeforeUnload = (): void => {
    if (this.p2pHost) {
      this.p2pHost.dispose();
    } else if (this.relay) {
      this.relay.send('room:leave', {});
    }
  };

  private saveSession(
    roomCode: string,
    reconnectToken: string,
    playerId: string | null,
    transport: OnlineTransportMode,
  ): void {
    if (!reconnectToken) return;
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode, reconnectToken, playerId, transport }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  private generateRoomCode(): string {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  private async resolvePreferredTransport(): Promise<OnlineTransportMode> {
    if (OnlineGameController.hasConfiguredServer()) {
      return 'socketio';
    }
    if (typeof window !== 'undefined') {
      const { hostname } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const candidate = OnlineGameController.getServerUrl();
        if (candidate) {
          try {
            const ctrl = new AbortController();
            const t = globalThis.setTimeout(() => ctrl.abort(), 250);
            const res = await fetch(`${candidate}/health`, { signal: ctrl.signal });
            globalThis.clearTimeout(t);
            if (res.ok) {
              return 'socketio';
            }
          } catch {
            // Fall back smoothly to serverless P2P relay when local backend is not running
          }
        }
      }
    }
    return 'relay';
  }

  private setupSocketConnection(serverUrl: string): Socket {
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 6000,
    });
    this.socket = socket;

    socket.on('room:joined', (payload) => this.handleRoomJoined(payload, 'socketio'));
    socket.on('room:state', (room: RoomStatePayload) => this.handleRoomState(room));
    socket.on('game:started', (payload: { state: GameState }) => this.handleGameStarted(payload.state));
    socket.on('game:events', (payload) => this.enqueueGameEvents(payload));
    socket.on('game:sync', (payload: { state: GameState }) => {
      this.state = payload.state;
      this.callbacks.onStateChange(payload.state);
      this.scene.syncPlayersFromState(payload.state);
    });
    socket.on('emote:received', (payload: { playerId: string; emoteId: EmoteId }) => {
      this.callbacks.onEmote(payload.playerId, payload.emoteId);
    });
    socket.on('error', (err: { message?: string }) => {
      this.clearJoinTimers();
      this.callbacks.onError(err?.message ?? 'Terjadi kesalahan pada server.');
    });
    socket.on('connect_error', () => {
      this.clearJoinTimers();
      this.callbacks.onError('Gagal terhubung ke server.');
    });

    return socket;
  }

  private handleRoomJoined(
    payload: {
      roomCode: string;
      playerId: string | null;
      reconnectToken: string;
      reconnected: boolean;
      roomState?: RoomStatePayload;
      gameState?: GameState | null;
    },
    transport: OnlineTransportMode,
  ): void {
    this.joinedAcked = true;
    this.clearJoinTimers();
    this.roomCode = payload.roomCode;
    this.localPlayerId = payload.playerId;
    this.spectator = !payload.playerId;
    if (payload.reconnectToken) {
      this.saveSession(payload.roomCode, payload.reconnectToken, payload.playerId, transport);
    }
    if (payload.roomState) {
      this.handleRoomState(payload.roomState);
    }
    if (payload.gameState) {
      this.handleGameStarted(payload.gameState);
    }
  }

  private handleRoomState(room: RoomStatePayload): void {
    this.roomState = room;
    this.callbacks.onRoomState?.(room);
  }

  private handleGameStarted(state: GameState): void {
    this.state = state;
    this.activeStampChallengeKey = null;
    if (this.stampCloseTimer !== null) {
      clearTimeout(this.stampCloseTimer);
      this.stampCloseTimer = null;
    }
    this.callbacks.onChallengeClose();
    this.callbacks.onStateChange(state);
    this.scene.syncPlayersFromState(state);
  }

  private enqueueGameEvents(payload: {
    turnNumber: number;
    events: GameEvent[];
    activeChallenge: ActiveChallenge | null;
    state?: GameState;
  }): void {
    this.eventQueue = this.eventQueue.then(() => this.processGameEvents(payload));
  }

  private async processGameEvents(payload: {
    turnNumber: number;
    events: GameEvent[];
    activeChallenge: ActiveChallenge | null;
    state?: GameState;
  }): Promise<void> {
    if (this.disposed) return;

    if (payload.state) {
      this.state = payload.state;
    } else if (this.state) {
      this.applyEventsLocallyForSnapshot(payload.events, payload.turnNumber, payload.activeChallenge);
    }

    const challengeStarted = payload.events.find((e) => e.type === 'ChallengeStarted');
    const challengeResolved = payload.events.find((e) => e.type === 'ChallengeResolved');
    const turnStarted = payload.events.find((e) => e.type === 'TurnStarted');
    const extraRoll = payload.events.find((e) => e.type === 'ExtraRollGranted');

    if (turnStarted && turnStarted.type === 'TurnStarted' && this.state) {
      const p = this.state.players.find((pl) => pl.id === turnStarted.playerId);
      if (p) {
        this.callbacks.onTurnBanner(
          p.name,
          Boolean(extraRoll && extraRoll.type === 'ExtraRollGranted' && extraRoll.playerId === p.id),
        );
      }
    }

    if (challengeResolved && challengeResolved.type === 'ChallengeResolved') {
      const myId = this.localPlayerId;
      const myOut = challengeResolved.outcomes.find((o) => o.playerId === myId);
      const myWon = myOut ? myOut.success : challengeResolved.outcomes.some((o) => o.success);
      const key = `${payload.turnNumber}:${challengeResolved.serverSummaryText}`;
      this.activeStampChallengeKey = key;
      this.callbacks.onChallengeStamp(myWon, challengeResolved.serverSummaryText);
      if (this.stampCloseTimer !== null) clearTimeout(this.stampCloseTimer);
      this.stampCloseTimer = globalThis.setTimeout(() => {
        if (this.activeStampChallengeKey === key && !this.disposed) {
          this.callbacks.onChallengeClose();
        }
      }, 1350);
    }

    if (this.state) {
      await this.callbacks.onEvents(payload.events, this.state);
    }

    if (challengeStarted && challengeStarted.type === 'ChallengeStarted' && this.state) {
      const ch = challengeStarted.challenge;
      const myId = this.localPlayerId;
      if (myId && ch.participantIds.includes(myId)) {
        this.callbacks.onChallengePrompt(ch, myId);
      }
    }
  }

  private applyEventsLocallyForSnapshot(
    events: GameEvent[],
    turnNumber: number,
    activeChallenge: ActiveChallenge | null,
  ): void {
    if (!this.state) return;
    const next: GameState = structuredClone(this.state);
    next.turnNumber = turnNumber;
    next.activeChallenge = activeChallenge;

    for (const ev of events) {
      if (ev.type === 'TurnStarted') {
        const idx = next.turnOrder.indexOf(ev.playerId);
        if (idx !== -1) next.currentTurnIndex = idx;
        next.phase = 'TURN_BEGIN';
        next.pendingRoll = null;
        next.turnDeadlineAt = Date.now() + 28_000;
      } else if (ev.type === 'DiceRolled') {
        if (ev.needsChoice) {
          next.phase = 'ROLL';
          next.pendingRoll = {
            playerId: ev.playerId,
            diceValues: ev.diceValues,
            usedBrake: ev.usedBrake,
            usedGoldenDice: ev.usedGoldenDice,
            usedTurbo: ev.usedTurbo,
          };
        }
      } else if (ev.type === 'PawnMoved') {
        const p = next.players.find((pl) => pl.id === ev.playerId);
        if (p) {
          p.position = ev.to;
          p.activeTurbo = false;
          p.activeBrake = false;
          p.activeGoldenDice = false;
        }
        next.phase = 'TILE_CHECK';
        next.pendingRoll = null;
      } else if (ev.type === 'LadderClimbed') {
        const p = next.players.find((pl) => pl.id === ev.playerId);
        if (p) {
          p.position = ev.to;
          p.stats.laddersClimbed += 1;
          if (p.pawn === 'kucing') {
            p.stars += 1;
          }
        }
      } else if (ev.type === 'SnakeBitten') {
        const p = next.players.find((pl) => pl.id === ev.playerId);
        if (p) {
          if (ev.dodgedByChallenge || ev.blockedByShield) {
            p.stats.snakesDodged += 1;
            if (ev.blockedByShield && p.shields > 0) {
              p.shields -= 1;
            }
            if (p.pawn === 'jamur') {
              p.stars += 1;
            }
          } else {
            p.position = ev.to;
            p.stats.snakesBitten += 1;
            p.challengeStreak = 0;
          }
        }
      } else if (ev.type === 'ItemUsed') {
        const p = next.players.find((pl) => pl.id === ev.playerId);
        if (p) {
          const idx = p.items.indexOf(ev.item);
          if (idx !== -1) p.items.splice(idx, 1);
          p.stats.itemsUsed += 1;
          if (typeof ev.starsDelta === 'number') {
            p.stars = Math.max(0, p.stars + ev.starsDelta);
          }
          if (typeof ev.shieldsDelta === 'number') {
            p.shields = Math.max(0, p.shields + ev.shieldsDelta);
          }
          if (ev.item === 'golden_dice') p.activeGoldenDice = true;
          else if (ev.item === 'swap_turbo') p.activeTurbo = true;
          else if (ev.item === 'brake' && ev.targetPlayerId) {
            const target = next.players.find((pl) => pl.id === ev.targetPlayerId);
            if (target) target.activeBrake = true;
          }
        }
      } else if (ev.type === 'ItemGained') {
        const p = next.players.find((pl) => pl.id === ev.playerId);
        if (p) {
          if (ev.source === 'star_shop' && typeof ev.starsCost === 'number') {
            p.stars = Math.max(0, p.stars - ev.starsCost);
          }
          if (p.items.length < 2) {
            p.items.push(ev.item);
          }
        }
      } else if (ev.type === 'ChallengeStarted') {
        next.phase = 'CHALLENGE';
        next.activeChallenge = ev.challenge;
      } else if (ev.type === 'ChallengeResolved') {
        next.activeChallenge = null;
        for (const [pid, delta] of Object.entries(ev.starsDelta)) {
          const p = next.players.find((pl) => pl.id === pid);
          if (p) p.stars = Math.max(0, p.stars + delta);
        }
        if (ev.shieldsDelta) {
          for (const [pid, delta] of Object.entries(ev.shieldsDelta)) {
            const p = next.players.find((pl) => pl.id === pid);
            if (p) p.shields = Math.max(0, p.shields + delta);
          }
        }
        for (const out of ev.outcomes) {
          const p = next.players.find((pl) => pl.id === out.playerId);
          if (!p) continue;
          if (out.success) {
            p.stats.challengesWon += 1;
            p.challengeStreak += 1;
          } else {
            p.challengeStreak = 0;
          }
        }
      } else if (ev.type === 'GameWon') {
        next.phase = 'GAME_OVER';
        next.winnerId = ev.winnerId;
        next.podium = ev.podium;
      }
    }

    this.state = next;
  }

  private clearJoinTimers(): void {
    if (this.joinRetryTimer !== null) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
    if (this.joinTimeoutTimer !== null) {
      clearTimeout(this.joinTimeoutTimer);
      this.joinTimeoutTimer = null;
    }
  }

  private handleRelayEnvelope(event: string, payload: unknown, senderId: string): void {
    if (this.disposed) return;

    // If this tab owns the room host, forward client RPC actions to P2pRoomHost
    if (
      this.p2pHost &&
      (event.startsWith('rpc:') ||
        event.startsWith('player:') ||
        event.startsWith('room:add_bot') ||
        event.startsWith('room:remove_bot') ||
        event.startsWith('room:settings') ||
        event.startsWith('room:rematch') ||
        event.startsWith('room:leave') ||
        event.startsWith('game:start') ||
        event.startsWith('turn:') ||
        event.startsWith('item:') ||
        event.startsWith('challenge:') ||
        event.startsWith('emote:'))
    ) {
      this.p2pHost.handlePeerMessage(senderId, event, payload);
      return;
    }

    this.handleServerBroadcast(event, payload);
  }

  private handleServerBroadcast(event: string, payload: unknown): void {
    if (this.disposed) return;
    switch (event) {
      case 'room:joined':
        this.handleRoomJoined(
          payload as {
            roomCode: string;
            playerId: string | null;
            reconnectToken: string;
            reconnected: boolean;
            roomState?: RoomStatePayload;
            gameState?: GameState | null;
          },
          'relay',
        );
        break;
      case 'room:state':
        this.handleRoomState(payload as RoomStatePayload);
        break;
      case 'game:started': {
        const st = (payload as { state: GameState }).state;
        this.handleGameStarted(st);
        break;
      }
      case 'game:events':
        this.enqueueGameEvents(
          payload as {
            turnNumber: number;
            events: GameEvent[];
            activeChallenge: ActiveChallenge | null;
            state?: GameState;
          },
        );
        break;
      case 'game:sync': {
        const st = (payload as { state: GameState }).state;
        this.state = st;
        this.callbacks.onStateChange(st);
        this.scene.syncPlayersFromState(st);
        break;
      }
      case 'emote:received': {
        const p = payload as { playerId: string; emoteId: EmoteId };
        this.callbacks.onEmote(p.playerId, p.emoteId);
        break;
      }
      case 'room:closed': {
        const reason = (payload as { reason?: string })?.reason ?? 'Host menutup room.';
        this.cleanupConnections();
        this.callbacks.onError(reason);
        this.callbacks.onExitToMenu();
        break;
      }
      case 'error': {
        this.clearJoinTimers();
        const errMsg = (payload as { message?: string })?.message ?? 'Terjadi kesalahan.';
        this.callbacks.onError(errMsg);
        break;
      }
    }
  }

  public createRoom(
    playerName: string,
    pawn: PawnId,
    color: PlayerColorId,
    accessory: AccessoryId = 'none',
  ): void {
    const check = validateUsername(playerName);
    if (!check.ok) {
      this.callbacks.onError(check.error ?? 'Username tidak diizinkan.');
      return;
    }
    const cleanName = check.sanitized;

    void this.resolvePreferredTransport().then((mode) => {
      if (this.disposed) return;
      this.transportMode = mode;

      if (mode === 'socketio') {
        const serverUrl = OnlineGameController.getServerUrl();
        const socket = this.setupSocketConnection(serverUrl);
        socket.emit('room:create', { playerName: cleanName, pawn, color, accessory });
        return;
      }

      const code = this.generateRoomCode();
      this.roomCode = code;
      this.relay = new RoomRelayChannel({
        roomCode: code,
        clientId: this.peerId,
        onEnvelope: (env) => this.handleRelayEnvelope(env.event, env.payload, env.senderId),
        onStatusChange: (status) => {
          this.relayStatus = status;
        },
      });

      this.p2pHost = new P2pRoomHost({
        roomCode: code,
        hostPeerId: this.peerId,
        hostCreate: { playerName: cleanName, pawn, color, accessory },
        emit: (ev, payload, targetId) => {
          if (!targetId || targetId === '*' || targetId === this.peerId) {
            this.handleServerBroadcast(ev, payload);
          }
          if (!targetId || targetId !== this.peerId) {
            this.relay?.send(ev, payload, targetId === '*' ? undefined : targetId);
          }
        },
      });

      this.handleRoomJoined(
        {
          roomCode: code,
          playerId: this.p2pHost.hostPlayerId,
          reconnectToken: this.p2pHost.hostReconnectToken,
          reconnected: false,
          roomState: this.p2pHost.getRoomState(),
        },
        'relay',
      );
    });
  }

  public joinRoom(
    roomCode: string,
    playerName: string,
    pawn: PawnId,
    color: PlayerColorId,
    opts?: { reconnectToken?: string; asSpectator?: boolean; accessory?: AccessoryId },
  ): void {
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      this.callbacks.onError('Kode room harus tepat 4 huruf.');
      return;
    }

    const check = validateUsername(playerName || PAWN_META[pawn].shortName);
    if (!check.ok) {
      this.callbacks.onError(check.error ?? 'Username tidak diizinkan.');
      return;
    }
    const cleanName = check.sanitized;

    void this.resolvePreferredTransport().then((mode) => {
      if (this.disposed) return;
      this.transportMode = mode;

      if (mode === 'socketio') {
        const serverUrl = OnlineGameController.getServerUrl();
        const socket = this.setupSocketConnection(serverUrl);
        socket.emit('room:join', {
          roomCode: code,
          playerName: cleanName,
          pawn,
          color,
          accessory: opts?.accessory ?? 'none',
          reconnectToken: opts?.reconnectToken,
          asSpectator: opts?.asSpectator,
        });
        return;
      }

      this.roomCode = code;
      this.joinedAcked = false;
      const joinPayload = {
        roomCode: code,
        playerName: cleanName,
        pawn,
        color,
        accessory: opts?.accessory ?? 'none',
        reconnectToken: opts?.reconnectToken,
        asSpectator: opts?.asSpectator,
      };

      this.relay = new RoomRelayChannel({
        roomCode: code,
        clientId: this.peerId,
        onEnvelope: (env) => this.handleRelayEnvelope(env.event, env.payload, env.senderId),
        onMqttReady: () => {
          if (!this.joinedAcked && !this.disposed) {
            this.relay?.send('rpc:join', joinPayload);
          }
        },
        onStatusChange: (status) => {
          this.relayStatus = status;
        },
      });

      this.relay.send('rpc:join', joinPayload);

      this.clearJoinTimers();
      this.joinRetryTimer = globalThis.setInterval(() => {
        if (this.joinedAcked || this.disposed) {
          this.clearJoinTimers();
          return;
        }
        this.relay?.send('rpc:join', joinPayload);
      }, 900);

      this.joinTimeoutTimer = globalThis.setTimeout(() => {
        if (!this.joinedAcked && !this.disposed) {
          this.clearJoinTimers();
          this.cleanupConnections();
          this.callbacks.onError(`Room "${code}" tidak ditemukan atau host sedang offline.`);
        }
      }, 10_500);
    });
  }

  private dispatchAction(event: string, payload?: unknown): void {
    if (this.disposed) return;
    if (this.transportMode === 'socketio') {
      this.socket?.emit(event, payload);
      return;
    }
    if (this.p2pHost) {
      this.p2pHost.handlePeerMessage(this.peerId, event, payload);
      return;
    }
    this.relay?.send(event, payload ?? {});
  }

  public setReady(ready: boolean): void {
    this.dispatchAction('player:ready', { ready });
  }

  public customize(patch: {
    playerName?: string;
    pawn?: PawnId;
    color?: PlayerColorId;
    accessory?: AccessoryId;
  }): void {
    this.dispatchAction('player:customize', patch);
  }

  public addBot(botDifficulty: BotDifficulty): void {
    this.dispatchAction('room:add_bot', { botDifficulty });
  }

  public removeBot(botId: string): void {
    this.dispatchAction('room:remove_bot', { botId });
  }

  public setRoomSettings(rulePreset: GameModePreset): void {
    this.dispatchAction('room:settings', { rulePreset });
  }

  public startGame(): void {
    this.dispatchAction('game:start');
  }

  public getRoomState(): RoomStatePayload | null {
    return this.roomState;
  }

  public getState(): GameState | null {
    return this.state;
  }

  public getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  public isSpectator(): boolean {
    return this.spectator;
  }

  public rollDice(forcedDice?: number): void {
    if (!this.spectator && this.localPlayerId) {
      this.scene.startOptimisticDiceShake(this.localPlayerId);
    }
    this.dispatchAction('turn:roll', forcedDice ? { forcedDice } : {});
  }

  public selectDice(choiceIndex: 0 | 1): void {
    this.dispatchAction('turn:select_dice', { choiceIndex });
  }

  public useItem(itemIndex: number): void {
    this.dispatchAction('item:use', { itemIndex });
  }

  public buyStarItem(): void {
    this.dispatchAction('item:buy');
  }

  public chooseDuelOpponent(opponentId: string): void {
    this.dispatchAction('challenge:choose_opponent', { opponentId });
  }

  public submitChallenge(submission: ChallengeSubmission): void {
    this.dispatchAction('challenge:submit', {
      tileId: this.state?.activeChallenge?.tileId ?? 1,
      claimedSuccess: submission.claimedSuccess,
      score: submission.score,
      inputLog: submission.inputLog,
    });
  }

  public sendEmote(emoteId: EmoteId): void {
    this.dispatchAction('emote:send', { emoteId });
  }

  public rematch(): void {
    this.dispatchAction('room:rematch');
  }

  private cleanupConnections(): void {
    this.clearJoinTimers();
    if (this.stampCloseTimer !== null) {
      clearTimeout(this.stampCloseTimer);
      this.stampCloseTimer = null;
    }
    if (this.p2pHost) {
      this.p2pHost.dispose();
      this.p2pHost = null;
    }
    if (this.relay) {
      this.relay.close();
      this.relay = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  public leave(): void {
    if (this.disposed) return;
    if (this.transportMode === 'socketio') {
      this.socket?.emit('room:leave');
    } else if (!this.p2pHost && this.relay) {
      this.relay.send('room:leave', {});
    }
    this.disposed = true;
    OnlineGameController.clearSavedSession();
    this.cleanupConnections();
    this.callbacks.onExitToMenu();
  }
}
