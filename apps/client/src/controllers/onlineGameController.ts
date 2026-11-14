import { io, type Socket } from 'socket.io-client';
import type {
  ActiveChallenge,
  BotDifficulty,
  ChallengeSubmission,
  EmoteId,
  GameEvent,
  GameModePreset,
  GameState,
  PawnId,
  PlayerColorId,
  RoomStatePayload,
} from '@doodle-dash/shared';
import type { DoodleSceneManager } from '../scene/sceneManager.js';
import type { GameSessionController, SessionCallbacks } from './gameTypes.js';

const SESSION_KEY = 'doodle_dash_reconnect_v1';

interface StoredSession {
  roomCode: string;
  reconnectToken: string;
  playerId: string | null;
}

export class OnlineGameController implements GameSessionController {
  public readonly mode = 'online' as const;
  private readonly socket: Socket;
  private readonly scene: DoodleSceneManager;
  private readonly callbacks: SessionCallbacks;

  private state: GameState | null = null;
  private roomState: RoomStatePayload | null = null;
  private myPlayerId: string | null = null;
  private spectator = false;
  private packetChain: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(scene: DoodleSceneManager, callbacks: SessionCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.socket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('room:joined', (res: {
      roomCode: string;
      playerId: string | null;
      reconnectToken?: string;
      asSpectator?: boolean;
    }) => {
      this.myPlayerId = res.playerId;
      this.spectator = Boolean(res.asSpectator);
      if (res.reconnectToken) {
        const stored: StoredSession = {
          roomCode: res.roomCode,
          reconnectToken: res.reconnectToken,
          playerId: res.playerId,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      }
    });

    this.socket.on('room:state', (room: RoomStatePayload) => {
      this.roomState = room;
      this.callbacks.onRoomState?.(room);
    });

    this.socket.on('game:snapshot', ({ state }: { state: GameState }) => {
      this.state = state;
      this.scene.syncPlayersFromState(state);
      this.callbacks.onStateChange(state);
      if (state.activeChallenge && this.myPlayerId && state.activeChallenge.participantIds.includes(this.myPlayerId)) {
        this.callbacks.onChallengePrompt(state.activeChallenge, this.myPlayerId);
      }
    });

    this.socket.on('game:events', (payload: { stateVersion: number; events: GameEvent[] }) => {
      this.packetChain = this.packetChain
        .then(() => this.handleEventBatch(payload))
        .catch(() => {});
    });

    this.socket.on('challenge:begin', ({ challenge }: { challenge: ActiveChallenge }) => {
      this.packetChain = this.packetChain
        .then(() => {
          if (this.disposed) return;
          this.scene.setCameraMode('challenge');
          this.scene.focusTile(challenge.tileId);
          if (this.myPlayerId && challenge.participantIds.includes(this.myPlayerId)) {
            this.callbacks.onChallengePrompt(challenge, this.myPlayerId);
          }
        })
        .catch(() => {});
    });

    this.socket.on('emote:broadcast', ({ playerId, emoteId }: { playerId: string; emoteId: EmoteId }) => {
      this.callbacks.onEmote(playerId, emoteId);
    });

    this.socket.on('error', ({ message }: { message: string }) => {
      this.callbacks.onError(message);
    });
  }

  private async handleEventBatch({ stateVersion, events }: { stateVersion: number; events: GameEvent[] }): Promise<void> {
    if (!this.state || this.disposed) {
      return;
    }
    this.applyEventsLocallyForSnapshot(events, stateVersion);
    this.callbacks.onStateChange(this.state);

    for (const ev of events) {
      if (ev.type === 'TurnStarted') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) this.callbacks.onTurnBanner(p.name);
      } else if (ev.type === 'ChallengeResolved') {
        const localOut = this.myPlayerId
          ? ev.outcomes.find((o) => o.playerId === this.myPlayerId)
          : undefined;
        const ownerOut = ev.outcomes.find((o) => o.playerId === ev.ownerPlayerId);
        const stampSuccess = localOut ? localOut.success : Boolean(ownerOut?.success);
        this.callbacks.onChallengeStamp(stampSuccess, ev.serverSummaryText);
        await new Promise((r) => setTimeout(r, 1150));
        if (this.disposed) return;
        this.callbacks.onChallengeClose();
      }
    }

    await this.callbacks.onEvents(events, this.state);
  }

  private applyEventsLocallyForSnapshot(events: GameEvent[], stateVersion: number): void {
    if (!this.state) return;
    this.state.stateVersion = stateVersion;
    for (const ev of events) {
      if (ev.type === 'GameStarted') {
        this.state.turnOrder = [...ev.turnOrder];
        this.state.currentTurnIndex = 0;
        this.state.turnNumber = 1;
        this.state.phase = 'TURN_BEGIN';
      } else if (ev.type === 'TurnChanged') {
        const idx = this.state.turnOrder.indexOf(ev.nextPlayerId);
        if (idx >= 0) this.state.currentTurnIndex = idx;
        this.state.turnNumber = ev.turnNumber;
        this.state.phase = 'TURN_BEGIN';
        this.state.turnDeadlineAt = Date.now() + 30_000;
      } else if (ev.type === 'TurnStarted') {
        const idx = this.state.turnOrder.indexOf(ev.playerId);
        if (idx >= 0) this.state.currentTurnIndex = idx;
        this.state.turnNumber = ev.turnNumber;
        this.state.phase = 'TURN_BEGIN';
        this.state.turnDeadlineAt = Date.now() + 30_000;
      } else if (ev.type === 'TurnSkipped') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p && p.skipTurns > 0) p.skipTurns -= 1;
      } else if (ev.type === 'DiceRolled') {
        const roller = this.state.players.find((x) => x.id === ev.playerId);
        if (roller) {
          roller.activeBrake = false;
          roller.activeGoldenDice = false;
          roller.activeTurbo = false;
          roller.stats.rolls += 1;
        }
        this.state.pendingRoll = {
          playerId: ev.playerId,
          diceValues: ev.diceValues,
          chosenValue: ev.needsChoice ? undefined : ev.diceValues[0],
          usedBrake: ev.usedBrake,
          usedGoldenDice: ev.usedGoldenDice,
          usedTurbo: ev.usedTurbo,
        };
        if (ev.needsChoice) this.state.phase = 'ROLL';
      } else if (ev.type === 'DiceChosen') {
        if (this.state.pendingRoll && this.state.pendingRoll.playerId === ev.playerId) {
          this.state.pendingRoll.chosenValue = ev.value;
        }
        this.state.phase = 'MOVE';
      } else if (ev.type === 'PawnMoved') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) p.position = ev.to;
      } else if (ev.type === 'LadderClimbed') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) {
          p.position = ev.to;
          p.stats.laddersClimbed += 1;
        }
      } else if (ev.type === 'SnakeBitten') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) {
          p.position = ev.to;
          if (ev.blockedByShield) {
            if (p.shields > 0) {
              p.shields -= 1;
            } else {
              const sIdx = p.items.indexOf('shield');
              if (sIdx >= 0) p.items.splice(sIdx, 1);
            }
            p.stats.snakesDodged += 1;
          } else if (ev.dodgedByChallenge) {
            p.stats.snakesDodged += 1;
          } else {
            p.stats.snakesBitten += 1;
          }
        }
      } else if (ev.type === 'ChallengeStarted') {
        this.state.activeChallenge = ev.challenge;
        this.state.phase = 'CHALLENGE';
      } else if (ev.type === 'ChallengeResolved') {
        this.state.activeChallenge = null;
        this.state.pendingRoll = null;
        const owner = this.state.players.find((x) => x.id === ev.ownerPlayerId);
        const ownerOut = ev.outcomes.find((o) => o.playerId === ev.ownerPlayerId);
        if (owner) {
          owner.stats.challengesTotal += 1;
          if (ownerOut?.success) {
            owner.stats.challengesWon += 1;
            if (ev.archetype !== 'gift_trap' && ev.archetype !== 'lucky_wheel') {
              owner.challengeStreak = (owner.challengeStreak ?? 0) + 1;
            }
          } else if (ev.archetype !== 'gift_trap' && ev.archetype !== 'lucky_wheel') {
            owner.challengeStreak = 0;
          }
        }
        for (const [pid, delta] of Object.entries(ev.starsDelta)) {
          const p = this.state.players.find((x) => x.id === pid);
          if (p) p.stars = Math.max(0, p.stars + delta);
        }
        if (ev.shieldsDelta) {
          for (const [pid, delta] of Object.entries(ev.shieldsDelta)) {
            const p = this.state.players.find((x) => x.id === pid);
            if (p) p.shields = Math.max(0, p.shields + delta);
          }
        }
        this.scene.setCameraMode('follow');
      } else if (ev.type === 'ItemGained') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) {
          if (ev.starsCost) p.stars = Math.max(0, p.stars - ev.starsCost);
          if (p.items.length < 2) p.items.push(ev.item);
        }
      } else if (ev.type === 'ItemUsed') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) {
          const idx = p.items.indexOf(ev.item);
          if (idx >= 0) p.items.splice(idx, 1);
          p.stats.itemsUsed += 1;
          if (ev.shieldsDelta) p.shields += ev.shieldsDelta;
          if (ev.starsDelta) p.stars += ev.starsDelta;
          if (ev.item === 'golden_dice') p.activeGoldenDice = true;
          if (ev.item === 'brake') p.activeBrake = true;
          if (ev.item === 'swap_turbo') p.activeTurbo = true;
          if (ev.item === 'magnet_star' && ev.targetPlayerId && ev.starsDelta) {
            const target = this.state.players.find((x) => x.id === ev.targetPlayerId);
            if (target) target.stars = Math.max(0, target.stars - ev.starsDelta);
          }
        }
      } else if (ev.type === 'ExtraRollGranted') {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) p.extraRollsPending += 1;
      } else if (ev.type === 'GameWon') {
        this.state.winnerId = ev.winnerId;
        this.state.podium = ev.podium;
        this.state.phase = 'GAME_OVER';
      }
    }
  }

  public static getSavedSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  public static clearSavedSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  public createRoom(playerName: string, pawn: PawnId, color: PlayerColorId): void {
    this.socket.emit('room:create', { playerName, pawn, color });
  }

  public joinRoom(
    roomCode: string,
    playerName: string,
    pawn: PawnId,
    color: PlayerColorId,
    options?: { reconnectToken?: string; asSpectator?: boolean },
  ): void {
    this.socket.emit('room:join', {
      roomCode,
      playerName,
      pawn,
      color,
      reconnectToken: options?.reconnectToken,
      asSpectator: options?.asSpectator,
    });
  }

  public setReady(ready: boolean): void {
    this.socket.emit('player:ready', { ready });
  }

  public customize(patch: { playerName?: string; pawn?: PawnId; color?: PlayerColorId }): void {
    this.socket.emit('player:customize', patch);
  }

  public addBot(botDifficulty: BotDifficulty): void {
    this.socket.emit('room:add_bot', { botDifficulty });
  }

  public removeBot(botId: string): void {
    this.socket.emit('room:remove_bot', { botId });
  }

  public setRoomSettings(rulePreset: GameModePreset): void {
    this.socket.emit('room:settings', { rulePreset });
  }

  public startGame(): void {
    this.socket.emit('game:start');
  }

  public getRoomState(): RoomStatePayload | null {
    return this.roomState;
  }

  public getState(): GameState | null {
    return this.state;
  }

  public getLocalPlayerId(): string | null {
    return this.myPlayerId;
  }

  public isSpectator(): boolean {
    return this.spectator;
  }

  public rollDice(forcedDice?: number): void {
    if (this.myPlayerId) {
      this.scene.startOptimisticDiceShake(this.myPlayerId);
    }
    this.socket.emit('turn:roll', forcedDice ? { forcedDice } : {});
  }

  public selectDice(choiceIndex: 0 | 1): void {
    this.socket.emit('turn:select_dice', { choiceIndex });
  }

  public useItem(itemIndex: number): void {
    this.socket.emit('item:use', { itemIndex });
  }

  public buyStarItem(): void {
    this.socket.emit('item:buy');
  }

  public chooseDuelOpponent(opponentId: string): void {
    this.socket.emit('challenge:choose_opponent', { opponentId });
  }

  public submitChallenge(submission: ChallengeSubmission): void {
    const tileId = this.state?.activeChallenge?.tileId ?? 1;
    this.socket.emit('challenge:submit', {
      tileId,
      claimedSuccess: submission.claimedSuccess,
      score: submission.score,
      inputLog: submission.inputLog,
    });
  }

  public sendEmote(emoteId: EmoteId): void {
    this.socket.emit('emote:send', { emoteId });
  }

  public rematch(): void {
    this.socket.emit('room:rematch');
  }

  public leave(): void {
    this.disposed = true;
    OnlineGameController.clearSavedSession();
    this.socket.emit('room:leave');
    this.socket.disconnect();
    this.callbacks.onExitToMenu();
  }
}
