import {
  ARCHETYPE_REGISTRY,
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
  selectDuelOpponent,
  shouldBotBuyStarItem,
  simulateBotChallengeSubmission,
  startGame,
  type BotDifficulty,
  type ChallengeArchetype,
  type ChallengeSubmission,
  type CreatePlayerInput,
  type EmoteId,
  type GameModePreset,
  type GameState,
  type Tile,
} from '@doodle-dash/shared';
import type { DoodleSceneManager } from '../scene/sceneManager.js';
import type { GameSessionController, SessionCallbacks } from './gameTypes.js';

export class LocalGameController implements GameSessionController {
  public readonly mode: 'local' | 'bot';
  private state: GameState;
  private readonly initialPlayers: CreatePlayerInput[];
  private readonly rulePreset: GameModePreset;
  private readonly callbacks: SessionCallbacks;
  private readonly scene: DoodleSceneManager;
  private busy = false;
  private disposed = false;
  private hotSeatParticipantIdx = 0;
  private pendingLocalParticipants: string[] = [];
  private turnTimerId: number | null = null;
  private challengeTimerId: number | null = null;

  constructor(
    mode: 'local' | 'bot',
    players: CreatePlayerInput[],
    scene: DoodleSceneManager,
    callbacks: SessionCallbacks,
    rulePreset: GameModePreset = 'klasik',
  ) {
    this.mode = mode;
    this.initialPlayers = players;
    this.rulePreset = rulePreset;
    this.scene = scene;
    this.callbacks = callbacks;

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const init = createInitialGameState({
      matchSeed: seed,
      board: BOARD_LAYOUT,
      players,
      rulePreset,
    });
    const started = startGame(init, Date.now() + 30_000);
    this.state = started.state;
    this.callbacks.onStateChange(this.state);
    this.scene.syncPlayersFromState(this.state);
    void this.handleBeginTurn();
  }

  public getState(): GameState | null {
    return this.state;
  }

  public getLocalPlayerId(): string | null {
    if (this.state.phase === 'CHALLENGE' && this.pendingLocalParticipants.length > 0) {
      return this.pendingLocalParticipants[this.hotSeatParticipantIdx] ?? null;
    }
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const active = this.state.players.find((p) => p.id === activeId);
    if (active && !active.isBot) return active.id;
    const firstHuman = this.state.players.find((p) => !p.isBot);
    return firstHuman?.id ?? null;
  }

  public isSpectator(): boolean {
    return false;
  }

  private clearTimers(): void {
    if (this.turnTimerId !== null) clearTimeout(this.turnTimerId);
    if (this.challengeTimerId !== null) clearTimeout(this.challengeTimerId);
    this.turnTimerId = null;
    this.challengeTimerId = null;
  }

  private async handleBeginTurn(): Promise<void> {
    if (this.disposed || this.state.phase === 'GAME_OVER') return;
    this.clearTimers();
    this.busy = false;

    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const active = this.state.players.find((p) => p.id === activeId)!;
    this.state.turnDeadlineAt = active.isBot ? null : Date.now() + 30_000;
    this.callbacks.onTurnBanner(active.name);
    this.callbacks.onStateChange(this.state);

    if (active.isBot) {
      this.turnTimerId = window.setTimeout(() => {
        if (this.disposed) return;
        this.performBotTurn(active.id);
      }, 950);
    } else {
      // 30s turn timeout auto-roll
      this.turnTimerId = window.setTimeout(() => {
        if (this.disposed) return;
        if (this.state.phase === 'TURN_BEGIN' && !this.busy) {
          this.rollDice();
        }
      }, 30_000);
    }
  }

  private performBotTurn(botId: string): void {
    if (this.disposed || this.state.phase !== 'TURN_BEGIN') return;
    const rng = new SeededRng(hashSeed(this.state.matchSeed, this.state.eventSeq + 1, 'bot_loc_item'));
    const curBot = this.state.players.find((p) => p.id === botId)!;

    if (shouldBotBuyStarItem(this.state, curBot, rng)) {
      this.buyStarItem();
    }

    const updatedBot = this.state.players.find((p) => p.id === botId)!;
    if (updatedBot.items.length > 0) {
      const chosenIdx = decideBotPreRollItemIndex(this.state, updatedBot, rng);
      if (chosenIdx !== null) {
        this.useItem(chosenIdx);
      }
    }
    this.rollDice();
  }

  public buyStarItem(): void {
    if (this.busy || this.state.phase !== 'TURN_BEGIN') return;
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    try {
      const res = engineBuyStarItem(this.state, activeId);
      this.state = res.state;
      this.callbacks.onStateChange(this.state);
      void this.callbacks.onEvents(res.events, this.state);
    } catch (e) {
      this.callbacks.onError(e instanceof Error ? e.message : 'Gagal beli item');
    }
  }

  public useItem(itemIndex: number): void {
    if (this.busy || this.state.phase !== 'TURN_BEGIN') return;
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const res = applyItem(this.state, activeId, itemIndex);
    this.state = res.state;
    this.callbacks.onStateChange(this.state);
    void this.callbacks.onEvents(res.events, this.state);
  }

  public rollDice(forcedDice?: number): void {
    if (this.busy || this.state.phase !== 'TURN_BEGIN') return;
    this.clearTimers();
    this.busy = true;
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const active = this.state.players.find((p) => p.id === activeId)!;

    this.scene.startOptimisticDiceShake(activeId);

    window.setTimeout(async () => {
      if (this.disposed) return;
      try {
        const rolled = rollDice(this.state, activeId, forcedDice);
        this.state = rolled.state;
        this.callbacks.onStateChange(this.state);
        await this.callbacks.onEvents(rolled.events, this.state);

        if (this.state.phase === 'ROLL') {
          this.busy = false;
          this.callbacks.onStateChange(this.state);
          if (active.isBot) {
            const vals = this.state.pendingRoll?.diceValues ?? [1, 1];
            const choiceIdx = chooseBotGoldenDiceIndex(this.state, active, vals);
            window.setTimeout(() => {
              if (!this.disposed) this.selectDice(choiceIdx);
            }, 650);
          } else {
            this.turnTimerId = window.setTimeout(() => {
              if (!this.disposed && this.state.phase === 'ROLL') {
                this.selectDice(0);
              }
            }, 12_000);
          }
          return;
        }

        await this.resolveLandedTile();
      } catch (err) {
        this.busy = false;
        this.scene.cancelOptimisticDiceShake();
        if (!this.disposed) {
          this.callbacks.onStateChange(this.state);
          this.callbacks.onError(err instanceof Error ? err.message : 'Gagal melempar dadu.');
        }
      }
    }, 360);
  }

  public selectDice(choiceIndex: 0 | 1): void {
    if (this.busy || this.state.phase !== 'ROLL') return;
    this.busy = true;
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    void (async () => {
      const chosen = chooseDice(this.state, activeId, choiceIndex);
      this.state = chosen.state;
      this.callbacks.onStateChange(this.state);
      await this.callbacks.onEvents(chosen.events, this.state);
      await this.resolveLandedTile();
    })();
  }

  private async resolveLandedTile(customTiles?: Tile[]): Promise<void> {
    const res = resolveTile(this.state, customTiles ?? TILES, Date.now());
    this.state = res.state;
    this.callbacks.onStateChange(this.state);
    await this.callbacks.onEvents(res.events, this.state);

    if (this.state.phase === 'CHALLENGE' && this.state.activeChallenge) {
      const ch = this.state.activeChallenge;
      this.scene.setCameraMode('challenge');
      this.scene.focusTile(ch.tileId);

      // Simulate bot participants
      for (const pid of ch.participantIds) {
        const p = this.state.players.find((x) => x.id === pid);
        if (p?.isBot) {
          const sub = simulateBotChallengeSubmission(
            ch,
            pid,
            p.botDifficulty,
            new SeededRng(hashSeed(ch.seed, pid, 'bot_loc')),
          );
          this.state = recordChallengeSubmission(this.state, sub);
        }
      }

      this.pendingLocalParticipants = ch.participantIds.filter((pid) => {
        const p = this.state.players.find((x) => x.id === pid);
        return p && !p.isBot;
      });
      this.hotSeatParticipantIdx = 0;

      if (this.pendingLocalParticipants.length === 0) {
        // Pure bot turn
        const owner = this.state.players.find((p) => p.id === ch.ownerPlayerId)!;
        const ownerSub = this.state.activeChallenge?.submissions[owner.id];
        this.callbacks.onChallengeStamp(
          Boolean(ownerSub?.claimedSuccess),
          `${owner.name} memainkan ${ARCHETYPE_REGISTRY[ch.archetype].displayName}`,
        );
        window.setTimeout(async () => {
          this.callbacks.onChallengeClose();
          await this.finishChallengeAndAdvance();
        }, 1450);
      } else {
        this.busy = false;
        this.promptNextHumanParticipant();
      }
      return;
    }

    await this.advanceToNextTurn();
  }

  private promptNextHumanParticipant(): void {
    const ch = this.state.activeChallenge;
    if (!ch) return;
    const pid = this.pendingLocalParticipants[this.hotSeatParticipantIdx];
    this.callbacks.onStateChange(this.state);
    this.callbacks.onChallengePrompt(ch, pid);

    if (this.challengeTimerId !== null) clearTimeout(this.challengeTimerId);
    if (ch.awaitingDuelPick) {
      return;
    }
    this.challengeTimerId = window.setTimeout(() => {
      if (this.disposed || this.state.phase !== 'CHALLENGE') return;
      this.submitChallenge({
        playerId: pid,
        claimedSuccess: false,
        score: 0,
        inputLog: { startedAt: 0, completedAt: ch.durationMs },
      });
    }, ch.durationMs + 2500);
  }

  public chooseDuelOpponent(opponentId: string): void {
    const ch = this.state.activeChallenge;
    if (!ch || ch.mode !== 'duel') return;
    this.state = selectDuelOpponent(this.state, ch.ownerPlayerId, opponentId, Date.now());
    const updated = this.state.activeChallenge!;
    const opp = updated.opponentId
      ? this.state.players.find((p) => p.id === updated.opponentId)
      : undefined;
    if (opp?.isBot) {
      this.state = recordChallengeSubmission(
        this.state,
        simulateBotChallengeSubmission(
          updated,
          opp.id,
          opp.botDifficulty,
          new SeededRng(hashSeed(updated.seed, opp.id, 'bot_loc')),
        ),
      );
    }
    this.pendingLocalParticipants = updated.participantIds.filter((pid) => {
      const p = this.state.players.find((x) => x.id === pid);
      return p && !p.isBot;
    });
    this.hotSeatParticipantIdx = 0;
    this.promptNextHumanParticipant();
  }

  public submitChallenge(submission: ChallengeSubmission): void {
    if (this.state.phase !== 'CHALLENGE' || !this.state.activeChallenge) return;
    if (this.state.activeChallenge.submissions[submission.playerId]) return;
    if (this.challengeTimerId !== null) {
      clearTimeout(this.challengeTimerId);
      this.challengeTimerId = null;
    }

    this.state = recordChallengeSubmission(this.state, submission);
    this.hotSeatParticipantIdx++;

    if (this.hotSeatParticipantIdx < this.pendingLocalParticipants.length) {
      this.promptNextHumanParticipant();
      return;
    }

    this.busy = true;
    void this.finishChallengeAndAdvance();
  }

  private async finishChallengeAndAdvance(): Promise<void> {
    if (this.disposed || this.state.phase !== 'CHALLENGE') return;
    const applied = applyChallengeResult(this.state);
    this.state = applied.state;

    const resolvedEv = applied.events.find((e) => e.type === 'ChallengeResolved');
    if (resolvedEv && resolvedEv.type === 'ChallengeResolved') {
      const singleHumanId =
        this.pendingLocalParticipants.length === 1 ? this.pendingLocalParticipants[0] : null;
      const focusOut = singleHumanId
        ? resolvedEv.outcomes.find((o) => o.playerId === singleHumanId)
        : resolvedEv.outcomes.find((o) => o.playerId === resolvedEv.ownerPlayerId);
      const ownerOut = resolvedEv.outcomes.find((o) => o.playerId === resolvedEv.ownerPlayerId);
      this.callbacks.onChallengeStamp(
        Boolean((focusOut ?? ownerOut)?.success),
        resolvedEv.serverSummaryText,
      );
      await new Promise((r) => setTimeout(r, 1250));
      if (this.disposed) return;
    }

    this.callbacks.onChallengeClose();
    this.scene.setCameraMode('follow');
    this.callbacks.onStateChange(this.state);
    await this.callbacks.onEvents(applied.events, this.state);

    if (this.state.phase === 'GAME_OVER') {
      this.busy = false;
      this.callbacks.onStateChange(this.state);
      return;
    }

    await this.advanceToNextTurn();
  }

  private async advanceToNextTurn(): Promise<void> {
    if (this.disposed) return;
    const nxt = nextTurn(this.state, Date.now() + 30_000);
    this.state = nxt.state;
    this.callbacks.onStateChange(this.state);
    await this.callbacks.onEvents(nxt.events, this.state);
    this.busy = false;
    void this.handleBeginTurn();
  }

  public sendEmote(emoteId: EmoteId): void {
    const pid = this.getLocalPlayerId() ?? this.state.turnOrder[this.state.currentTurnIndex];
    this.callbacks.onEmote(pid, emoteId);
  }

  public rematch(): void {
    this.clearTimers();
    this.busy = false;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const init = createInitialGameState({
      matchSeed: seed,
      board: BOARD_LAYOUT,
      players: this.initialPlayers,
      rulePreset: this.rulePreset,
    });
    const started = startGame(init, Date.now() + 30_000);
    this.state = started.state;
    this.scene.setCameraMode('follow');
    this.scene.syncPlayersFromState(this.state);
    this.callbacks.onStateChange(this.state);
    void this.handleBeginTurn();
  }

  public leave(): void {
    this.disposed = true;
    this.clearTimers();
    this.callbacks.onExitToMenu();
  }

  public debugJumpToTile(tileId: number): void {
    if (this.busy) return;
    const clamped = Math.max(1, Math.min(100, tileId));
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const active = this.state.players.find((p) => p.id === activeId)!;
    active.position = clamped;
    this.scene.syncPlayersFromState(this.state);
    this.callbacks.onStateChange(this.state);
  }

  public debugTriggerArchetype(archetype: ChallengeArchetype): void {
    if (this.busy || this.state.phase !== 'TURN_BEGIN') return;
    this.busy = true;
    this.state.phase = 'TILE_CHECK';
    const activeId = this.state.turnOrder[this.state.currentTurnIndex];
    const active = this.state.players.find((p) => p.id === activeId)!;
    if (active.position === 1) active.position = 2;

    const spec = ARCHETYPE_REGISTRY[archetype];
    const fakeParams = spec.buildParams(new SeededRng(Date.now()), 2, active.position);
    const customTiles: Tile[] = TILES.map((t) =>
      t.id === active.position
        ? {
            ...t,
            archetype,
            mode: archetype === 'quick_duel' ? 'duel' : 'solo',
            params: fakeParams,
          }
        : t,
    );
    void this.resolveLandedTile(customTiles);
  }
}

export function buildBotPlayers(
  humanName: string,
  humanPawn: CreatePlayerInput['pawn'],
  humanColor: CreatePlayerInput['color'],
  botCount: number,
  difficulty: BotDifficulty,
  humanAccessory: CreatePlayerInput['accessory'] = 'none',
): CreatePlayerInput[] {
  const pawns = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'] as const;
  const colors = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'] as const;
  const botAccessories = ['glasses', 'scarf', 'flower', 'backpack', 'headset', 'crown'] as const;
  const availPawns = pawns.filter((p) => p !== humanPawn);
  const availColors = colors.filter((c) => c !== humanColor);
  const diffLabel = difficulty === 'juara' ? 'Juara' : difficulty === 'santai' ? 'Santai' : 'Bot';

  const list: CreatePlayerInput[] = [
    {
      id: 'human_1',
      name: humanName,
      pawn: humanPawn,
      color: humanColor,
      accessory: humanAccessory,
      isBot: false,
    },
  ];
  for (let i = 0; i < botCount; i++) {
    const pawn = availPawns[i % availPawns.length];
    list.push({
      id: `bot_${i + 1}`,
      name: `${PAWN_META[pawn].shortName} (${diffLabel})`,
      pawn,
      color: availColors[i % availColors.length],
      accessory: botAccessories[i % botAccessories.length],
      isBot: true,
      botDifficulty: difficulty,
    });
  }
  return list;
}
