import {
  getChallengeBonusDurationMs,
  getPlayerShopCost,
  type AccessoryId,
  type ActiveChallenge,
  type BoardLayout,
  type BotDifficulty,
  type ChallengeParticipantOutcome,
  type ChallengeSubmission,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type ItemType,
  type MatchMission,
  type MatchMissionKind,
  type PawnId,
  type Player,
  type PlayerColorId,
  type PodiumEntry,
  type StepResult,
  type Tile,
} from '../types.js';
import { deriveRng, SeededRng, hashSeed } from '../rng.js';
import { sanitizeUsernameOrFallback, sanitizeUsernameRaw } from '../moderation/usernameFilter.js';
import {
  ARCHETYPE_REGISTRY,
  PLAYABLE_TILE_ARCHETYPES,
  deriveChallengeRuntimeSeed,
} from '../content/archetypes.js';
import { TILES } from '../data/boardData.js';
import { GIFT_TRAP_VARIANTS } from '../content/wordBank.js';
import {
  computeEffectiveDiceSteps,
  computeMove,
  findLadderAt,
  findSnakeAt,
  getBoardSpecialTile,
} from './boardUtils.js';
import {
  buildChallengeRuntimeParams,
  simulateBotChallengeSubmission,
  validateChallengeSubmission,
} from './challengeValidator.js';

export interface CreatePlayerInput {
  id: string;
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  accessory?: AccessoryId;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

export interface CreateGameOptions {
  matchSeed: number;
  board: BoardLayout;
  players: CreatePlayerInput[];
  rulePreset?: GameModePreset;
}

const ALL_ITEMS: ItemType[] = [
  'shield',
  'golden_dice',
  'brake',
  'surprise',
  'magnet_star',
  'swap_turbo',
  'star_multiplier',
  'rival_brake',
];

const MISSION_TEMPLATES: Array<{ kind: MatchMissionKind; target: number }> = [
  { kind: 'climb_2', target: 2 },
  { kind: 'win_3', target: 3 },
  { kind: 'streak_2', target: 2 },
  { kind: 'use_2_items', target: 2 },
];

function createPlayerMission(matchSeed: number, playerIndex: number): MatchMission {
  const rng = deriveRng(matchSeed >>> 0, playerIndex + 1, 'player_mission');
  const picked = rng.pick(MISSION_TEMPLATES);
  return {
    kind: picked.kind,
    progress: 0,
    target: picked.target,
    completed: false,
  };
}

function updatePlayerMission(
  state: GameState,
  player: Player,
  kind: MatchMissionKind,
  events: GameEvent[],
  absoluteProgress?: number,
): void {
  if (!player.mission || player.mission.completed || player.mission.kind !== kind) {
    return;
  }
  const nextProgress =
    absoluteProgress !== undefined
      ? Math.max(player.mission.progress, absoluteProgress)
      : player.mission.progress + 1;
  player.mission.progress = Math.min(player.mission.target, nextProgress);
  if (player.mission.progress < player.mission.target) {
    return;
  }

  player.mission.completed = true;
  const starsDelta = 3;
  player.stars += starsDelta;

  const granted = tryGrantItem(state, player, 'mission', events, 1);
  let shieldsDelta: number | undefined;
  if (!granted) {
    player.shields += 1;
    shieldsDelta = 1;
  }

  events.push({
    type: 'MissionCompleted',
    seq: nextSeq(state),
    playerId: player.id,
    kind,
    starsDelta,
    grantedItem: granted ?? undefined,
    shieldsDelta,
  });
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: state.board,
    players: state.players.map((p) => ({
      ...p,
      items: [...p.items],
      mission: p.mission ? { ...p.mission } : undefined,
      stats: { ...p.stats },
    })),
    turnOrder: [...state.turnOrder],
    pendingRoll: state.pendingRoll
      ? {
          ...state.pendingRoll,
          diceValues: [...state.pendingRoll.diceValues],
        }
      : null,
    activeChallenge: state.activeChallenge
      ? {
          ...state.activeChallenge,
          participantIds: [...state.activeChallenge.participantIds],
          submissions: { ...state.activeChallenge.submissions },
        }
      : null,
    podium: state.podium.map((entry) => ({ ...entry })),
  };
}

function nextSeq(state: GameState): number {
  state.eventSeq += 1;
  return state.eventSeq;
}

function getActivePlayer(state: GameState): Player {
  const activeId = state.turnOrder[state.currentTurnIndex];
  const player = state.players.find((p) => p.id === activeId);
  if (!player) {
    throw new Error(`Active player ${activeId} not found`);
  }
  return player;
}

function getPlayerById(state: GameState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }
  return player;
}

export function createInitialGameState(options: CreateGameOptions): GameState {
  const rulePreset: GameModePreset = options.rulePreset ?? 'klasik';
  const players: Player[] = options.players.map((p, idx) => {
    const starterItems: ItemType[] = [];
    if (rulePreset === 'kilat' || rulePreset === 'pesta_item') {
      const itemRng = deriveRng(options.matchSeed >>> 0, idx + 1, 'starter_item');
      starterItems.push(itemRng.pick(ALL_ITEMS));
    }

    return {
      id: p.id,
      name: p.isBot
        ? sanitizeUsernameRaw(p.name) || `Bot ${idx + 1}`
        : sanitizeUsernameOrFallback(p.name, `Pemain ${idx + 1}`),
      pawn: p.pawn,
      color: p.color,
      accessory: p.accessory ?? 'none',
      position: 1,
      stars: rulePreset === 'kilat' ? 2 : 0,
      items: starterItems,
      shields: 0,
      skipTurns: 0,
      consecutiveSixes: 0,
      consecutivePenalties: 0,
      challengeStreak: 0,
      extraRollsPending: 0,
      activeGoldenDice: false,
      activeBrake: false,
      activeTurbo: false,
      activeDoubleStars: false,
      mission: createPlayerMission(options.matchSeed, idx),
      isBot: Boolean(p.isBot),
      botDifficulty: p.botDifficulty ?? 'pintar',
      connected: true,
      ready: true,
      stats: {
        rolls: 0,
        challengesWon: 0,
        challengesTotal: 0,
        laddersClimbed: 0,
        snakesBitten: 0,
        snakesDodged: 0,
        itemsUsed: 0,
      },
    };
  });

  return {
    stateVersion: 1,
    matchSeed: options.matchSeed >>> 0,
    rulePreset,
    eventSeq: 0,
    turnNumber: 0,
    phase: 'LOBBY',
    board: options.board,
    players,
    turnOrder: players.map((p) => p.id),
    currentTurnIndex: 0,
    pendingRoll: null,
    activeChallenge: null,
    turnDeadlineAt: null,
    winnerId: null,
    podium: [],
  };
}

export function startGame(inputState: GameState, turnDeadlineAt: number | null = null): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'LOBBY' && state.phase !== 'STARTING') {
    throw new Error(`Cannot start game from phase ${state.phase}`);
  }
  if (state.players.length < 2 || state.players.length > 6) {
    throw new Error('Game requires 2 to 6 players');
  }

  const events: GameEvent[] = [];
  state.phase = 'TURN_BEGIN';
  state.turnNumber = 1;
  state.currentTurnIndex = 0;
  state.turnDeadlineAt = turnDeadlineAt;
  state.stateVersion += 1;

  const firstPlayerId = state.turnOrder[0];
  events.push({
    type: 'GameStarted',
    seq: nextSeq(state),
    matchSeed: state.matchSeed,
    turnOrder: [...state.turnOrder],
    firstPlayerId,
  });
  events.push({
    type: 'TurnStarted',
    seq: nextSeq(state),
    playerId: firstPlayerId,
    turnNumber: 1,
  });

  return { state, events };
}

export function applyItem(
  inputState: GameState,
  playerId: string,
  itemIndex: number,
): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'TURN_BEGIN') {
    throw new Error(`Items can only be used in TURN_BEGIN (current: ${state.phase})`);
  }
  const active = getActivePlayer(state);
  if (active.id !== playerId) {
    throw new Error('Only active player can use an item');
  }
  const item = active.items[itemIndex];
  if (!item) {
    throw new Error(`No item at index ${itemIndex}`);
  }

  const events: GameEvent[] = [];
  active.items.splice(itemIndex, 1);
  active.stats.itemsUsed += 1;

  if (item === 'shield') {
    active.shields += 1;
    events.push({
      type: 'ItemUsed',
      seq: nextSeq(state),
      playerId,
      item,
      effectDescription: 'Perisai Anti-Ular aktif melingkari pionmu!',
      shieldsDelta: 1,
    });
  } else if (item === 'golden_dice') {
    active.activeGoldenDice = true;
    events.push({
      type: 'ItemUsed',
      seq: nextSeq(state),
      playerId,
      item,
      effectDescription: 'Dadu Emas siap! Lemparan berikutnya keluar 2 dadu!',
    });
  } else if (item === 'brake') {
    active.activeBrake = true;
    events.push({
      type: 'ItemUsed',
      seq: nextSeq(state),
      playerId,
      item,
      effectDescription: 'Rem Mendadak aktif! Langkah maksimal 3 kotak.',
    });
  } else if (item === 'surprise') {
    const rng = deriveRng(state.matchSeed, state.eventSeq + 1, 'surprise');
    const roll = rng.nextInt(0, 3);
    if (roll === 0) {
      const from = active.position;
      const to = Math.min(99, from + 2);
      const path = to > from ? Array.from({ length: to - from }, (_, i) => from + i + 1) : [];
      active.position = to;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        effectDescription: 'Roket Mini! Pionmu melesat +2 kotak ke depan!',
      });
      if (path.length > 0) {
        events.push({
          type: 'PawnMoved',
          seq: nextSeq(state),
          playerId,
          from,
          to,
          path,
          bounced: false,
          reason: 'surprise',
        });
      }
    } else if (roll === 1) {
      active.stars += 3;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        effectDescription: 'Hujan Bintang! Dapat +3 ★ gratis!',
        starsDelta: 3,
      });
    } else if (roll === 2) {
      const rivals = state.players.filter((p) => p.id !== playerId && p.position > 1);
      if (rivals.length > 0) {
        rivals.sort((a, b) => b.position - a.position);
        const target = rivals[0];
        const from = target.position;
        const to = Math.max(1, from - 1);
        target.position = to;
        events.push({
          type: 'ItemUsed',
          seq: nextSeq(state),
          playerId,
          item,
          effectDescription: `Angin Iseng! ${target.name} tertiup mundur 1 kotak!`,
          targetPlayerId: target.id,
        });
        events.push({
          type: 'PawnMoved',
          seq: nextSeq(state),
          playerId: target.id,
          from,
          to,
          path: [to],
          bounced: false,
          reason: 'surprise',
        });
      } else {
        active.stars += 2;
        events.push({
          type: 'ItemUsed',
          seq: nextSeq(state),
          playerId,
          item,
          effectDescription: 'Angin Iseng tak kena siapa-siapa, dapat hiburan +2 ★!',
          starsDelta: 2,
        });
      }
    } else {
      active.shields += 1;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        effectDescription: 'Kejutan! Muncul Perisai Anti-Ular cadangan!',
        shieldsDelta: 1,
      });
    }
  } else if (item === 'magnet_star') {
    const rivalsWithStars = state.players.filter((p) => p.id !== playerId && p.stars > 0);
    if (rivalsWithStars.length > 0) {
      rivalsWithStars.sort((a, b) => b.stars - a.stars || b.position - a.position);
      const target = rivalsWithStars[0];
      target.stars -= 1;
      active.stars += 1;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        targetPlayerId: target.id,
        starsDelta: 1,
        effectDescription: `Magnet Bintang menarik 1 ★ dari ${target.name}!`,
      });
    } else {
      active.stars += 1;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        starsDelta: 1,
        effectDescription: 'Magnet Bintang menemukan +1 ★ berkilau!',
      });
    }
  } else if (item === 'swap_turbo') {
    active.activeTurbo = true;
    events.push({
      type: 'ItemUsed',
      seq: nextSeq(state),
      playerId,
      item,
      effectDescription: 'Sepatu Turbo aktif! +2 langkah ekstra pada lemparan berikutnya!',
    });
  } else if (item === 'star_multiplier') {
    active.activeDoubleStars = true;
    events.push({
      type: 'ItemUsed',
      seq: nextSeq(state),
      playerId,
      item,
      effectDescription: 'Jimat Ganda aktif! Hadiah bintang tantangan giliran ini 2x lipat!',
    });
  } else if (item === 'rival_brake') {
    const rivals = state.players
      .filter((p) => p.id !== playerId)
      .sort((a, b) => b.position - a.position || b.stars - a.stars);
    const target = rivals[0];
    if (target) {
      target.activeBrake = true;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        targetPlayerId: target.id,
        effectDescription: `Jebakan Rem dipasang ke ${target.name}! Dadu berikutnya maksimal 3!`,
      });
    } else {
      active.stars += 1;
      events.push({
        type: 'ItemUsed',
        seq: nextSeq(state),
        playerId,
        item,
        starsDelta: 1,
        effectDescription: 'Tidak ada lawan di papan, Jebakan Rem memberi +1 ★ bonus!',
      });
    }
  }

  updatePlayerMission(state, active, 'use_2_items', events);

  state.stateVersion += 1;
  return { state, events };
}

function executePawnMove(
  state: GameState,
  player: Player,
  diceValue: number,
  events: GameEvent[],
  usedTurbo = false,
): void {
  const effectiveSteps = computeEffectiveDiceSteps(diceValue, usedTurbo, player.pawn);
  const move = computeMove(player.position, effectiveSteps, state.board.size);
  player.position = move.to;

  if (diceValue === 6 && player.consecutiveSixes < 2) {
    player.consecutiveSixes += 1;
    player.extraRollsPending += 1;
  } else {
    player.consecutiveSixes = 0;
  }

  events.push({
    type: 'PawnMoved',
    seq: nextSeq(state),
    playerId: player.id,
    from: move.from,
    to: move.to,
    path: move.path,
    bounced: move.bounced,
    reason: 'dice',
  });
  state.phase = 'TILE_CHECK';
}

export function rollDice(
  inputState: GameState,
  playerId: string,
  forcedDice?: number | [number, number],
): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'TURN_BEGIN') {
    throw new Error(`Cannot roll dice in phase ${state.phase}`);
  }
  const active = getActivePlayer(state);
  if (active.id !== playerId) {
    throw new Error('Only active player can roll dice');
  }

  const events: GameEvent[] = [];
  const rng = deriveRng(state.matchSeed, state.eventSeq + 1, 'roll');
  const maxFace = active.activeBrake ? 3 : 6;
  const usedBrake = active.activeBrake;
  const usedGoldenDice = active.activeGoldenDice;
  const usedTurbo = active.activeTurbo;

  let diceValues: number[];
  if (usedGoldenDice) {
    const d1 = Array.isArray(forcedDice) ? forcedDice[0] : rng.nextInt(1, maxFace);
    const d2 = Array.isArray(forcedDice) ? forcedDice[1] : rng.nextInt(1, maxFace);
    diceValues = [Math.min(maxFace, Math.max(1, d1)), Math.min(maxFace, Math.max(1, d2))];
  } else {
    const val = typeof forcedDice === 'number' ? forcedDice : rng.nextInt(1, maxFace);
    diceValues = [Math.min(maxFace, Math.max(1, val))];
  }

  active.activeBrake = false;
  active.activeGoldenDice = false;
  active.activeTurbo = false;
  active.stats.rolls += 1;

  state.pendingRoll = {
    playerId,
    diceValues,
    chosenValue: usedGoldenDice ? undefined : diceValues[0],
    usedBrake,
    usedGoldenDice,
    usedTurbo,
  };

  events.push({
    type: 'DiceRolled',
    seq: nextSeq(state),
    playerId,
    diceValues,
    needsChoice: usedGoldenDice,
    usedGoldenDice,
    usedBrake,
    usedTurbo,
  });

  if (usedGoldenDice) {
    state.phase = 'ROLL';
  } else {
    state.phase = 'MOVE';
    executePawnMove(state, active, diceValues[0], events, usedTurbo);
  }

  state.stateVersion += 1;
  return { state, events };
}

export function chooseDice(
  inputState: GameState,
  playerId: string,
  choiceIndex: 0 | 1,
): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'ROLL' || !state.pendingRoll) {
    throw new Error(`No golden dice choice pending in phase ${state.phase}`);
  }
  if (state.pendingRoll.playerId !== playerId) {
    throw new Error('Only active player can choose dice');
  }
  const value = state.pendingRoll.diceValues[choiceIndex];
  if (typeof value !== 'number') {
    throw new Error(`Invalid dice choice index: ${choiceIndex}`);
  }

  const events: GameEvent[] = [];
  const active = getActivePlayer(state);
  state.pendingRoll.chosenValue = value;

  events.push({
    type: 'DiceChosen',
    seq: nextSeq(state),
    playerId,
    value,
  });

  state.phase = 'MOVE';
  executePawnMove(state, active, value, events, Boolean(state.pendingRoll.usedTurbo));
  state.stateVersion += 1;
  return { state, events };
}

export function resolveTile(
  inputState: GameState,
  tiles: readonly Tile[],
  nowMs = 0,
  duelOpponentId?: string,
): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'TILE_CHECK') {
    throw new Error(`resolveTile called in invalid phase ${state.phase}`);
  }
  const active = getActivePlayer(state);
  let tile = tiles.find((t) => t.id === active.position);
  if (!tile) {
    throw new Error(`Tile ${active.position} not found`);
  }

  const events: GameEvent[] = [];

  if (tile.id === 1 || tile.archetype === 'start') {
    state.phase = 'TURN_END';
    state.pendingRoll = null;
    state.stateVersion += 1;
    return { state, events };
  }

  const isLiveBoard = tiles === TILES;
  if (isLiveBoard && tile.id > 1 && tile.id < 100) {
    const special = getBoardSpecialTile(tile.id);
    if (special) {
      if (special.kind === 'star_fountain') {
        active.stars += 2;
        events.push({
          type: 'BoardSpecialTriggered',
          seq: nextSeq(state),
          playerId: active.id,
          tileId: tile.id,
          kind: special.kind,
          starsDelta: 2,
        });
      } else if (special.kind === 'supply_crate') {
        const granted = tryGrantItem(state, active, 'board_event', events, 1);
        if (!granted) {
          active.stars += 2;
        }
        events.push({
          type: 'BoardSpecialTriggered',
          seq: nextSeq(state),
          playerId: active.id,
          tileId: tile.id,
          kind: special.kind,
          grantedItem: granted ?? undefined,
          starsDelta: granted ? undefined : 2,
        });
      } else if (special.kind === 'shield_shrine') {
        active.shields += 1;
        events.push({
          type: 'BoardSpecialTriggered',
          seq: nextSeq(state),
          playerId: active.id,
          tileId: tile.id,
          kind: special.kind,
          shieldsDelta: 1,
        });
      } else if (special.kind === 'tailwind') {
        const originTileId = tile.id;
        const targetTileId = computeMove(originTileId, 2, state.board.size).to;
        events.push({
          type: 'BoardSpecialTriggered',
          seq: nextSeq(state),
          playerId: active.id,
          tileId: originTileId,
          kind: special.kind,
          movedTo: targetTileId,
        });
        movePlayerDirect(state, active, 2, 'bonus_advance', events);
        const shiftedTile = tiles.find((t) => t.id === active.position);
        if (shiftedTile) {
          tile = shiftedTile;
        }
      }
    }
  }

  const runtimeSeed = deriveChallengeRuntimeSeed(state.matchSeed, state.eventSeq + 1, tile.id);
  const isJunction = Boolean(findLadderAt(state.board, tile.id) || findSnakeAt(state.board, tile.id));

  let chosenArchetype = tile.archetype;
  let chosenMode = tile.mode;

  if (isLiveBoard && tile.id > 1 && tile.id < 100) {
    // Shuffled epoch deck cycles challenges cleanly; ladders and snakes strictly run solo challenges.
    const pool = isJunction
      ? PLAYABLE_TILE_ARCHETYPES.filter((a) => a !== 'gift_trap' && a !== 'lucky_wheel' && a !== 'quick_duel')
      : PLAYABLE_TILE_ARCHETYPES;
    const totalRolls = Math.max(
      1,
      state.players.reduce((sum, p) => sum + p.stats.rolls, 0),
    );
    const deckSize = pool.length;
    const drawIndex = totalRolls - 1;
    const epoch = Math.floor(drawIndex / deckSize);
    const posInEpoch = drawIndex % deckSize;
    const epochDeck = new SeededRng(hashSeed(state.matchSeed, epoch, isJunction ? 'j_deck' : 'challenge_deck')).shuffle(
      pool,
    );
    if (epoch > 0) {
      const prevDeck = new SeededRng(
        hashSeed(state.matchSeed, epoch - 1, isJunction ? 'j_deck' : 'challenge_deck'),
      ).shuffle(pool);
      if (epochDeck[0] === prevDeck[deckSize - 1]) {
        [epochDeck[0], epochDeck[1]] = [epochDeck[1], epochDeck[0]];
      }
    }
    chosenArchetype = epochDeck[posInEpoch];
    chosenMode = chosenArchetype === 'quick_duel' && state.players.length >= 2 && !isJunction ? 'duel' : 'solo';
  } else if (tile.id === 100) {
    chosenArchetype = 'boss_doodle';
    chosenMode = 'solo';
  } else {
    chosenMode =
      (chosenArchetype === 'quick_duel' || tile.mode === 'duel') && state.players.length >= 2 && !isJunction
        ? 'duel'
        : 'solo';
  }

  const spec = ARCHETYPE_REGISTRY[chosenArchetype];
  const params = buildChallengeRuntimeParams(
    chosenArchetype,
    tile.params,
    runtimeSeed,
    tile.difficulty,
    tile.id,
    isLiveBoard,
  );

  let participantIds: string[] = [active.id];
  let resolvedOpponentId: string | undefined;
  let awaitingDuelPick = false;

  if (chosenMode === 'duel') {
    const candidates = state.players.filter((p) => p.id !== active.id);
    const explicitOpp = duelOpponentId ? candidates.find((c) => c.id === duelOpponentId) : undefined;
    if (explicitOpp) {
      resolvedOpponentId = explicitOpp.id;
      participantIds = [active.id, explicitOpp.id];
    } else if (active.isBot && candidates.length > 0) {
      const botOpp = [...candidates].sort((a, b) => b.position - a.position || b.stars - a.stars)[0];
      resolvedOpponentId = botOpp.id;
      participantIds = [active.id, botOpp.id];
    } else if (candidates.length > 0) {
      // Wait for challenger to choose a rival before exposing the duel to any opponent.
      resolvedOpponentId = undefined;
      participantIds = [active.id];
      awaitingDuelPick = true;
    } else {
      chosenMode = 'solo';
    }
  }

  const durationMs = spec.baseDurationMs + getChallengeBonusDurationMs(active.pawn);
  const challenge: ActiveChallenge = {
    tileId: tile.id,
    archetype: chosenArchetype,
    mode: chosenMode,
    difficulty: tile.difficulty,
    title: isLiveBoard ? spec.displayName : tile.title,
    flavorText: isLiveBoard ? spec.instruction : tile.flavorText,
    seed: runtimeSeed,
    params,
    reward: tile.reward,
    penalty: tile.penalty,
    ownerPlayerId: active.id,
    opponentId: resolvedOpponentId,
    awaitingDuelPick: awaitingDuelPick || undefined,
    participantIds,
    submissions: {},
    deadlineAt: nowMs + (awaitingDuelPick ? 12_000 + durationMs : durationMs + 1500),
    durationMs,
  };

  state.activeChallenge = challenge;
  state.phase = 'CHALLENGE';
  state.stateVersion += 1;

  events.push({
    type: 'ChallengeStarted',
    seq: nextSeq(state),
    challenge,
  });

  return { state, events };
}

export function selectDuelOpponent(
  inputState: GameState,
  ownerPlayerId: string,
  opponentId?: string,
  nowMs = Date.now(),
): GameState {
  const state = cloneState(inputState);
  if (state.phase !== 'CHALLENGE' || !state.activeChallenge) {
    throw new Error('No active challenge to select duel opponent for');
  }
  const ch = state.activeChallenge;
  if (ch.mode !== 'duel') {
    throw new Error('Only duel challenges allow selecting an opponent');
  }
  if (ch.ownerPlayerId !== ownerPlayerId) {
    throw new Error('Only challenge owner can choose the duel opponent');
  }
  const candidates = state.players.filter((p) => p.id !== ch.ownerPlayerId);
  if (candidates.length === 0) {
    ch.awaitingDuelPick = false;
    ch.opponentId = undefined;
    ch.participantIds = [ch.ownerPlayerId];
    state.stateVersion += 1;
    return state;
  }
  const picked =
    (opponentId ? candidates.find((c) => c.id === opponentId) : undefined) ??
    [...candidates].sort((a, b) => b.position - a.position || b.stars - a.stars)[0];
  ch.opponentId = picked.id;
  ch.participantIds = [ch.ownerPlayerId, picked.id];
  ch.awaitingDuelPick = false;
  ch.deadlineAt = nowMs + ch.durationMs + 1500;
  state.stateVersion += 1;
  return state;
}

export function recordChallengeSubmission(
  inputState: GameState,
  submission: ChallengeSubmission,
): GameState {
  const state = cloneState(inputState);
  if (state.phase !== 'CHALLENGE' || !state.activeChallenge) {
    throw new Error('No active challenge to submit to');
  }
  const ch = state.activeChallenge;
  if (ch.awaitingDuelPick) {
    throw new Error('Waiting for challenger to select duel opponent');
  }
  const allowed =
    ch.participantIds.includes(submission.playerId) &&
    (ch.mode === 'duel'
      ? submission.playerId === ch.ownerPlayerId || submission.playerId === ch.opponentId
      : ch.mode === 'solo'
        ? submission.playerId === ch.ownerPlayerId
        : true);
  if (!allowed) {
    throw new Error(`Player ${submission.playerId} is not a participant in this challenge`);
  }
  ch.submissions[submission.playerId] = submission;
  state.stateVersion += 1;
  return state;
}

function tryGrantItem(
  state: GameState,
  player: Player,
  source: 'challenge' | 'trailing_bonus' | 'wheel' | 'gift' | 'board_event' | 'mission',
  events: GameEvent[],
  forcedChance?: number,
): ItemType | null {
  if (player.items.length >= 2) return null;

  const minPos = Math.min(...state.players.map((p) => p.position));
  const maxPos = Math.max(...state.players.map((p) => p.position));
  const isTrailing = player.position === minPos && player.position < maxPos;

  const rng = deriveRng(state.matchSeed, state.eventSeq + 1, `item_${player.id}`);
  const presetTrailing =
    state.rulePreset === 'pesta_item' ? 0.78 : state.rulePreset === 'kilat' ? 0.6 : 0.45;
  const presetNormal =
    state.rulePreset === 'pesta_item' ? 0.58 : state.rulePreset === 'kilat' ? 0.4 : 0.22;
  const chance = forcedChance ?? (isTrailing ? presetTrailing : presetNormal);
  if (!rng.chance(chance)) return null;

  const item = rng.pick(ALL_ITEMS);
  player.items.push(item);
  events.push({
    type: 'ItemGained',
    seq: nextSeq(state),
    playerId: player.id,
    item,
    source: isTrailing && forcedChance === undefined ? 'trailing_bonus' : source,
  });
  return item;
}

function movePlayerDirect(
  state: GameState,
  player: Player,
  delta: number,
  reason: 'bonus_advance' | 'penalty_retreat',
  events: GameEvent[],
): void {
  if (delta === 0) return;
  const from = player.position;
  // Bonus advance never auto-skips onto 100 (Bos Doodle requires dice landing)
  const target =
    delta > 0 ? Math.min(99, from + delta) : Math.max(1, from + delta);
  if (target === from) return;

  const step = target > from ? 1 : -1;
  const path: number[] = [];
  for (let p = from + step; step > 0 ? p <= target : p >= target; p += step) {
    path.push(p);
  }
  player.position = target;
  events.push({
    type: 'PawnMoved',
    seq: nextSeq(state),
    playerId: player.id,
    from,
    to: target,
    path,
    bounced: false,
    reason,
  });
}

function resolveJunctionAtPosition(
  state: GameState,
  owner: Player,
  allowChallengeDodge: boolean,
  events: GameEvent[],
  visitedTiles: Set<number>,
): 'ladder' | 'snake_saved' | 'snake_bitten' | 'none' {
  const tileId = owner.position;
  if (visitedTiles.has(tileId)) {
    return 'none';
  }

  const ladder = findLadderAt(state.board, tileId);
  if (ladder) {
    visitedTiles.add(tileId);
    owner.position = ladder.to;
    owner.stats.laddersClimbed += 1;
    if (owner.pawn === 'kucing') {
      owner.stars += 1;
    }
    events.push({
      type: 'LadderClimbed',
      seq: nextSeq(state),
      playerId: owner.id,
      ladderId: ladder.id,
      from: ladder.from,
      to: ladder.to,
    });
    updatePlayerMission(state, owner, 'climb_2', events);
    return 'ladder';
  }

  const snake = findSnakeAt(state.board, tileId);
  if (!snake) {
    return 'none';
  }

  visitedTiles.add(tileId);
  if (allowChallengeDodge) {
    owner.stats.snakesDodged += 1;
    if (owner.pawn === 'jamur') {
      owner.stars += 1;
    }
    events.push({
      type: 'SnakeBitten',
      seq: nextSeq(state),
      playerId: owner.id,
      snakeId: snake.id,
      from: snake.from,
      to: snake.from,
      blockedByShield: false,
      dodgedByChallenge: true,
    });
    return 'snake_saved';
  }

  if (owner.shields > 0 || owner.items.includes('shield')) {
    if (owner.shields > 0) {
      owner.shields -= 1;
    } else {
      const shieldIdx = owner.items.indexOf('shield');
      if (shieldIdx >= 0) owner.items.splice(shieldIdx, 1);
    }
    owner.stats.snakesDodged += 1;
    if (owner.pawn === 'jamur') {
      owner.stars += 1;
    }
    events.push({
      type: 'SnakeBitten',
      seq: nextSeq(state),
      playerId: owner.id,
      snakeId: snake.id,
      from: snake.from,
      to: snake.from,
      blockedByShield: true,
      dodgedByChallenge: false,
    });
    return 'snake_saved';
  }

  owner.position = snake.to;
  owner.stats.snakesBitten += 1;
  events.push({
    type: 'SnakeBitten',
    seq: nextSeq(state),
    playerId: owner.id,
    snakeId: snake.id,
    from: snake.from,
    to: snake.to,
    blockedByShield: false,
    dodgedByChallenge: false,
  });
  return 'snake_bitten';
}

export function computePodium(state: GameState): PodiumEntry[] {
  const sorted = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    if (b.position !== a.position) return b.position - a.position;
    if (b.stars !== a.stars) return b.stars - a.stars;
    return b.stats.challengesWon - a.stats.challengesWon;
  });

  return sorted.map((p, idx) => ({
    rank: idx + 1,
    playerId: p.id,
    name: p.name,
    pawn: p.pawn,
    color: p.color,
    accessory: p.accessory ?? 'none',
    position: p.position,
    stars: p.stars,
    isWinner: p.id === state.winnerId,
  }));
}

export function checkWin(state: GameState): string | null {
  return state.winnerId;
}

export function applyChallengeResult(inputState: GameState): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'CHALLENGE' || !state.activeChallenge) {
    throw new Error(`Cannot apply challenge result in phase ${state.phase}`);
  }

  const challenge = state.activeChallenge;
  const owner = getPlayerById(state, challenge.ownerPlayerId);
  const landedTile = owner.position;
  const events: GameEvent[] = [];

  state.phase = 'APPLY_RESULT';

  // Ensure every participant has a submission (bots simulate, missing players fail)
  const validatedOutcomes: Array<{
    playerId: string;
    success: boolean;
    score: number;
    reason?: string;
  }> = [];

  for (const pid of challenge.participantIds) {
    const participant = getPlayerById(state, pid);
    let sub = challenge.submissions[pid];
    if (!sub) {
      if (participant.isBot) {
        const botRng = new SeededRng(hashSeed(challenge.seed, pid, 'bot'));
        sub = simulateBotChallengeSubmission(challenge, pid, participant.botDifficulty, botRng);
      } else {
        sub = {
          playerId: pid,
          claimedSuccess: false,
          score: 0,
          inputLog: { startedAt: 0, completedAt: 0 },
        };
      }
    }
    const verdict = validateChallengeSubmission(challenge, sub);
    validatedOutcomes.push({
      playerId: pid,
      success: verdict.success,
      score: verdict.score,
      reason: verdict.reason,
    });
  }

  // Duel resolution: owner wins if owner succeeded AND scored >= opponent (or opponent failed)
  if (challenge.mode === 'duel' && challenge.opponentId) {
    const ownerRes = validatedOutcomes.find((o) => o.playerId === owner.id)!;
    const oppRes = validatedOutcomes.find((o) => o.playerId === challenge.opponentId)!;
    const ownerWon =
      ownerRes.success && (!oppRes.success || ownerRes.score >= oppRes.score);
    ownerRes.success = ownerWon;
    oppRes.success = !ownerWon && oppRes.success;
  }

  // Rank participants
  const ranked = [...validatedOutcomes].sort((a, b) => {
    if (a.success !== b.success) return a.success ? -1 : 1;
    return b.score - a.score;
  });
  const outcomes: ChallengeParticipantOutcome[] = ranked.map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));

  const ownerOutcome = outcomes.find((o) => o.playerId === owner.id)!;
  owner.stats.challengesTotal += 1;
  if (ownerOutcome.success) {
    owner.stats.challengesWon += 1;
  }

  const starsDelta: Record<string, number> = {};
  const shieldsDelta: Record<string, number> = {};
  let bonusApplied: string | undefined;
  let penaltyApplied: string | undefined;
  let antiFrustrationSaved = false;
  let serverSummaryText = '';
  const usedDoubleStars = Boolean(owner.activeDoubleStars);
  owner.activeDoubleStars = false;

  // Award all-play participants
  if (challenge.mode === 'all_play') {
    for (const out of outcomes) {
      const p = getPlayerById(state, out.playerId);
      if (out.rank === 1 && out.success) {
        const partyPerk = p.pawn === 'bebek' ? 1 : 0;
        const bonusStars = (p.id === owner.id ? challenge.reward.stars + 1 : 3) + partyPerk;
        p.stars += bonusStars;
        starsDelta[p.id] = bonusStars;
      } else if (out.success) {
        p.stars += 1;
        starsDelta[p.id] = 1;
      } else {
        starsDelta[p.id] = 0;
      }
    }
  }

  // Special handling for lucky_wheel and gift_trap
  let deferredAdvance = 0;
  let deferredRetreat = 0;

  if (challenge.archetype === 'lucky_wheel') {
    const slices = challenge.params.slices as Array<{
      label: string;
      kind: string;
      stars: number;
      advance: number;
    }>;
    const idx = Number(challenge.params.serverOutcomeIndex ?? 0);
    const slice = slices[idx] ?? slices[0];
    const awardedStars = usedDoubleStars && slice.stars > 0 ? slice.stars * 2 : slice.stars;
    owner.stars = Math.max(0, owner.stars + awardedStars);
    starsDelta[owner.id] = awardedStars;
    if (usedDoubleStars && slice.stars > 0) {
      bonusApplied = 'Jimat 2x ★';
    }
    if (slice.kind === 'shield') {
      owner.shields += 1;
      shieldsDelta[owner.id] = (shieldsDelta[owner.id] ?? 0) + 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Perisai Anti-Ular` : 'Perisai Anti-Ular';
    } else if (slice.kind === 'item') {
      tryGrantItem(state, owner, 'wheel', events, 1);
      bonusApplied = bonusApplied ? `${bonusApplied} • Item Acak` : 'Item Acak';
    } else if (slice.advance > 0) {
      deferredAdvance = slice.advance;
      bonusApplied = bonusApplied ? `${bonusApplied} • Maju ${slice.advance} kotak` : `Maju ${slice.advance} kotak`;
    } else if (slice.advance < 0) {
      deferredRetreat = Math.abs(slice.advance);
      penaltyApplied = `Mundur ${deferredRetreat} kotak`;
    }
    serverSummaryText = `Roda berhenti di: ${slice.label}`;
    owner.consecutivePenalties = slice.kind === 'slip' ? owner.consecutivePenalties + 1 : 0;
  } else if (challenge.archetype === 'gift_trap') {
    const variant = challenge.params.variant as (typeof GIFT_TRAP_VARIANTS)[number];
    const awardedStars =
      usedDoubleStars && variant.starsDelta > 0 ? variant.starsDelta * 2 : variant.starsDelta;
    owner.stars = Math.max(0, owner.stars + awardedStars);
    starsDelta[owner.id] = awardedStars;
    if (usedDoubleStars && variant.starsDelta > 0) {
      bonusApplied = 'Jimat 2x ★';
    }
    if (variant.grantShield) {
      owner.shields += 1;
      shieldsDelta[owner.id] = (shieldsDelta[owner.id] ?? 0) + 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Perisai Anti-Ular` : 'Perisai Anti-Ular';
    }
    if (variant.grantItem) {
      tryGrantItem(state, owner, 'gift', events, 1);
      bonusApplied = bonusApplied ? `${bonusApplied} • Item Kejutan` : 'Item Kejutan';
    }
    if (variant.moveDelta > 0) {
      deferredAdvance = variant.moveDelta;
      bonusApplied = bonusApplied ? `${bonusApplied} • Maju +${variant.moveDelta}` : `Maju +${variant.moveDelta}`;
      owner.consecutivePenalties = 0;
    } else if (variant.moveDelta < 0) {
      if (owner.consecutivePenalties >= 2) {
        antiFrustrationSaved = true;
        penaltyApplied = 'Diselamatkan Kartu Kasihan!';
      } else {
        deferredRetreat = Math.abs(variant.moveDelta);
        penaltyApplied = `Mundur ${deferredRetreat} kotak`;
        owner.consecutivePenalties += 1;
      }
    } else {
      owner.consecutivePenalties = 0;
    }
    serverSummaryText = `${variant.title}: ${variant.flavorText}`;
  } else if (ownerOutcome.success) {
    owner.consecutivePenalties = 0;
    owner.challengeStreak += 1;
    if (challenge.mode !== 'all_play') {
      const wonBaseStars = usedDoubleStars ? challenge.reward.stars * 2 : challenge.reward.stars;
      owner.stars += wonBaseStars;
      starsDelta[owner.id] = wonBaseStars;
      if (usedDoubleStars && challenge.reward.stars > 0) {
        bonusApplied = 'Jimat 2x ★';
      }
    } else {
      starsDelta[owner.id] = starsDelta[owner.id] ?? 0;
    }
    if (challenge.reward.bonusType === 'advance') {
      deferredAdvance = challenge.reward.bonusValue ?? 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Maju +${deferredAdvance} kotak` : `Maju +${deferredAdvance} kotak`;
    } else if (challenge.reward.bonusType === 'shield') {
      owner.shields += 1;
      shieldsDelta[owner.id] = (shieldsDelta[owner.id] ?? 0) + 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Perisai Anti-Ular` : 'Perisai Anti-Ular';
    } else if (challenge.reward.bonusType === 'extra_dice') {
      owner.extraRollsPending += 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Dadu Ekstra!` : 'Dadu Ekstra!';
      events.push({
        type: 'ExtraRollGranted',
        seq: nextSeq(state),
        playerId: owner.id,
        reason: 'challenge_bonus',
      });
    }
    if (owner.challengeStreak >= 2) {
      owner.stars += 1;
      starsDelta[owner.id] = (starsDelta[owner.id] ?? 0) + 1;
      const streakTag = `Kombo ${owner.challengeStreak}x (+1★)`;
      bonusApplied = bonusApplied ? `${bonusApplied} • ${streakTag}` : streakTag;
    }
    if (challenge.mode === 'duel' && owner.pawn === 'bebek') {
      owner.stars += 1;
      starsDelta[owner.id] = (starsDelta[owner.id] ?? 0) + 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Semangat Pesta +1★` : 'Semangat Pesta +1★';
    }
    const leaderPos = state.players.reduce((mx, p) => Math.max(mx, p.position), 1);
    if (leaderPos - landedTile >= 25) {
      owner.stars += 1;
      starsDelta[owner.id] = (starsDelta[owner.id] ?? 0) + 1;
      bonusApplied = bonusApplied ? `${bonusApplied} • Bonus Ngejar +1★` : 'Bonus Ngejar +1★';
    }
    if (state.rulePreset === 'kilat' && landedTile < 99) {
      deferredAdvance += 1;
      bonusApplied = bonusApplied ? `${bonusApplied} & Kilat +1` : 'Bonus Kilat +1 kotak';
    }
    // 3-win streak guarantees an item box (or +2 ★ if backpack full)
    if (owner.challengeStreak >= 3 && owner.challengeStreak % 3 === 0) {
      const granted = tryGrantItem(state, owner, 'challenge', events, 1);
      if (!granted) {
        owner.stars += 2;
        starsDelta[owner.id] = (starsDelta[owner.id] ?? 0) + 2;
        bonusApplied = bonusApplied ? `${bonusApplied} • Bonus Kombo +2★` : 'Bonus Kombo +2★';
      }
    } else {
      // Chance to find an item on challenge win (higher for trailing player!)
      tryGrantItem(state, owner, 'challenge', events);
    }
    serverSummaryText = `BERHASIL! ${owner.name} dapat +${starsDelta[owner.id] ?? 0} ★${bonusApplied ? ` (${bonusApplied})` : ''}!`;
  } else {
    // Owner failed!
    owner.challengeStreak = 0;
    if (challenge.mode !== 'all_play') {
      starsDelta[owner.id] = 0;
    }
    // If duel opponent won, give opponent +2 stars (Wekwek gets +3)!
    if (challenge.mode === 'duel' && challenge.opponentId) {
      const opp = getPlayerById(state, challenge.opponentId);
      const oppStars = opp.pawn === 'bebek' ? 3 : 2;
      opp.stars += oppStars;
      starsDelta[opp.id] = oppStars;
    }

    if (landedTile === 100) {
      // Failing Boss Doodle always bounces off the gate to 97 so player can try again next turn
      deferredRetreat = challenge.penalty.value ?? 3;
      penaltyApplied = `Bos Doodle menangkis! Mundur ${deferredRetreat} kotak`;
      owner.consecutivePenalties += 1;
    } else if (challenge.penalty.type !== 'none') {
      if (owner.consecutivePenalties >= 2) {
        antiFrustrationSaved = true;
        penaltyApplied = 'Kartu Kasihan aktif! Tidak kena penalti.';
      } else if (challenge.penalty.type === 'retreat') {
        deferredRetreat = challenge.penalty.value ?? 1;
        penaltyApplied = `Mundur ${deferredRetreat} kotak`;
        owner.consecutivePenalties += 1;
      } else if (challenge.penalty.type === 'skip_turn') {
        owner.skipTurns += challenge.penalty.value ?? 1;
        penaltyApplied = 'Lewat 1 giliran';
        owner.consecutivePenalties += 1;
      }
    }
    serverSummaryText = `YAAH... ${owner.name} gagal tantangan.${penaltyApplied ? ` (${penaltyApplied})` : ''}`;
  }

  events.push({
    type: 'ChallengeResolved',
    seq: nextSeq(state),
    tileId: landedTile,
    archetype: challenge.archetype,
    ownerPlayerId: owner.id,
    outcomes,
    starsDelta,
    shieldsDelta: Object.keys(shieldsDelta).length > 0 ? shieldsDelta : undefined,
    bonusApplied,
    penaltyApplied,
    antiFrustrationSaved,
    serverSummaryText,
  });

  if (ownerOutcome.success) {
    updatePlayerMission(state, owner, 'win_3', events);
    if (owner.challengeStreak > 0) {
      updatePlayerMission(state, owner, 'streak_2', events, owner.challengeStreak);
    }
  }

  // Check Tile 100 Victory!
  if (landedTile === 100 && ownerOutcome.success) {
    state.winnerId = owner.id;
    state.podium = computePodium(state);
    state.phase = 'GAME_OVER';
    state.activeChallenge = null;
    state.pendingRoll = null;
    state.stateVersion += 1;
    events.push({
      type: 'GameWon',
      seq: nextSeq(state),
      winnerId: owner.id,
      podium: state.podium,
    });
    return { state, events };
  }

  // Step 3: Resolve ladder or snake at `landedTile`, plus any junction reached via deferred advance/retreat (guarded against cycles).
  const visitedJunctionTiles = new Set<number>();
  const initialJunction = resolveJunctionAtPosition(
    state,
    owner,
    ownerOutcome.success,
    events,
    visitedJunctionTiles,
  );

  if (deferredAdvance > 0 && initialJunction !== 'snake_bitten') {
    const beforeAdvance = owner.position;
    movePlayerDirect(state, owner, deferredAdvance, 'bonus_advance', events);
    if (owner.position !== beforeAdvance) {
      resolveJunctionAtPosition(state, owner, false, events, visitedJunctionTiles);
    }
  } else if (deferredRetreat > 0 && initialJunction === 'none') {
    const beforeRetreat = owner.position;
    movePlayerDirect(state, owner, -deferredRetreat, 'penalty_retreat', events);
    if (owner.position !== beforeRetreat) {
      resolveJunctionAtPosition(state, owner, false, events, visitedJunctionTiles);
    }
  }

  state.activeChallenge = null;
  state.pendingRoll = null;

  if (owner.extraRollsPending > 0) {
    state.phase = 'EXTRA_ROLL';
    events.push({
      type: 'ExtraRollGranted',
      seq: nextSeq(state),
      playerId: owner.id,
      reason: 'rolled_six',
    });
  } else {
    state.phase = 'TURN_END';
  }

  state.stateVersion += 1;
  return { state, events };
}

/**
 * Lets the active player exchange 4 stars for a surprise tactical item before rolling.
 */
export function buyStarItem(inputState: GameState, playerId: string): StepResult {
  const state = cloneState(inputState);
  if (state.phase !== 'TURN_BEGIN') {
    throw new Error(`Star shop only available in TURN_BEGIN (current: ${state.phase})`);
  }
  const active = getActivePlayer(state);
  if (active.id !== playerId) {
    throw new Error('Only active player can buy an item');
  }
  const shopCost = getPlayerShopCost(active.pawn);
  if (active.stars < shopCost) {
    throw new Error(`Butuh minimal ${shopCost} ★ untuk membeli Kotak Item!`);
  }
  if (active.items.length >= 2) {
    throw new Error('Tas itemmu sudah penuh (maksimal 2 item)!');
  }

  const events: GameEvent[] = [];
  active.stars -= shopCost;
  const rng = deriveRng(state.matchSeed, state.eventSeq + 1, 'star_shop');
  const item = rng.pick(ALL_ITEMS);
  active.items.push(item);

  events.push({
    type: 'ItemGained',
    seq: nextSeq(state),
    playerId,
    item,
    source: 'star_shop',
    starsCost: shopCost,
  });

  state.stateVersion += 1;
  return { state, events };
}

export function nextTurn(inputState: GameState, turnDeadlineAt: number | null = null): StepResult {
  const state = cloneState(inputState);
  if (state.phase === 'GAME_OVER') {
    return { state, events: [] };
  }
  if (state.phase !== 'EXTRA_ROLL' && state.phase !== 'TURN_END') {
    throw new Error(`Cannot advance turn from phase ${state.phase}`);
  }

  const events: GameEvent[] = [];
  const prevPlayer = getActivePlayer(state);

  if (prevPlayer.extraRollsPending > 0) {
    prevPlayer.extraRollsPending -= 1;
    state.phase = 'TURN_BEGIN';
    state.turnDeadlineAt = turnDeadlineAt;
    state.stateVersion += 1;
    events.push({
      type: 'TurnStarted',
      seq: nextSeq(state),
      playerId: prevPlayer.id,
      turnNumber: state.turnNumber,
    });
    return { state, events };
  }

  prevPlayer.consecutiveSixes = 0;
  prevPlayer.activeDoubleStars = false;

  let attempts = 0;
  let nextIdx = state.currentTurnIndex;
  while (attempts < state.turnOrder.length) {
    nextIdx = (nextIdx + 1) % state.turnOrder.length;
    const candidate = getPlayerById(state, state.turnOrder[nextIdx]);
    if (candidate.skipTurns > 0) {
      candidate.skipTurns -= 1;
      events.push({
        type: 'TurnSkipped',
        seq: nextSeq(state),
        playerId: candidate.id,
        reason: 'Penalti lewat 1 giliran',
      });
      attempts++;
      continue;
    }
    break;
  }

  state.currentTurnIndex = nextIdx;
  state.turnNumber += 1;
  state.phase = 'TURN_BEGIN';
  state.turnDeadlineAt = turnDeadlineAt;
  state.stateVersion += 1;

  const nextPlayer = getActivePlayer(state);
  events.push({
    type: 'TurnChanged',
    seq: nextSeq(state),
    previousPlayerId: prevPlayer.id,
    nextPlayerId: nextPlayer.id,
    turnNumber: state.turnNumber,
  });
  events.push({
    type: 'TurnStarted',
    seq: nextSeq(state),
    playerId: nextPlayer.id,
    turnNumber: state.turnNumber,
  });

  return { state, events };
}
